import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

// In-memory rate limiter: 20 requests per admin per 5 minutes.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 20;
const WINDOW_MS  = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  // ── Auth + admin guard ────────────────────────────────────────────────────
  const authClient = createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabase();
  let { data: adminCheck } = await db
    .from("members")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminCheck && user.email) {
    ({ data: adminCheck } = await db.from("members").select("is_admin").eq("email", user.email).maybeSingle());
  }
  if (!adminCheck?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── Rate limit ────────────────────────────────────────────────────────────
  const now = Date.now();
  const key = user.id;
  const entry = rateLimitMap.get(key);
  if (entry && now - entry.windowStart < WINDOW_MS) {
    entry.count += 1;
    if (entry.count > RATE_LIMIT) {
      return NextResponse.json({ error: "Rate limit exceeded. Please wait before searching again." }, { status: 429 });
    }
  } else {
    rateLimitMap.set(key, { count: 1, windowStart: now });
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  // ── Member lookup ─────────────────────────────────────────────────────────
  const { data: member, error: memberError } = await db
    .from("members")
    .select(`
      id, email, first_name, last_name, name, status, plan_name,
      membership_tier, amount_pence, created_at, is_lifetime,
      stripe_customer_id, stripe_subscription_id,
      payment_failed_at, pending_email
    `)
    .eq("email", email)
    .maybeSingle();

  if (memberError) {
    console.error("[member-lookup] DB error:", memberError.message, { email });
    return NextResponse.json({ error: "Database error." }, { status: 500 });
  }

  if (!member) {
    return NextResponse.json({ member: null });
  }

  // ── Strip raw Stripe IDs; build dashboard URLs instead ───────────────────
  const stripeCustomerUrl    = member.stripe_customer_id
    ? `https://dashboard.stripe.com/customers/${member.stripe_customer_id}` : null;
  const stripeSubscriptionUrl = member.stripe_subscription_id
    ? `https://dashboard.stripe.com/subscriptions/${member.stripe_subscription_id}` : null;

  // ── Live Stripe data ──────────────────────────────────────────────────────
  let stripeCustomer: {
    nextPaymentDate: string | null;
    nextPaymentAmount: number | null;
    cardBrand: string | null;
    cardLast4: string | null;
    cardExpiry: string | null;
    subscriptionStatus: string | null;
    currentPeriodEnd: string | null;
  } = {
    nextPaymentDate: null, nextPaymentAmount: null,
    cardBrand: null, cardLast4: null, cardExpiry: null,
    subscriptionStatus: null, currentPeriodEnd: null,
  };

  let recentCharges: { date: string; amount: number; currency: string; status: string; description: string }[] = [];

  if (member.stripe_customer_id) {
    const stripe = getStripe();
    const [customerResult, chargesResult] = await Promise.allSettled([
      stripe.customers.retrieve(member.stripe_customer_id, {
        expand: ["subscriptions.data.default_payment_method"],
      }),
      stripe.charges.list({ customer: member.stripe_customer_id, limit: 5 }),
    ]);

    if (customerResult.status === "fulfilled") {
      const cust = customerResult.value;
      if (!("deleted" in cust) || !cust.deleted) {
        const sub = (cust as { subscriptions?: { data: unknown[] } }).subscriptions?.data?.[0] as Record<string, unknown> | undefined;
        if (sub) {
          const pm = sub.default_payment_method as Record<string, unknown> | null;
          const card = pm?.card as Record<string, unknown> | null;
          stripeCustomer = {
            subscriptionStatus: sub.status as string ?? null,
            currentPeriodEnd: sub.current_period_end
              ? new Date((sub.current_period_end as number) * 1000).toISOString() : null,
            nextPaymentDate: sub.current_period_end
              ? new Date((sub.current_period_end as number) * 1000).toISOString() : null,
            nextPaymentAmount: sub.items
              ? ((sub.items as { data: { price: { unit_amount: number } }[] }).data[0]?.price?.unit_amount ?? null)
              : null,
            cardBrand:  card?.brand  as string | null ?? null,
            cardLast4:  card?.last4  as string | null ?? null,
            cardExpiry: card ? `${String(card.exp_month as number).padStart(2, "0")}/${card.exp_year}` : null,
          };
        }
      }
    } else {
      console.error("[member-lookup] Stripe customer fetch failed:", customerResult.reason, { email });
    }

    if (chargesResult.status === "fulfilled") {
      recentCharges = chargesResult.value.data.map((c) => ({
        date:        new Date(c.created * 1000).toISOString(),
        amount:      c.amount,
        currency:    c.currency,
        status:      c.status,
        description: c.description ?? member.plan_name ?? "",
      }));
    } else {
      console.error("[member-lookup] Stripe charges fetch failed:", chargesResult.reason, { email });
    }
  }

  // ── Response (no raw Stripe IDs exposed) ──────────────────────────────────
  return NextResponse.json({
    member: {
      email:            member.email,
      firstName:        member.first_name,
      lastName:         member.last_name,
      name:             member.name,
      status:           member.status,
      planName:         member.plan_name,
      membershipTier:   member.membership_tier,
      amountPence:      member.amount_pence,
      isLifetime:       member.is_lifetime,
      memberSince:      member.created_at,
      paymentFailedAt:  member.payment_failed_at,
      pendingEmail:     member.pending_email,
      stripeCustomerUrl,
      stripeSubscriptionUrl,
    },
    stripe: stripeCustomer,
    recentCharges,
  });
}
