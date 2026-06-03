import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { findOrCreateZohoContact, createZohoCase } from "@/lib/zoho";
import { DISPOSABLE_EMAIL_DOMAINS } from "@/lib/disposable-email-domains";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory rate limiter — resets on cold starts; best-effort deterrent only.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  // ── 1. Rate limiting ───────────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (entry && now - entry.windowStart < WINDOW_MS) {
    entry.count += 1;
    if (entry.count > RATE_LIMIT) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }
  } else {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
  }

  const body = await req.json();
  const { name, email, enquiryType, yearPurchased, numShares, source, notes } = body;
  const turnstileToken =
    typeof body.turnstileToken === "string" ? body.turnstileToken : "";

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
  }

  // ── 3. Field validation ────────────────────────────────────────────────────
  if (!name?.trim() || !email?.trim() || !enquiryType?.trim()) {
    return NextResponse.json(
      { error: "Name, email, and enquiry type are required." },
      { status: 400 }
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please provide a valid email address." },
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

  // Build notes field combining optional free-text fields
  const combinedNotes = [
    yearPurchased ? `Year of purchase: ${yearPurchased}` : null,
    numShares ? `Number of shares: ${numShares}` : null,
    notes ? `Additional notes: ${notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { error: dbError } = await getSupabase().from("shareholder_cases").insert({
    contact_name: name.trim(),
    email: email.trim().toLowerCase(),
    case_type: "Share Tracing",
    enquiry_source: source || null,
    notes: combinedNotes || null,
    status: "New",
  });

  if (dbError) {
    console.error("[share-tracing] Supabase insert error:", dbError.message);
    return NextResponse.json(
      { error: "Failed to save your enquiry. Please try again." },
      { status: 500 }
    );
  }

  // Zoho: fire-and-forget, never block or throw
  (async () => {
    try {
      const contactId = await findOrCreateZohoContact(name.trim(), email.trim());
      await createZohoCase(contactId, "Share Tracing", combinedNotes);
    } catch (err) {
      console.error("[share-tracing] Zoho error (non-blocking):", err);
    }
  })();

  return NextResponse.json({ success: true });
}
