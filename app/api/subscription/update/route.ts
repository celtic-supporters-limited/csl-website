import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe, validatePlan, type PlanType } from "@/lib/stripe";
import { logMemberEvent } from "@/lib/member-events";

const ALLOWED_PLANS: PlanType[] = ["standard", "accelerator", "custom_monthly"];

function planLabel(plan: PlanType, amount?: number): string {
  if (plan === "standard")    return "Monthly 10";
  if (plan === "accelerator") return "Monthly 25";
  return `Monthly ${amount}`;
}

function planUnitAmount(plan: PlanType, amount?: number): number {
  if (plan === "standard")    return 1000;
  if (plan === "accelerator") return 2500;
  return (amount ?? 0) * 100;
}

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

  const plan = body.plan as PlanType;
  const amount = typeof body.amount === "number" ? body.amount : undefined;

  if (!ALLOWED_PLANS.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  const validationError = validatePlan(plan, amount);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // ── 3. Load member ─────────────────────────────────────────────────────────
  const db = getSupabase();
  let memberRes = await db
    .from("members")
    .select("id, stripe_customer_id, stripe_subscription_id, membership_tier, is_lifetime, status, amount_pence, email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!memberRes.data) {
    memberRes = await db
      .from("members")
      .select("id, stripe_customer_id, stripe_subscription_id, membership_tier, is_lifetime, status, amount_pence, email")
      .eq("email", user.email!)
      .maybeSingle();
  }

  const member = memberRes.data;

  if (!member) {
    return NextResponse.json({ error: "No membership record found." }, { status: 404 });
  }

  // ── 4. Guard: monthly active subscribers only ──────────────────────────────
  if (member.is_lifetime) {
    return NextResponse.json({ error: "Lifetime members cannot change their plan." }, { status: 400 });
  }
  if (member.membership_tier !== "monthly") {
    return NextResponse.json({ error: "Only monthly subscribers can use this feature. Annual plan changes require contacting membership@celticsupporters.net." }, { status: 400 });
  }
  if (member.status !== "active") {
    return NextResponse.json({ error: "Your membership must be active to change plan." }, { status: 400 });
  }
  if (!member.stripe_subscription_id) {
    return NextResponse.json({ error: "No active subscription found on this account." }, { status: 404 });
  }

  const newUnitAmount = planUnitAmount(plan, amount);

  // ── 5. Guard: reject no-op (same amount) ──────────────────────────────────
  if (newUnitAmount === member.amount_pence) {
    return NextResponse.json({ error: "You are already on this plan." }, { status: 400 });
  }

  // ── 6. Retrieve subscription and update ───────────────────────────────────
  const stripe = getStripe();

  let subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(member.stripe_subscription_id);
  } catch (err) {
    console.error("[subscription/update] Failed to retrieve Stripe subscription:", err);
    return NextResponse.json({ error: "Could not retrieve your current subscription. Please try again." }, { status: 500 });
  }

  const itemId = subscription.items.data[0]?.id;
  if (!itemId) {
    console.error("[subscription/update] No subscription item found on sub:", member.stripe_subscription_id);
    return NextResponse.json({ error: "Could not read subscription details. Please contact support." }, { status: 500 });
  }

  const newPlanName = planLabel(plan, amount);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (stripe.subscriptions.update as any)(member.stripe_subscription_id, {
      items: [{
        id: itemId,
        price_data: {
          currency: "gbp",
          unit_amount: newUnitAmount,
          recurring: { interval: "month" },
          product_data: { name: newPlanName },
        },
      }],
      proration_behavior: "none",
    });
  } catch (err) {
    console.error("[subscription/update] Stripe subscriptions.update error:", err);
    return NextResponse.json({ error: "Failed to update your subscription. Please try again." }, { status: 500 });
  }

  // ── 7. Update Supabase ─────────────────────────────────────────────────────
  const { error: dbError } = await db
    .from("members")
    .update({ plan_name: newPlanName, amount_pence: newUnitAmount })
    .eq("id", member.id);

  if (dbError) {
    // Stripe update succeeded — log the discrepancy but don't surface to member.
    // The customer.subscription.updated webhook will also update amount_pence.
    console.error("[subscription/update] Supabase update error (Stripe succeeded):", dbError.message);
  }

  // ── 8. Audit log ──────────────────────────────────────────────────────────
  logMemberEvent({
    memberId: member.id,
    eventType: "subscription.updated",
    detail: {
      previous_amount_pence: member.amount_pence,
      new_amount_pence: newUnitAmount,
      new_plan_name: newPlanName,
      initiated_by: "member",
    },
    stripeEventId: null,
    eventEmail: member.email,
    isTest: process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? false,
  }).catch((err) => console.error("[subscription/update] Event log error:", err));

  return NextResponse.json({ ok: true, newPlanName, newAmountPence: newUnitAmount });
}
