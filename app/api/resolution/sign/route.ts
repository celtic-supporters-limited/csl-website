import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { DISPOSABLE_EMAIL_DOMAINS } from "@/lib/disposable-email-domains";
import {
  AGM_GATE_CLOSED_ERROR,
  getConfigList,
  getConfigValue,
  isConfigFlagOn,
  isGateOpen,
} from "@/lib/site-gates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory rate limiter — resets on cold starts; best-effort deterrent only.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 3;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const SHARE_CLASSES = ["ORD", "CCP", "BOTH"] as const;

type Body = {
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
  yearOfPurchase?: string;
  sharesHeld?: string;
  shareClass?: string;
  eligibilityConfirmed?: boolean;
  resolutionSupported?: boolean;
  consentGiven?: boolean;
  signatureName?: string;
  turnstileToken?: string;
  // Deliberately ignored if supplied. signed_at is server-generated.
  signedAt?: string;
};

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  // ── 0. Launch gate ─────────────────────────────────────────────────────────
  if (!(await isGateOpen("resolution_open"))) {
    return NextResponse.json(
      { error: AGM_GATE_CLOSED_ERROR.resolution_open, closed: true },
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
  }

  const supabase = getSupabase();

  // ── 4. Resolution version ──────────────────────────────────────────────────
  // A signature is only defensible if it records the exact wording agreed to.
  // While the current version is the placeholder there is no resolution to
  // support, so nothing may be collected. This fails in the safe direction: a
  // rejected signature can be re-collected, one taken against the wrong text
  // cannot be un-taken.
  const { data: version, error: versionError } = await supabase
    .from("agm_resolution_versions")
    .select("id, is_placeholder")
    .eq("is_current", true)
    .maybeSingle();

  if (versionError || !version) {
    console.error("[resolution/sign] no current resolution version:", versionError?.message);
    return bad("Signing is temporarily unavailable. Please try again shortly.", 503);
  }
  if (version.is_placeholder) {
    return bad(
      "Signing is not open yet. The resolution wording has not been finalised.",
      403
    );
  }

  // ── 5. Field validation ────────────────────────────────────────────────────
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

  // SRN is the main threat to a verifiable 100: without it a direct holder
  // cannot be reconciled against the share register before lodgement.
  const srn = body.computershareSrn?.trim();
  if (howHeld === "direct" && !srn) {
    return bad("A Computershare shareholder reference number is required for direct holders.");
  }

  const platforms = await getConfigList("agm_nominee_platforms");
  const platform = body.nomineePlatform?.trim();
  const platformOther = body.nomineePlatformOther?.trim();

  if (howHeld === "nominee") {
    if (!platform) return bad("Please select the platform your shares are held through.");
    if (platforms.length === 0) {
      console.error("[resolution/sign] agm_nominee_platforms is empty or unreadable");
      return bad("Signing is temporarily unavailable. Please try again shortly.", 503);
    }
    if (!platforms.includes(platform)) return bad("Please select a platform from the list.");
    if (platform === "Other" && !platformOther) {
      return bad("Please name the platform your shares are held through.");
    }
  }

  const shareClass = body.shareClass;
  if (!shareClass || !SHARE_CLASSES.includes(shareClass as (typeof SHARE_CLASSES)[number])) {
    return bad("Please select a share class.");
  }

  // Optional dropdowns, but a supplied value must be one of the configured
  // options, otherwise the constraint is decorative.
  const yearOfPurchase = body.yearOfPurchase?.trim() || null;
  if (yearOfPurchase) {
    const years = await getConfigList("agm_year_options");
    if (!years.includes(yearOfPurchase)) return bad("Please select a year from the list.");
  }

  const sharesHeld = body.sharesHeld?.trim() || null;
  if (sharesHeld) {
    const bands = await getConfigList("agm_share_bands");
    if (!bands.includes(sharesHeld)) return bad("Please select a shareholding from the list.");
  }

  if (body.eligibilityConfirmed !== true) {
    return bad("You must confirm you hold shares in Celtic plc.");
  }
  if (body.resolutionSupported !== true) {
    return bad("You must confirm you support this resolution being put to the AGM.");
  }
  if (body.consentGiven !== true) {
    return bad("You must consent to your details being used for this requisition.");
  }
  if (!signatureName) return bad("An electronic signature is required.");

  // ── 6. Duplicate ───────────────────────────────────────────────────────────
  // Email remains the identity basis. Audit Finding 13 notes this is weak, but
  // changing it is a question for the solicitor, not this package.
  const { data: existing } = await supabase
    .from("agm_signatures")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error:
          "We already have a signature from this email address. If you need to make a change, contact info@celticsupporters.net.",
        duplicate: true,
      },
      { status: 409 }
    );
  }

  // ── 7. Derived values ──────────────────────────────────────────────────────
  const shareholderTag = howHeld === "direct" ? "direct-registered" : "nominee-platform";

  const { data: memberRow } = await supabase
    .from("members")
    .select("id")
    .ilike("email", email)
    .eq("status", "active")
    .maybeSingle();

  const privacyPolicyVersion = await getConfigValue("privacy_policy_version");

  // Personal data, so captured only while the flag is on. Nothing is stored
  // until Brian decides. See sql/agm-p2-requisition-schema.sql.
  const captureMetadata = await isConfigFlagOn("agm_capture_signer_metadata");
  const signerIp = captureMetadata ? (ip === "unknown" ? null : ip.split(",")[0].trim()) : null;
  const signerUserAgent = captureMetadata ? req.headers.get("user-agent") : null;

  // ── 8. Insert ──────────────────────────────────────────────────────────────
  const { error: dbError } = await supabase.from("agm_signatures").insert({
    full_name:              fullName,
    address_line_1:         addressLine1,
    address_line_2:         body.addressLine2?.trim() || null,
    address_town:           addressTown,
    address_postcode:       addressPostcode,
    email,
    how_held:               howHeld,
    computershare_srn:      srn || null,
    nominee_platform:       howHeld === "nominee" ? platform : null,
    nominee_platform_other: howHeld === "nominee" && platform === "Other" ? platformOther : null,
    year_of_purchase:       yearOfPurchase,
    shares_held:            sharesHeld,
    share_class:            shareClass,
    eligibility_confirmed:  true,
    resolution_supported:   true,
    consent_given:          body.consentGiven,
    privacy_policy_version: privacyPolicyVersion,
    resolution_version_id:  version.id,
    signature_name:         signatureName,
    // Server-generated. Any client-supplied signedAt is ignored.
    signed_at:              new Date().toISOString(),
    signer_ip:              signerIp,
    signer_user_agent:      signerUserAgent,
    capture_status:         "complete",
    shareholder_tag:        shareholderTag,
    member_tag:             memberRow ? "member" : "non-member",
  });

  if (dbError) {
    if (dbError.code === "23505") {
      return NextResponse.json(
        {
          error:
            "We already have a signature from this email address. If you need to make a change, contact info@celticsupporters.net.",
          duplicate: true,
        },
        { status: 409 }
      );
    }
    console.error("[resolution/sign] insert error:", dbError.message);
    return bad("Failed to record your signature. Please try again.", 500);
  }

  return NextResponse.json({ ok: true, firstName: fullName.split(" ")[0] });
}
