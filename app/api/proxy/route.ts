import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { findOrCreateZohoContact, createZohoCase } from "@/lib/zoho";
import { sendProxyNotification, sendProxyInterestEmail } from "@/lib/resend";
import { DISPOSABLE_EMAIL_DOMAINS } from "@/lib/disposable-email-domains";
import { getConfigValue, getCurrentMeetingRef, getProxyMode } from "@/lib/site-gates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory rate limiter — resets on cold starts; best-effort deterrent only.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Expression of interest only - Package 5 section 3. Writes to
 * shareholder_cases, case_type "Proxy Interest", not an appointment and not
 * agm_proxies. Once the page is in "appointment" mode this route is no
 * longer the one the public form posts to - see
 * app/api/proxy/appointment/route.ts - so it only accepts submissions while
 * the mode is exactly "interest".
 */
export async function POST(req: NextRequest) {
  // ── 0. Launch gate ─────────────────────────────────────────────────────────
  const mode = await getProxyMode();
  if (mode !== "interest") {
    return NextResponse.json(
      {
        error:
          mode === "appointment"
            ? "Proxy appointment is now open. Please use the full appointment form instead."
            : "Proxy registration is not open yet. It opens once CSL is ready to start collecting interest ahead of the AGM.",
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
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }
  } else {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
  }

  let body: {
    // Honeypot. Renamed from "website" - see the matching note on the
    // resolution routes. Store-and-flag, not log-and-reject: this is the one
    // proxy surface that stays permanently public, which makes it the
    // likeliest place a real person is silently discarded by an autofilled
    // hidden field. A suspected_bot row sitting in the admin table is a
    // click away from being released; a log line is a reconstruction CSL
    // may never see. See the close-out session note in sql/agm-p5-schema.sql.
    hpField?: string;
    name?: string;
    email?: string;
    numShares?: string;
    yearPurchased?: string;
    source?: string;
    consentGiven?: boolean;
    turnstileToken?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { name, email, numShares, yearPurchased, source } = body;

  if (body.hpField) {
    await getSupabase().from("shareholder_cases").insert({
      contact_name: name?.trim() || "(honeypot)",
      email: email?.trim().toLowerCase() || `unknown-${Date.now()}@invalid`,
      case_type: "Proxy Interest",
      enquiry_source: source || null,
      status: "New",
      consent_given: body.consentGiven === true,
      meeting_ref: await getCurrentMeetingRef(),
      privacy_policy_version: await getConfigValue("privacy_policy_version"),
      suspected_bot: true,
    });
    return NextResponse.json({ success: true });
  }

  const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";

  // ── 2. Turnstile verification ──────────────────────────────────────────────
  if (!turnstileToken) {
    return NextResponse.json(
      { error: "Bot detection token missing." },
      { status: 400 }
    );
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: turnstileSecret,
          response: turnstileToken,
        }),
      }
    );
    const verifyData = (await verifyRes.json()) as { success: boolean };
    if (!verifyData.success) {
      return NextResponse.json(
        { error: "Security check failed. Please refresh and try again." },
        { status: 400 }
      );
    }
  } else {
    console.error(
      "[proxy] TURNSTILE_SECRET_KEY is not set - Turnstile verification was skipped entirely for this submission."
    );
  }

  // ── 3. Field validation ────────────────────────────────────────────────────
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json(
      { error: "Name and email are required." },
      { status: 400 }
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please provide a valid email address." },
      { status: 400 }
    );
  }
  if (body.consentGiven !== true) {
    return NextResponse.json(
      { error: "You must consent to your details being stored." },
      { status: 400 }
    );
  }

  // ── 4. Disposable email check ──────────────────────────────────────────────
  const emailDomain = email.trim().toLowerCase().split("@")[1];
  if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
    return NextResponse.json(
      { error: "Please use a permanent email address." },
      { status: 400 }
    );
  }

  const notes = [
    numShares ? `Number of shares: ${numShares}` : null,
    yearPurchased ? `Year of purchase: ${yearPurchased}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const privacyPolicyVersion = await getConfigValue("privacy_policy_version");

  const { error: dbError } = await getSupabase()
    .from("shareholder_cases")
    .insert({
      contact_name: name.trim(),
      email: email.trim().toLowerCase(),
      // "Proxy Interest", not "Proxy Assignment" - Package 5 renames the case
      // type so nobody mistakes this row for an appointment later. See
      // sql/agm-p5-schema.sql for the one-off rename of existing rows.
      case_type: "Proxy Interest",
      enquiry_source: source || null,
      notes: notes || null,
      status: "New",
      // Stored as submitted - previously discarded entirely (audit Finding
      // 5), so every prior row held personal data with no recorded consent.
      consent_given: body.consentGiven,
      // Read live, not left to a column default - an intention is specific
      // to one meeting exactly as an appointment is.
      meeting_ref: await getCurrentMeetingRef(),
      privacy_policy_version: privacyPolicyVersion,
      suspected_bot: false,
    });

  if (dbError) {
    console.error("[proxy] Supabase insert error:", dbError.message);
    return NextResponse.json(
      { error: "Failed to save your registration. Please try again." },
      { status: 500 }
    );
  }

  try {
    await sendProxyNotification({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: notes,
      submittedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[proxy] Notification email error:", err);
  }

  // Package 6, section 6 - the submitter's own confirmation, separate from
  // the volunteer notification above. No attachment, no backlog tracking:
  // this row has no PDF and no lodgement-document consequence if the send
  // fails.
  try {
    await sendProxyInterestEmail({ to: email.trim().toLowerCase(), firstName: name.trim().split(" ")[0] });
  } catch (err) {
    console.error("[proxy] Confirmation email error:", err);
  }

  try {
    const contactId = await findOrCreateZohoContact(name.trim(), email.trim());
    await createZohoCase(contactId, "Proxy Interest", notes);
  } catch (err) {
    console.error("[proxy] Zoho error:", err);
  }

  return NextResponse.json({ success: true });
}
