import { NextRequest, NextResponse } from "next/server";
import { getStripe, validatePlan, type PlanType } from "@/lib/stripe";
import { getSupabase } from "@/lib/supabase";

const VALID_PLANS: PlanType[] = [
  "standard",
  "accelerator",
  "custom_monthly",
  "custom_annual",
  "lifetime",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const plan = body.plan as PlanType;
  const amount = typeof body.amount === "number" ? body.amount : undefined;
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  const validationError = validatePlan(plan, amount);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 }
    );
  }

  // Guard: block checkout if this email is already a registered member.
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

  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  const successUrl = `${origin}/membership/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/membership`;

  try {
    const stripe = getStripe();
    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;

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
              product_data: { name: "Monthly 10" },
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
              product_data: { name: "Monthly 25" },
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
              product_data: { name: "Custom Monthly" },
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
              product_data: { name: `£${amount} Annually` },
            },
          },
        ],
        customer_email: email,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else {
      // lifetime — one-off payment, fixed at £5,000
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: 500000,
              product_data: { name: "Lifetime £5000" },
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
