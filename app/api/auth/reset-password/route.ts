import { NextRequest, NextResponse } from "next/server";
import { logMemberEvent } from "@/lib/member-events";

// In-memory rate limiter — resets on cold starts; best-effort deterrent only.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 3;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  // Validate input before rate-limiting — invalid requests should always get
  // 400 regardless of rate-limit state, and should not consume the quota.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const email = typeof (body as Record<string, unknown>).email === "string"
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

  // Log the event fire-and-forget — the actual Supabase call is made client-side
  // so the browser stores the PKCE code verifier in localStorage (not server cookies),
  // ensuring exchangeCodeForSession succeeds when the user clicks the link.
  logMemberEvent({
    memberEmail: email,
    eventType: "password_reset.requested",
    eventEmail: email,
  }).catch((err) => console.error("[reset-password] Event log error:", err));

  // Always return 200 — never reveal whether the email is registered.
  return NextResponse.json({ sent: true });
}
