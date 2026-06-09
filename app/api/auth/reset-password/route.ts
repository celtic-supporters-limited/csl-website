import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

// In-memory rate limiter — resets on cold starts; best-effort deterrent only.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 3;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (entry && now - entry.windowStart < WINDOW_MS) {
    entry.count += 1;
    if (entry.count > RATE_LIMIT) {
      return NextResponse.json({ sent: true }, { status: 200 });
    }
  } else {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
  }

  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  try {
    const supabase = createServerSupabase();
    await supabase.auth.resetPasswordForEmail(email, {
      // Route through the existing callback so the code is exchanged for a session,
      // then redirect to the update-password page.
      redirectTo: `${origin}/auth/callback?redirectTo=/auth/update-password`,
    });
  } catch (err) {
    console.error("[reset-password] Error:", err);
  }

  // Always return 200 — never reveal whether the email is registered.
  return NextResponse.json({ sent: true });
}
