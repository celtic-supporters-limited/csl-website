import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authClient = createServerSupabase();
  const { data: { user }, error: authError } = await authClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body: { amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const amount = typeof body.amount === "number" ? body.amount : null;

  if (!amount || amount < 300 || amount % 10 !== 0) {
    return NextResponse.json(
      { error: "Annual amount must be at least £300 and in £10 increments." },
      { status: 400 }
    );
  }

  // ── 3. Load member ─────────────────────────────────────────────────────────
  const db = getSupabase();
  let memberRes = await db
    .from("members")
    .select("id, email, stripe_customer_id, stripe_subscription_id, membership_tier, is_lifetime, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!memberRes.data) {
    memberRes = await db
      .from("members")
      .select("id, email, stripe_customer_id, stripe_subscription_id, membership_tier, is_lifetime, status")
      .eq("email", user.email!)
      .maybeSingle();
  }

  const member = memberRes.data;

  if (!member) {
    return NextResponse.json({ error: "No membership record found." }, { status: 404 });
  }

  // ── 4. Guards ──────────────────────────────────────────────────────────────
  if (member.is_lifetime) {
    return NextResponse.json({ error: "Lifetime members cannot change their plan." }, { status: 400 });
  }
  if (member.membership_tier !== "monthly") {
    return NextResponse.json({ error: "Only monthly subscribers can switch to annual." }, { status: 400 });
  }
  if (member.status !== "active") {
    return NextResponse.json({ error: "Your membership must be active to change plan." }, { status: 400 });
  }
  if (!member.stripe_customer_id || !member.stripe_subscription_id) {
    return NextResponse.json({ error: "No active subscription found on this account." }, { status: 404 });
  }

  // ── 5. Fetch current subscription to get period end ───────────────────────
  const stripe = getStripe();
  let currentSub;
  try {
    currentSub = await stripe.subscriptions.retrieve(member.stripe_subscription_id);
  } catch (err) {
    console.error("[switch-to-annual] Failed to retrieve current subscription:", err);
    return NextResponse.json({ error: "Could not retrieve your current subscription." }, { status: 500 });
  }

  const currentItem = currentSub.items.data[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentPeriodEnd = (currentItem as any)?.current_period_end ?? (currentSub as any).current_period_end as number;
  // Reuse the existing Stripe product ID — dahlia API rejects product_data on price_data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productId = typeof currentItem?.price?.product === "string" ? currentItem.price.product : (currentItem?.price?.product as any)?.id as string | undefined;

  if (!productId) {
    console.error("[switch-to-annual] No product ID on current subscription item:", member.stripe_subscription_id);
    return NextResponse.json({ error: "Could not read subscription details. Please contact support." }, { status: 500 });
  }

  // ── 6. Create Checkout session for the annual plan ────────────────────────
  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const planName = `Annual ${amount}`;
  const unitAmount = amount * 100;

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: member.stripe_customer_id,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            unit_amount: unitAmount,
            recurring: { interval: "year" },
            product: productId,
          },
          quantity: 1,
        },
      ],
      // New annual subscription begins when the current monthly period ends —
      // avoids overlap and gives the member seamless continuity.
      subscription_data: {
        trial_end: currentPeriodEnd,
        metadata: {
          previous_subscription_id: member.stripe_subscription_id,
          switch_from_monthly: "true",
        },
      },
      success_url: `${origin}/member-portal?annual_switch=1`,
      cancel_url: `${origin}/member-portal`,
    });
  } catch (err) {
    console.error("[switch-to-annual] Stripe session create error:", err);
    return NextResponse.json({ error: "Failed to create checkout session. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
