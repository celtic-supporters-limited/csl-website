import { NextRequest, NextResponse } from "next/server";
import { getStripe, validatePlan, type PlanType } from "@/lib/stripe";
import { getSupabase } from "@/lib/supabase";
import { DISPOSABLE_EMAIL_DOMAINS } from "@/lib/disposable-email-domains";

const VALID_PLANS: PlanType[] = [
  "standard",
  "accelerator",
  "custom_monthly",
  "custom_annual",
  "lifetime",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory rate limiter — resets on cold starts; best-effort deterrent only.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  // ── 0. Membership gate ─────────────────────────────────────────────────────
  const { data: membershipConfig } = await getSupabase()
    .from("site_config")
    .select("value")
    .eq("key", "membership_open")
    .maybeSingle();
  if (membershipConfig?.value !== "true") {
    return NextResponse.json(
      { error: "Membership sign-up is not currently open." },
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const plan = body.plan as PlanType;
  const amount = typeof body.amount === "number" ? body.amount : undefined;
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const turnstileToken =
    typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  const honeypot =
    typeof body.website === "string" ? body.website : "";

  // ── 2. Honeypot check ──────────────────────────────────────────────────────
  // Bots fill hidden fields; humans never see or touch this field.
  if (honeypot) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // ── 3. Turnstile verification ──────────────────────────────────────────────
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
    const verifyData = await verifyRes.json() as { success: boolean; "error-codes"?: string[] };
    if (!verifyData.success) {
      console.error("[checkout] Turnstile verification failed", {
        ip,
        email,
        errorCodes: verifyData["error-codes"],
      });
      return NextResponse.json(
        { error: "Bot detection check failed. Please try again." },
        { status: 400 }
      );
    }
  }

  // ── 3. Plan validation ─────────────────────────────────────────────────────
  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  const validationError = validatePlan(plan, amount);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // ── 4. Email validation ────────────────────────────────────────────────────
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 }
    );
  }

  const emailDomain = email.split("@")[1];
  if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
    return NextResponse.json(
      { error: "Please use a permanent email address to register." },
      { status: 400 }
    );
  }

  // ── 5. Duplicate member guard ──────────────────────────────────────────────
  try {
    const { data: existing } = await getSupabase()
      .from("members")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists. Please sign in or use a different email address.",
        },
        { status: 409 }
      );
    }
  } catch (err) {
    console.error("[checkout] Could not check existing member for email:", err);
    // Fail open — a database hiccup should not block legitimate checkouts.
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const successUrl = `${origin}/membership/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/membership`;

  try {
    const stripe = getStripe();
    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;

    const productId = process.env.STRIPE_PRODUCT_ID!;

    if (plan === "standard") {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: 1000,
              recurring: { interval: "month" },
              product: productId,
            },
          },
        ],
        customer_email: email,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else if (plan === "accelerator") {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: 2500,
              recurring: { interval: "month" },
              product: productId,
            },
          },
        ],
        customer_email: email,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else if (plan === "custom_monthly") {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: amount! * 100,
              recurring: { interval: "month" },
              product: productId,
            },
          },
        ],
        customer_email: email,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else if (plan === "custom_annual") {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: amount! * 100,
              recurring: { interval: "year" },
              product: productId,
            },
          },
        ],
        customer_email: email,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else {
      // lifetime — one-off payment, fixed at £5,000
      // customer_creation: "always" ensures Stripe creates a Customer object
      // even for one-time payments so the webhook gets a stripe_customer_id.
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_creation: "always",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: 500000,
              product: productId,
            },
          },
        ],
        customer_email: email,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    }

    if (!session.url) {
      console.error("[checkout] Stripe returned a session with no URL:", session.id);
      return NextResponse.json(
        { error: "Failed to create checkout session. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Log the full error object — Stripe errors carry .type, .code, .statusCode, .raw
    console.error("[checkout] Error creating Stripe session:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session. Please try again." },
      { status: 500 }
    );
  }
}
