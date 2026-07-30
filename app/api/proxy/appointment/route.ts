import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { DISPOSABLE_EMAIL_DOMAINS } from "@/lib/disposable-email-domains";
import { getConfigList, getConfigValue, getCurrentMeetingRef, getProxyMode } from "@/lib/site-gates";
import { APPOINTEE_LABEL } from "@/lib/agm-appointee";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHARE_CLASSES = ["ORD", "CCP", "BOTH"] as const;

// In-memory rate limiter - resets on cold starts; best-effort deterrent only.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 3;
const WINDOW_MS = 60 * 60 * 1000;

type Body = {
  // Honeypot. Real users never populate this - it is display:none in the
  // form, named away from any recognised autofill category, matching the
  // resolution form's fix. Unlike the interest route above, a suspected_bot
  // column exists on this table, so a filled honeypot writes a flagged row
  // instead of discarding the submission - see section 8a of the Package 5
  // brief. The silent-success response to the caller is unchanged either
  // way; only what happens server-side differs.
  hpField?: string;
  fullName?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressTown?: string;
  addressPostcode?: string;
  email?: string;
  howHeld?: string;
  computershareSrn?: string;
  nomineePlatform?: string;
  nomineePlatformOther?: string;
  sharesHeld?: string;
  shareClass?: string;
  consentGiven?: boolean;
  signatureName?: string;
  nomineeInstructionSent?: boolean;
  turnstileToken?: string;
  // Deliberately ignored if supplied. signed_at is server-generated.
  signedAt?: string;
};

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/**
 * Full proxy appointment - Package 5. Only reachable once proxy_mode is
 * "appointment", which only happens after Celtic plc issues the Notice of
 * AGM. Writes to agm_proxies, never shareholder_cases.
 *
 * The appointee rule, section 4 of the Package 5 brief: appointee_name is
 * set from APPOINTEE_LABEL below and nowhere else. There is no branch in
 * this function that reads an appointee value from `body` - not a validation
 * that rejects a client-supplied one, an absence of the code path entirely,
 * which is the point.
 */
export async function POST(req: NextRequest) {
  // ── 0. Launch gate ─────────────────────────────────────────────────────────
  const mode = await getProxyMode();
  if (mode !== "appointment") {
    return NextResponse.json(
      {
        error:
          "Proxy appointment is not open yet. It opens once Celtic plc issues the formal Notice of the Annual General Meeting.",
        closed: true,
      },
      { status: 403 }
    );
  }

  // ── 1. Rate limiting ───────────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (entry && now - entry.windowStart < WINDOW_MS) {
    entry.count += 1;
    if (entry.count >= RATE_LIMIT) {
      return bad("Too many submissions. Please try again later.", 429);
    }
  } else {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
  }

  // ── 2. Parse ───────────────────────────────────────────────────────────────
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Invalid request body.");
  }

  const supabase = getSupabase();
  const meetingRef = await getCurrentMeetingRef();
  const declarationSnapshot =
    (await getConfigValue("proxy_declaration_text")) ?? "Declaration text unavailable.";
  const privacyPolicyVersion = await getConfigValue("privacy_policy_version");

  // ── 2b. Honeypot ───────────────────────────────────────────────────────────
  // Store-and-flag, not reject-and-discard. A field named for autofill-safety
  // can still occasionally catch a genuine person; a suspected_bot row sitting
  // in the register is a click away from being released, a discarded
  // submission is a reconstruction from a log line CSL may never see.
  if (body.hpField) {
    const email = body.email?.trim().toLowerCase() || `unknown-${Date.now()}@invalid`;
    await supabase.from("agm_proxies").insert({
      meeting_ref: meetingRef,
      full_name: body.fullName?.trim() || "(honeypot)",
      address_line_1: body.addressLine1?.trim() || "(honeypot)",
      address_town: body.addressTown?.trim() || "(honeypot)",
      address_postcode: body.addressPostcode?.trim() || "(honeypot)",
      email,
      how_held: body.howHeld === "nominee" ? "nominee" : "direct",
      appointee_name: APPOINTEE_LABEL,
      declaration_snapshot: declarationSnapshot,
      signature_name: body.signatureName?.trim() || "(honeypot)",
      signed_at: new Date().toISOString(),
      consent_given: body.consentGiven === true,
      privacy_policy_version: privacyPolicyVersion,
      suspected_bot: true,
    });
    return NextResponse.json({ ok: true, firstName: "" });
  }

  // ── 3. Turnstile ───────────────────────────────────────────────────────────
  if (!body.turnstileToken) return bad("Bot detection token missing.");

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: turnstileSecret, response: body.turnstileToken }),
      }
    );
    const verifyData = (await verifyRes.json()) as { success: boolean };
    if (!verifyData.success) {
      return bad("Security check failed. Please refresh and try again.");
    }
  } else {
    console.error(
      "[proxy/appointment] TURNSTILE_SECRET_KEY is not set - Turnstile verification was skipped entirely for this submission."
    );
  }

  // ── 4. Field validation ─────────────────────────────────────────────────────
  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const signatureName = body.signatureName?.trim();

  if (!fullName) return bad("Full name is required.");
  if (!email || !EMAIL_RE.test(email)) return bad("A valid email address is required.");
  if (DISPOSABLE_EMAIL_DOMAINS.has(email.split("@")[1])) {
    return bad("Please use a permanent email address.");
  }

  const addressLine1 = body.addressLine1?.trim();
  const addressTown = body.addressTown?.trim();
  const addressPostcode = body.addressPostcode?.trim();
  if (!addressLine1) return bad("Address line 1 is required.");
  if (!addressTown) return bad("Town or city is required.");
  if (!addressPostcode) return bad("Postcode is required.");

  const howHeld = body.howHeld;
  if (howHeld !== "direct" && howHeld !== "nominee") {
    return bad("Please indicate how you hold your shares.");
  }

  const srn = body.computershareSrn?.trim();
  if (howHeld === "direct" && !srn) {
    return bad("A Computershare shareholder reference number is required for direct holders.");
  }

  const platforms = await getConfigList("agm_nominee_platforms");
  const platform = body.nomineePlatform?.trim();
  const platformOther = body.nomineePlatformOther?.trim();
  let nomineeInstructionSent: boolean | null = null;

  if (howHeld === "nominee") {
    if (!platform) return bad("Please select the platform your shares are held through.");
    if (platforms.length === 0) {
      console.error("[proxy/appointment] agm_nominee_platforms is empty or unreadable");
      return bad("Appointment is temporarily unavailable. Please try again shortly.", 503);
    }
    if (!platforms.includes(platform)) return bad("Please select a platform from the list.");
    if (platform === "Other" && !platformOther) {
      return bad("Please name the platform your shares are held through.");
    }
    if (body.nomineeInstructionSent !== true) {
      return bad("Please confirm you have sent the instruction to your platform.");
    }
    nomineeInstructionSent = true;
  }

  const sharesHeld = body.sharesHeld?.trim() || null;
  if (sharesHeld) {
    const bands = await getConfigList("agm_share_bands");
    if (!bands.includes(sharesHeld)) return bad("Please select a shareholding from the list.");
  }

  const shareClass = body.shareClass?.trim() || null;
  if (shareClass && !SHARE_CLASSES.includes(shareClass as (typeof SHARE_CLASSES)[number])) {
    return bad("Please select a share class from the list.");
  }

  if (body.consentGiven !== true) {
    return bad("You must consent to your details being used for this appointment.");
  }
  if (!signatureName) return bad("An electronic signature is required.");

  // ── 5. Duplicate ─────────────────────────────────────────────────────────────
  // Scoped to the current meeting, matching agm_signatures - the same person
  // appointing a proxy for a later AGM is a new appointment, not a duplicate.
  const { data: existing } = await supabase
    .from("agm_proxies")
    .select("id")
    .eq("email", email)
    .eq("meeting_ref", meetingRef)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error:
          "We already have a proxy appointment from this email address. If you need to make a change, contact info@celticsupporters.net.",
        duplicate: true,
      },
      { status: 409 }
    );
  }

  // ── 6. Insert ────────────────────────────────────────────────────────────────
  const { error: dbError } = await supabase.from("agm_proxies").insert({
    meeting_ref:              meetingRef,
    full_name:                fullName,
    address_line_1:           addressLine1,
    address_line_2:           body.addressLine2?.trim() || null,
    address_town:             addressTown,
    address_postcode:         addressPostcode,
    email,
    how_held:                 howHeld,
    computershare_srn:        srn || null,
    nominee_platform:         howHeld === "nominee" ? platform : null,
    nominee_platform_other:   howHeld === "nominee" && platform === "Other" ? platformOther : null,
    shares_held:              sharesHeld,
    share_class:              shareClass,
    // Server-set. See the function comment - there is no path from `body` to
    // this column.
    appointee_name:           APPOINTEE_LABEL,
    declaration_snapshot:     declarationSnapshot,
    signature_name:           signatureName,
    // Server-generated. Any client-supplied signedAt is ignored.
    signed_at:                new Date().toISOString(),
    consent_given:            body.consentGiven,
    privacy_policy_version:   privacyPolicyVersion,
    // Only path built in Package 5 - see the schema file's own note.
    lodgement_path:           "we-lodge",
    nominee_instruction_sent: nomineeInstructionSent,
    suspected_bot:            false,
  });

  if (dbError) {
    if (dbError.code === "23505") {
      return NextResponse.json(
        {
          error:
            "We already have a proxy appointment from this email address. If you need to make a change, contact info@celticsupporters.net.",
          duplicate: true,
        },
        { status: 409 }
      );
    }
    console.error("[proxy/appointment] insert error:", dbError.message);
    return bad("Failed to record your appointment. Please try again.", 500);
  }

  return NextResponse.json({ ok: true, firstName: fullName.split(" ")[0] });
}
