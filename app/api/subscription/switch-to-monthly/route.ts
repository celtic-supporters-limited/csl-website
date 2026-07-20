import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { logMemberEvent } from "@/lib/member-events";

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authClient = createServerSupabase();
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body: { plan?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const plan = body.plan as "standard" | "accelerator" | "custom_monthly";
  const amount = typeof body.amount === "number" ? body.amount : undefined;

  let unitAmount: number;
  let planName: string;

  if (plan === "standard") {
    unitAmount = 1000;
    planName = "Monthly 10";
  } else if (plan === "accelerator") {
    unitAmount = 2500;
    planName = "Monthly 25";
  } else if (plan === "custom_monthly") {
    if (!amount || amount < 30 || amount % 5 !== 0) {
      return NextResponse.json(
        { error: "Custom monthly amount must be at least £30 and in £5 increments." },
        { status: 400 }
      );
    }
    unitAmount = amount * 100;
    planName = `Monthly ${amount}`;
  } else {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  // ── 3. Load member ─────────────────────────────────────────────────────────
  const db = getSupabase();
  let memberRes = await db
    .from("members")
    .select("id, email, stripe_customer_id, stripe_subscription_id, membership_tier, is_lifetime, status, amount_pence")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!memberRes.data) {
    memberRes = await db
      .from("members")
      .select("id, email, stripe_customer_id, stripe_subscription_id, membership_tier, is_lifetime, status, amount_pence")
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
  if (member.membership_tier !== "annual") {
    return NextResponse.json({ error: "Only annual subscribers can use this option." }, { status: 400 });
  }
  if (member.status !== "active") {
    return NextResponse.json({ error: "Your membership must be active to change plan." }, { status: 400 });
  }
  if (!member.stripe_subscription_id) {
    return NextResponse.json({ error: "No active subscription found on this account." }, { status: 404 });
  }

  // ── 5. Retrieve current subscription ──────────────────────────────────────
  const stripe = getStripe();
  let currentSub;
  try {
    currentSub = await stripe.subscriptions.retrieve(member.stripe_subscription_id);
  } catch (err) {
    console.error("[switch-to-monthly] Failed to retrieve subscription:", err);
    return NextResponse.json({ error: "Could not retrieve your current subscription." }, { status: 500 });
  }

  const currentItem = currentSub.items.data[0];
  const itemId = currentItem?.id;

  if (!itemId) {
    console.error("[switch-to-monthly] No subscription item on subscription:", member.stripe_subscription_id);
    return NextResponse.json({ error: "Could not read subscription details. Please contact support." }, { status: 500 });
  }

  // ── 6. Stage the monthly switch at next renewal ────────────────────────────
  // proration_behavior: "none" means the annual subscription runs its full period,
  // then renews as monthly at the chosen amount. No immediate charge or credit.
  let newPrice;
  try {
    newPrice = await stripe.prices.create({
      currency: "gbp",
      unit_amount: unitAmount,
      recurring: { interval: "month" },
      product: process.env.STRIPE_PRODUCT_ID!,
    });
  } catch (err) {
    console.error("[switch-to-monthly] Stripe prices.create error:", err);
    return NextResponse.json({ error: "Failed to prepare your new plan. Please try again." }, { status: 500 });
  }

  try {
    await stripe.subscriptions.update(member.stripe_subscription_id, {
      items: [{ id: itemId, price: newPrice.id }],
      proration_behavior: "none",
    });
  } catch (err) {
    console.error("[switch-to-monthly] Stripe update error:", err);
    return NextResponse.json({ error: "Failed to update your subscription. Please try again." }, { status: 500 });
  }

  // ── 7. Audit log ───────────────────────────────────────────────────────────
  logMemberEvent({
    memberId: member.id,
    eventType: "subscription.updated",
    detail: {
      change: "annual_to_monthly",
      new_plan_name: planName,
      new_amount_pence: unitAmount,
      initiated_by: "member",
    },
    stripeEventId: null,
    eventEmail: member.email,
    isTest: process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? false,
  }).catch((err) => console.error("[switch-to-monthly] Event log error:", err));

  return NextResponse.json({ ok: true, planName });
}
