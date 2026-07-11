import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { DISPOSABLE_EMAIL_DOMAINS } from "@/lib/disposable-email-domains";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory rate limiter — resets on cold starts; best-effort deterrent only.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 3;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  // ── 1. Rate limiting ───────────────────────────────────────────────────────
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

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    fullName,
    email,
    postalAddress,
    isShareholder,
    shareholderType,
    computershareSrn,
    nomineePlatform,
    approximateShares,
    typedSignature,
    declarationAccepted,
    turnstileToken,
  } = body as {
    fullName?: string;
    email?: string;
    postalAddress?: string;
    isShareholder?: boolean;
    shareholderType?: string;
    computershareSrn?: string;
    nomineePlatform?: string;
    approximateShares?: number;
    typedSignature?: string;
    declarationAccepted?: boolean;
    turnstileToken?: string;
  };

  // ── 3. Turnstile verification ──────────────────────────────────────────────
  if (!turnstileToken) {
    return NextResponse.json({ error: "Bot detection token missing." }, { status: 400 });
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: turnstileSecret, response: turnstileToken }),
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

  // ── 4. Field validation ────────────────────────────────────────────────────
  if (!fullName?.trim()) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  if (!email?.trim() || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (!postalAddress?.trim()) {
    return NextResponse.json({ error: "Postal address is required." }, { status: 400 });
  }
  if (typeof isShareholder !== "boolean") {
    return NextResponse.json({ error: "Please indicate whether you hold Celtic shares." }, { status: 400 });
  }
  if (isShareholder && shareholderType !== "direct" && shareholderType !== "nominee") {
    return NextResponse.json({ error: "Please indicate how you hold your shares." }, { status: 400 });
  }
  if (!typedSignature?.trim()) {
    return NextResponse.json({ error: "Electronic signature is required." }, { status: 400 });
  }
  if (!declarationAccepted) {
    return NextResponse.json({ error: "You must accept the declaration to proceed." }, { status: 400 });
  }

  const emailNorm = email.trim().toLowerCase();

  // ── 5. Disposable email check ──────────────────────────────────────────────
  const emailDomain = emailNorm.split("@")[1];
  if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
    return NextResponse.json(
      { error: "Please use a permanent email address." },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  // ── 6. Duplicate check ─────────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from("agm_signatures")
    .select("id")
    .eq("email", emailNorm)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "We already have a signature from this email address. If you need to make a change, contact info@celticsupporters.net.", duplicate: true },
      { status: 409 }
    );
  }

  // ── 7. Derive tags ─────────────────────────────────────────────────────────
  let shareholderTag: "direct-registered" | "nominee-platform" | "non-shareholder";
  if (!isShareholder) {
    shareholderTag = "non-shareholder";
  } else if (shareholderType === "direct") {
    shareholderTag = "direct-registered";
  } else {
    shareholderTag = "nominee-platform";
  }

  // Check member status — do not expose result to client
  const { data: memberRow } = await supabase
    .from("members")
    .select("id")
    .ilike("email", emailNorm)
    .eq("status", "active")
    .maybeSingle();

  const memberTag: "member" | "non-member" = memberRow ? "member" : "non-member";

  // ── 8. Insert ──────────────────────────────────────────────────────────────
  const { error: dbError } = await supabase.from("agm_signatures").insert({
    full_name:           fullName.trim(),
    email:               emailNorm,
    postal_address:      postalAddress.trim(),
    is_shareholder:      isShareholder,
    shareholder_type:    isShareholder ? shareholderType : null,
    computershare_srn:   computershareSrn?.trim() || null,
    nominee_platform:    nomineePlatform?.trim() || null,
    approximate_shares:  approximateShares || null,
    typed_signature:     typedSignature.trim(),
    signature_date:      new Date().toISOString().split("T")[0],
    declaration_accepted: true,
    shareholder_tag:     shareholderTag,
    member_tag:          memberTag,
  });

  if (dbError) {
    // Catch unique constraint violation as a fallback (race condition)
    if (dbError.code === "23505") {
      return NextResponse.json(
        { error: "We already have a signature from this email address. If you need to make a change, contact info@celticsupporters.net.", duplicate: true },
        { status: 409 }
      );
    }
    console.error("[resolution/sign] Supabase insert error:", dbError.message);
    return NextResponse.json(
      { error: "Failed to record your signature. Please try again." },
      { status: 500 }
    );
  }

  const firstName = fullName.trim().split(" ")[0];
  return NextResponse.json({ ok: true, firstName });
}
