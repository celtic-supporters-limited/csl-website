import { NextRequest, NextResponse } from "next/server";
import { getStripe, validatePlan, type PlanType } from "@/lib/stripe";

const VALID_PLANS: PlanType[] = [
  "standard",
  "accelerator",
  "custom_monthly",
  "custom_annual",
  "lifetime",
];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const plan = body.plan as PlanType;
  const amount = typeof body.amount === "number" ? body.amount : undefined;

  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  const validationError = validatePlan(plan, amount);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  const successUrl = `${origin}/membership/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/membership`;

  try {
    const stripe = getStripe();
    let session;

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
              product_data: {
                name: "Custom Monthly",
              },
            },
          },
        ],
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
              product_data: {
                name: `£${amount} Annually`,
              },
            },
          },
        ],
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
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[checkout] Stripe error:", message);
    return NextResponse.json(
      { error: "Failed to create checkout session. Please try again." },
      { status: 500 }
    );
  }
}
