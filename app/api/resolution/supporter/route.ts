import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { DISPOSABLE_EMAIL_DOMAINS } from "@/lib/disposable-email-domains";
import {
  AGM_GATE_CLOSED_ERROR,
  getConfigValue,
  getCurrentMeetingRef,
  isGateOpen,
} from "@/lib/site-gates";

/**
 * Supporter path for people who are not Celtic plc shareholders.
 *
 * Only a shareholder can support a Companies Act 2006 section 338 request, so
 * non-shareholders must not sit in agm_signatures. Recording them separately
 * keeps the instrument clean while keeping the campaign contact, which is the
 * point of having them on the page at all.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 3;
const WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (!(await isGateOpen("resolution_open"))) {
    return NextResponse.json(
      { error: AGM_GATE_CLOSED_ERROR.resolution_open, closed: true },
      { status: 403 }
    );
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (entry && now - entry.windowStart < WINDOW_MS) {
    entry.count += 1;
    if (entry.count >= RATE_LIMIT) {
      return NextResponse.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429 }
      );
    }
  } else {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
  }

  let body: {
    // Honeypot. See the matching note in app/api/resolution/sign/route.ts.
    hpField?: string;
    fullName?: string;
    email?: string;
    consentGiven?: boolean;
    turnstileToken?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.hpField) {
    console.error(
      `[resolution/supporter] honeypot triggered: email=${body.email ?? "(none)"} at=${new Date().toISOString()}`
    );
    return NextResponse.json({ ok: true, firstName: "" });
  }

  if (!body.turnstileToken) {
    return NextResponse.json({ error: "Bot detection token missing." }, { status: 400 });
  }

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
      return NextResponse.json(
        { error: "Security check failed. Please refresh and try again." },
        { status: 400 }
      );
    }
  } else {
    console.error(
      "[resolution/supporter] TURNSTILE_SECRET_KEY is not set - Turnstile verification was skipped entirely for this submission."
    );
  }

  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (DISPOSABLE_EMAIL_DOMAINS.has(email.split("@")[1])) {
    return NextResponse.json({ error: "Please use a permanent email address." }, { status: 400 });
  }
  if (body.consentGiven !== true) {
    return NextResponse.json(
      { error: "You must consent to your details being stored." },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const privacyPolicyVersion = await getConfigValue("privacy_policy_version");

  const { error } = await supabase.from("agm_supporters").insert({
    full_name: fullName,
    email,
    consent_given: body.consentGiven,
    // Read live rather than left to the column default. See the same note in
    // app/api/resolution/sign/route.ts.
    meeting_ref: await getCurrentMeetingRef(),
    privacy_policy_version: privacyPolicyVersion,
  });

  if (error) {
    if (error.code === "23505") {
      // Already registered. Nothing to correct, so report success rather than
      // exposing that the address is on the list.
      return NextResponse.json({ ok: true, firstName: fullName.split(" ")[0] });
    }
    console.error("[resolution/supporter] insert error:", error.message);
    return NextResponse.json(
      { error: "Failed to record your support. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, firstName: fullName.split(" ")[0] });
}
