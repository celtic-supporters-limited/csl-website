import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import type { TimelineEntry, LiveStripe } from "@/components/MemberTimeline";

// ── Auth event helper types ───────────────────────────────────────────────────

type AuthEvent = { id: string; action: string; ip_address: string | null; created_at: string };

// ── Event display helpers (duplicated from page.tsx — shared source TBD) ─────

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    "checkout.completed":       "Joined CSL",
    "invoice.paid":             "Invoice paid",
    "payment.failed":           "Payment failed",
    "subscription.updated":     "Subscription amount updated",
    "subscription.cancelled":   "Membership cancelled",
    "email_change.initiated":   "Email change requested",
    "email_change.confirmed":   "Email change confirmed",
    "password_reset.requested": "Password reset requested",
    "profile.updated":          "Profile updated",
  };
  return labels[type] ?? type;
}

function eventDetail(type: string, detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  switch (type) {
    case "checkout.completed":
      return [
        detail.plan_name,
        detail.amount_pence != null ? `£${((detail.amount_pence as number) / 100).toFixed(2)}` : null,
      ].filter(Boolean).join(" — ");
    case "invoice.paid":
    case "subscription.updated":
      return detail.amount_pence != null ? `£${((detail.amount_pence as number) / 100).toFixed(2)}` : "";
    case "email_change.initiated":
      return `To ${detail.new_email ?? ""}`;
    case "email_change.confirmed":
      return `${detail.old_email ?? ""} -> ${detail.new_email ?? ""}`;
    case "profile.updated":
      return Array.isArray(detail.changed_fields)
        ? `Fields: ${(detail.changed_fields as string[]).join(", ")}` : "";
    default:
      return "";
  }
}

function authLabel(action: string): string {
  const labels: Record<string, string> = {
    login:             "Logged in",
    logout:            "Logged out",
    user_updated:      "Auth profile updated",
    password_recovery: "Password recovery initiated",
  };
  return labels[action] ?? action;
}

function memberDisplayName(m: {
  first_name: string | null; last_name: string | null; name: string | null; email: string;
}): string {
  if (m.first_name && m.last_name) return `${m.first_name} ${m.last_name}`;
  return m.name ?? m.email;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth + admin guard ──────────────────────────────────────────────────────
  const authClient = createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabase();
  let { data: adminCheck } = await db
    .from("members").select("is_admin").eq("user_id", user.id).maybeSingle();
  if (!adminCheck && user.email) {
    ({ data: adminCheck } = await db.from("members").select("is_admin").eq("email", user.email).maybeSingle());
  }
  if (!adminCheck?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── Input ───────────────────────────────────────────────────────────────────
  let body: { query?: string };
  try {
    body = await req.json() as { query?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (!query) return NextResponse.json({ error: "Query is required" }, { status: 400 });

  // ── Member search ───────────────────────────────────────────────────────────
  const lowerQ   = query.toLowerCase();
  const escapedQ = lowerQ.replace(/[%_\\]/g, "\\$&");

  let dbQuery = db
    .from("members")
    .select("id, user_id, email, name, first_name, last_name, plan_name, membership_tier, status, amount_pence, created_at, stripe_customer_id, stripe_subscription_id, is_lifetime, payment_failed_at, pending_email")
    .limit(10);

  if (lowerQ.includes("@")) {
    dbQuery = dbQuery.eq("email", lowerQ);
  } else {
    dbQuery = dbQuery.or(`name.ilike.%${escapedQ}%,first_name.ilike.%${escapedQ}%,last_name.ilike.%${escapedQ}%`);
  }

  const { data: results, error: searchError } = await dbQuery;
  if (searchError) {
    console.error("[member-search] DB error:", searchError.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const members = results ?? [];

  if (members.length === 0) return NextResponse.json({ type: "none" });

  if (members.length > 1) {
    return NextResponse.json({
      type: "multiple",
      results: members.map((m) => ({
        id:     m.id,
        name:   memberDisplayName(m),
        email:  m.email,
        plan:   m.plan_name ?? m.membership_tier ?? "-",
        status: m.status ?? "-",
      })),
    });
  }

  // ── Single result — build full timeline ─────────────────────────────────────
  const target = members[0];

  const [eventsResult, casesResult] = await Promise.all([
    db.from("member_events")
      .select("id, event_type, detail, event_email, created_at, is_test")
      .eq("member_id", target.id)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("shareholder_cases")
      .select("id, case_type, status, created_at")
      .eq("email", target.email)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  let authEvents: AuthEvent[] = [];
  if (target.user_id) {
    const { data: authData } = await db.rpc("get_member_auth_events", { p_user_id: target.user_id });
    authEvents = (authData ?? []) as AuthEvent[];
  }

  const entries: TimelineEntry[] = [];

  for (const ev of eventsResult.data ?? []) {
    entries.push({
      id:        ev.id,
      timestamp: ev.created_at,
      type:      ev.event_type,
      label:     eventLabel(ev.event_type),
      detail:    eventDetail(ev.event_type, (ev.detail ?? null) as Record<string, unknown> | null),
      isTest:    ev.is_test ?? false,
    });
  }

  for (const c of casesResult.data ?? []) {
    entries.push({
      id:        c.id,
      timestamp: c.created_at,
      type:      c.case_type === "Share Tracing" ? "share_tracing.submitted" : "proxy.submitted",
      label:     c.case_type === "Share Tracing" ? "Share tracing enquiry" : "Proxy assignment request",
      detail:    c.status ?? "",
    });
  }

  for (const a of authEvents) {
    entries.push({
      id:        a.id,
      timestamp: a.created_at,
      type:      `auth.${a.action}`,
      label:     authLabel(a.action),
      detail:    a.ip_address ? `IP: ${a.ip_address}` : "",
    });
  }

  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // ── Live Stripe data ────────────────────────────────────────────────────────
  let liveStripe: LiveStripe | null = null;

  if (target.stripe_customer_id) {
    try {
      const stripe = getStripe();
      const stripeCustomerUrl     = `https://dashboard.stripe.com/customers/${target.stripe_customer_id}`;
      const stripeSubscriptionUrl = target.stripe_subscription_id
        ? `https://dashboard.stripe.com/subscriptions/${target.stripe_subscription_id}` : null;

      const [customerResult, chargesResult] = await Promise.allSettled([
        stripe.customers.retrieve(target.stripe_customer_id, {
          expand: ["subscriptions.data.default_payment_method"],
        }),
        stripe.charges.list({ customer: target.stripe_customer_id, limit: 5 }),
      ]);

      let subscriptionStatus: string | null = null;
      let nextPaymentDate: string | null    = null;
      let nextPaymentAmount: number | null  = null;
      let cardBrand: string | null          = null;
      let cardLast4: string | null          = null;
      let cardExpiry: string | null         = null;

      if (customerResult.status === "fulfilled") {
        const cust = customerResult.value;
        if (!("deleted" in cust) || !cust.deleted) {
          const sub = (cust as { subscriptions?: { data: unknown[] } }).subscriptions?.data?.[0] as Record<string, unknown> | undefined;
          if (sub) {
            const pm   = sub.default_payment_method as Record<string, unknown> | null;
            const card = pm?.card as Record<string, unknown> | null;
            subscriptionStatus = sub.status as string ?? null;
            nextPaymentDate    = sub.current_period_end
              ? new Date((sub.current_period_end as number) * 1000).toISOString() : null;
            nextPaymentAmount  = sub.items
              ? ((sub.items as { data: { price: { unit_amount: number } }[] }).data[0]?.price?.unit_amount ?? null)
              : null;
            cardBrand  = card?.brand  as string | null ?? null;
            cardLast4  = card?.last4  as string | null ?? null;
            cardExpiry = card ? `${String(card.exp_month as number).padStart(2, "0")}/${card.exp_year}` : null;
          }
        }
      } else {
        console.error("[member-search] Stripe customer fetch failed:", customerResult.reason);
      }

      const recentCharges: LiveStripe["recentCharges"] = chargesResult.status === "fulfilled"
        ? chargesResult.value.data.map((c) => ({
            date:        new Date(c.created * 1000).toISOString(),
            amount:      c.amount,
            currency:    c.currency,
            status:      c.status,
            description: c.description ?? target.plan_name ?? "",
          }))
        : [];

      if (chargesResult.status === "rejected") {
        console.error("[member-search] Stripe charges fetch failed:", chargesResult.reason);
      }

      liveStripe = {
        subscriptionStatus, nextPaymentDate, nextPaymentAmount,
        cardBrand, cardLast4, cardExpiry,
        stripeCustomerUrl, stripeSubscriptionUrl, recentCharges,
      };
    } catch (err) {
      console.error("[member-search] Stripe fetch error:", err);
    }
  }

  return NextResponse.json({
    type: "single",
    member: {
      name:            memberDisplayName(target),
      email:           target.email,
      plan:            target.plan_name ?? target.membership_tier ?? "-",
      status:          target.status ?? "-",
      joinedAt:        target.created_at,
      isLifetime:      target.is_lifetime,
      paymentFailedAt: target.payment_failed_at,
      pendingEmail:    target.pending_email,
    },
    entries,
    liveStripe,
    isTestMode: (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_"),
  });
}
