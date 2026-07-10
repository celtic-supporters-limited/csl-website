import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMagicLinkEmail } from "@/lib/resend";

// In-memory rate limiter — resets on cold starts; best-effort deterrent only.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 5;
const WINDOW_MS = 30 * 60 * 1000;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://csl-website-ten.vercel.app";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email =
    typeof (body as Record<string, unknown>).email === "string"
      ? ((body as Record<string, unknown>).email as string).trim().toLowerCase()
      : null;

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (entry && now - entry.windowStart < WINDOW_MS) {
    entry.count += 1;
    if (entry.count >= RATE_LIMIT) {
      return NextResponse.json({ sent: true }, { status: 200 });
    }
  } else {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
  }

  // Generate a magic link server-side via the admin API.
  // Using admin.generateLink rather than signInWithOtp for two reasons:
  // 1. signInWithOtp uses PKCE — the verifier is stored in the requesting browser,
  //    so clicking the link in a different browser (e.g. Outlook opens Edge when
  //    Chrome was used) fails with PKCE code verifier not found.
  // 2. Microsoft SafeLinks pre-fetches URLs in emails to scan for malware. This
  //    consumes single-use OTP tokens before the user clicks, making magic links
  //    appear expired. By sending tokens as query params to our own /auth/reset
  //    endpoint we bypass Supabase's verify endpoint entirely.
  const supabase = getSupabase();
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (!linkError && linkData?.properties?.hashed_token) {
    const magicLink = `${SITE_URL}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink`;

    try {
      await sendMagicLinkEmail({ to: email, magicLink });
    } catch (err) {
      console.error("[magic-link] Resend error:", err);
    }
  } else if (linkError) {
    console.log("[magic-link] generateLink skipped:", linkError.message);
  }

  // Always return 200 — never reveal whether the email is registered.
  return NextResponse.json({ sent: true });
}
