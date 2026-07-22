import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import PortalShell from "@/components/PortalShell";
import MemberTimeline from "@/components/MemberTimeline";
import type { TimelineEntry, LiveStripe } from "@/components/MemberTimeline";

export const metadata: Metadata = {
  title: "Member Support | CSL Admin",
};

// ── Filter types ──────────────────────────────────────────────────────────────

type TypeFilter   = "all" | "join" | "payment" | "failure" | "cancelled" | "auth" | "profile";
type PeriodFilter = "today" | "7d" | "30d" | "all";

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all",       label: "All events"    },
  { value: "join",      label: "Joins"         },
  { value: "payment",   label: "Payments"      },
  { value: "failure",   label: "Failures"      },
  { value: "cancelled", label: "Cancellations" },
  { value: "auth",      label: "Auth"          },
  { value: "profile",   label: "Profile"       },
];

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "today", label: "Today"    },
  { value: "7d",    label: "7 days"   },
  { value: "30d",   label: "30 days"  },
  { value: "all",   label: "All time" },
];

// ── Event display helpers ─────────────────────────────────────────────────────

const EVENT_BADGE: Record<string, { label: string; cls: string }> = {
  "checkout.completed":       { label: "Joined",          cls: "bg-green-100 text-green-800 border-green-200" },
  "invoice.paid":             { label: "Invoice paid",    cls: "bg-green-50 text-green-700 border-green-100"  },
  "payment.failed":           { label: "Payment failed",  cls: "bg-red-100 text-red-800 border-red-200"       },
  "subscription.updated":     { label: "Sub updated",     cls: "bg-gray-50 text-gray-600 border-gray-200"    },
  "subscription.cancelled":   { label: "Cancelled",       cls: "bg-gray-100 text-gray-700 border-gray-200"   },
  "email_change.initiated":   { label: "Email change",    cls: "bg-blue-100 text-blue-800 border-blue-200"    },
  "email_change.confirmed":   { label: "Email confirmed", cls: "bg-blue-100 text-blue-800 border-blue-200"    },
  "password_reset.requested": { label: "Password reset",  cls: "bg-blue-50 text-blue-700 border-blue-100"    },
  "profile.updated":          { label: "Profile update",  cls: "bg-gray-100 text-gray-600 border-gray-200"   },
};

function eventBadge(type: string): { label: string; cls: string } {
  return EVENT_BADGE[type] ?? { label: type.replace(/\./g, " "), cls: "bg-gray-100 text-gray-600 border-gray-200" };
}

function eventAction(type: string): string | null {
  if (type === "payment.failed") return "Ask member to update card in portal";
  return null;
}

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
        detail.amount_pence != null
          ? `£${((detail.amount_pence as number) / 100).toFixed(2)}`
          : null,
      ].filter(Boolean).join(" — ");
    case "invoice.paid":
    case "subscription.updated":
      return detail.amount_pence != null
        ? `£${((detail.amount_pence as number) / 100).toFixed(2)}`
        : "";
    case "email_change.initiated":
      return `To ${detail.new_email ?? ""}`;
    case "email_change.confirmed":
      return `${detail.old_email ?? ""} -> ${detail.new_email ?? ""}`;
    case "profile.updated":
      return Array.isArray(detail.changed_fields)
        ? `Fields: ${(detail.changed_fields as string[]).join(", ")}`
        : "";
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

function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type SortBy  = "created_at" | "event_email" | "event_type";
type SortDir = "asc" | "desc";

function filterUrl(
  state: { q: string; type: TypeFilter; period: PeriodFilter; test: boolean; sortBy: SortBy; sortDir: SortDir },
  override: Partial<typeof state>,
  testModeDefault: boolean
): string {
  const m = { ...state, ...override };
  const p = new URLSearchParams();
  if (m.q)                           p.set("q", m.q);
  if (m.type !== "all")              p.set("type", m.type);
  if (m.period !== "30d")            p.set("period", m.period);
  if (m.test && !testModeDefault)    p.set("test", "1");
  if (!m.test && testModeDefault)    p.set("test", "0");
  if (m.sortBy !== "created_at")     p.set("sortBy", m.sortBy);
  if (m.sortDir !== "desc")          p.set("sortDir", m.sortDir);
  const qs = p.toString();
  return `/member-portal/admin/members${qs ? `?${qs}` : ""}`;
}

function sortUrl(
  state: { q: string; type: TypeFilter; period: PeriodFilter; test: boolean; sortBy: SortBy; sortDir: SortDir },
  col: SortBy,
  testModeDefault: boolean
): string {
  const newDir: SortDir =
    state.sortBy === col && state.sortDir === "desc" ? "asc" : "desc";
  return filterUrl(state, { sortBy: col, sortDir: newDir }, testModeDefault);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: { q?: string; type?: string; period?: string; test?: string; sortBy?: string; sortDir?: string };
}) {
  const authClient = createServerSupabase();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user?.email) redirect("/login");

  const db = getSupabase();

  const { data: adminMember } = await db
    .from("members")
    .select("first_name, last_name, name, membership_tier, plan_name, status, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminMember?.is_admin) redirect("/member-portal");

  // ── Parse filter params ───────────────────────────────────────────────────

  // In test mode (sk_test_* key) default to showing test events, since all
  // events will be tagged is_test=true and the log would otherwise appear empty.
  const isTestMode  = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? false;
  const q          = searchParams.q?.trim() ?? "";
  const typeFilter = (searchParams.type  ?? "all")  as TypeFilter;
  const period     = (searchParams.period ?? "30d") as PeriodFilter;
  const showTest   = searchParams.test === "1" ? true
    : searchParams.test === "0" ? false
    : isTestMode;
  const sortBy  = (["created_at", "event_email", "event_type"].includes(searchParams.sortBy ?? "")
    ? searchParams.sortBy : "created_at") as SortBy;
  const sortDir = (searchParams.sortDir === "asc" ? "asc" : "desc") as SortDir;
  const filterState = { q, type: typeFilter, period, test: showTest, sortBy, sortDir };

  // ── Date bounds ───────────────────────────────────────────────────────────

  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const periodStart: string | null =
    period === "today" ? todayStart.toISOString()
    : period === "7d"  ? new Date(now - 7  * 86400000).toISOString()
    : period === "30d" ? new Date(now - 30 * 86400000).toISOString()
    : null;

  // ── Stats — respect showTest so cards match the visible table ───────────

  let todayQ = db.from("member_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayStart.toISOString());
  let weekQ = db.from("member_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(now - 7 * 86400000).toISOString())
    .eq("event_type", "checkout.completed");
  if (!showTest) {
    todayQ = todayQ.eq("is_test", false);
    weekQ  = weekQ.eq("is_test", false);
  }

  const [todayEventsRes, failuresRes, weekJoinsRes] = await Promise.all([
    todayQ,
    db.from("members")
      .select("id", { count: "exact", head: true })
      .eq("status", "payment_failed"),
    weekQ,
  ]);

  const todayCount   = todayEventsRes.count ?? 0;
  const failureCount = failuresRes.count    ?? 0;
  const weekJoins    = weekJoinsRes.count   ?? 0;

  // ── Member search ─────────────────────────────────────────────────────────

  type MemberRow = {
    id: string;
    user_id: string | null;
    email: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    plan_name: string | null;
    membership_tier: string | null;
    status: string | null;
    amount_pence: number | null;
    created_at: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    is_lifetime: boolean;
    payment_failed_at: string | null;
    pending_email: string | null;
  };

  let results: MemberRow[] = [];

  if (q) {
    const lowerQ   = q.toLowerCase();
    const escapedQ = lowerQ.replace(/[%_\\]/g, "\\$&");

    let query = db
      .from("members")
      .select("id, user_id, email, name, first_name, last_name, plan_name, membership_tier, status, amount_pence, created_at, stripe_customer_id, stripe_subscription_id, is_lifetime, payment_failed_at, pending_email")
      .limit(10);

    if (lowerQ.includes("@")) {
      query = query.eq("email", lowerQ);
    } else {
      query = query.or(
        `name.ilike.%${escapedQ}%,first_name.ilike.%${escapedQ}%,last_name.ilike.%${escapedQ}%`
      );
    }

    const { data } = await query;
    results = (data ?? []) as MemberRow[];
  }

  // ── Timeline (single result) ──────────────────────────────────────────────

  const target  = results.length === 1 ? results[0] : null;
  const entries: TimelineEntry[] = [];
  let liveStripe: LiveStripe | null = null;

  if (target) {
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

    type AuthEvent = { id: string; action: string; ip_address: string | null; created_at: string };
    let authEvents: AuthEvent[] = [];
    if (target.user_id) {
      const { data: authData } = await db.rpc("get_member_auth_events", {
        p_user_id: target.user_id,
      });
      authEvents = (authData ?? []) as AuthEvent[];
    }

    for (const ev of eventsResult.data ?? []) {
      entries.push({
        id: ev.id,
        timestamp: ev.created_at,
        type: ev.event_type,
        label: eventLabel(ev.event_type),
        detail: eventDetail(ev.event_type, (ev.detail ?? null) as Record<string, unknown> | null),
        isTest: ev.is_test ?? false,
      });
    }

    for (const c of casesResult.data ?? []) {
      entries.push({
        id: c.id,
        timestamp: c.created_at,
        type: c.case_type === "Share Tracing" ? "share_tracing.submitted" : "proxy.submitted",
        label: c.case_type === "Share Tracing" ? "Share tracing enquiry" : "Proxy assignment request",
        detail: c.status ?? "",
      });
    }

    for (const a of authEvents) {
      entries.push({
        id: a.id,
        timestamp: a.created_at,
        type: `auth.${a.action}`,
        label: authLabel(a.action),
        detail: a.ip_address ? `IP: ${a.ip_address}` : "",
      });
    }

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // ── Live Stripe data ────────────────────────────────────────────────────
    if (target.stripe_customer_id) {
      try {
        const stripe = getStripe();
        const stripeCustomerUrl    = `https://dashboard.stripe.com/customers/${target.stripe_customer_id}`;
        const stripeSubscriptionUrl = target.stripe_subscription_id
          ? `https://dashboard.stripe.com/subscriptions/${target.stripe_subscription_id}` : null;

        const [customerResult, chargesResult] = await Promise.allSettled([
          stripe.customers.retrieve(target.stripe_customer_id, {
            expand: ["subscriptions.data.default_payment_method"],
          }),
          stripe.charges.list({ customer: target.stripe_customer_id, limit: 5 }),
        ]);

        let subscriptionStatus: string | null = null;
        let nextPaymentDate: string | null = null;
        let nextPaymentAmount: number | null = null;
        let cardBrand: string | null = null;
        let cardLast4: string | null = null;
        let cardExpiry: string | null = null;

        if (customerResult.status === "fulfilled") {
          const cust = customerResult.value;
          if (!("deleted" in cust) || !cust.deleted) {
            const sub = (cust as { subscriptions?: { data: unknown[] } }).subscriptions?.data?.[0] as Record<string, unknown> | undefined;
            if (sub) {
              const pm = sub.default_payment_method as Record<string, unknown> | null;
              const card = pm?.card as Record<string, unknown> | null;
              subscriptionStatus = sub.status as string ?? null;
              nextPaymentDate = sub.current_period_end
                ? new Date((sub.current_period_end as number) * 1000).toISOString() : null;
              nextPaymentAmount = sub.items
                ? ((sub.items as { data: { price: { unit_amount: number } }[] }).data[0]?.price?.unit_amount ?? null)
                : null;
              cardBrand  = card?.brand  as string | null ?? null;
              cardLast4  = card?.last4  as string | null ?? null;
              cardExpiry = card ? `${String(card.exp_month as number).padStart(2, "0")}/${card.exp_year}` : null;
            }
          }
        } else {
          console.error("[admin/members] Stripe customer fetch failed:", customerResult.reason, { email: target.email });
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
          console.error("[admin/members] Stripe charges fetch failed:", chargesResult.reason, { email: target.email });
        }

        liveStripe = {
          subscriptionStatus,
          nextPaymentDate,
          nextPaymentAmount,
          cardBrand,
          cardLast4,
          cardExpiry,
          stripeCustomerUrl,
          stripeSubscriptionUrl,
          recentCharges,
        };
      } catch (err) {
        console.error("[admin/members] Stripe fetch error:", err, { email: target.email });
      }
    }
  }

  // ── All-events log (default view, no search) ──────────────────────────────

  type EventRow = {
    id: string;
    event_type: string;
    detail: Record<string, unknown> | null;
    event_email: string | null;
    is_test: boolean;
    created_at: string;
  };

  let events: EventRow[] = [];

  if (!q) {
    let evQ = db
      .from("member_events")
      .select("id, event_type, detail, event_email, is_test, created_at")
      .order(sortBy, { ascending: sortDir === "asc" })
      .limit(2000);

    if (!showTest)   evQ = evQ.eq("is_test", false);
    if (periodStart) evQ = evQ.gte("created_at", periodStart);

    if      (typeFilter === "join")      evQ = evQ.in("event_type", ["checkout.completed", "subscription.migrated"]);
    else if (typeFilter === "payment")   evQ = evQ.in("event_type", ["invoice.paid", "payment.failed"]);
    else if (typeFilter === "failure")   evQ = evQ.eq("event_type", "payment.failed");
    else if (typeFilter === "cancelled") evQ = evQ.eq("event_type", "subscription.cancelled");
    else if (typeFilter === "auth")      evQ = evQ.in("event_type", ["password_reset.requested", "email_change.initiated", "email_change.confirmed", "auth.account_created"]);
    else if (typeFilter === "profile")   evQ = evQ.eq("event_type", "profile.updated");

    const { data } = await evQ;
    events = (data ?? []) as EventRow[];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function memberDisplayName(m: MemberRow): string {
    if (m.first_name && m.last_name) return `${m.first_name} ${m.last_name}`;
    return m.name ?? m.email;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const pillBase = "px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors";
  const pillActive = "bg-csl-dark text-white border-csl-dark";
  const pillInactive = "bg-white text-gray-600 border-gray-300 hover:bg-gray-50";

  return (
    <PortalShell user={{ email: user.email, id: user.id }} member={adminMember}>
      <div className="max-w-5xl">

        {/* Header — adapts when a single member is loaded */}
        <div className="mb-5">
          {target ? (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Member Support</p>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{memberDisplayName(target)}</h1>
              <p className="text-sm text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>{target.email}</span>
                <span className="text-gray-300">·</span>
                <span>{target.plan_name ?? target.membership_tier ?? "-"}</span>
                <span className="text-gray-300">·</span>
                <span className={
                  target.status === "active"         ? "text-green-700 font-medium" :
                  target.status === "payment_failed" ? "text-red-600 font-medium"   :
                  "text-gray-500"
                }>
                  {target.status === "payment_failed" ? "Payment failed" : (target.status ?? "-")}
                </span>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Member Support</h1>
              <p className="text-gray-500 text-sm">
                Live event log. Search by email or name to see a member&apos;s full timeline.
              </p>
            </>
          )}
        </div>

        {/* Stats strip — hidden when viewing a single member */}
        {!target && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
            <p className="text-2xl font-black text-csl-dark tabular-nums">{todayCount}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-0.5">Events today</p>
          </div>
          <div className={`rounded-xl border px-4 py-3 text-center ${failureCount > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
            <p className={`text-2xl font-black tabular-nums ${failureCount > 0 ? "text-red-600" : "text-gray-400"}`}>
              {failureCount}
            </p>
            <p className={`text-xs font-semibold uppercase tracking-wide mt-0.5 ${failureCount > 0 ? "text-red-500" : "text-gray-500"}`}>
              Payment failures
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
            <p className="text-2xl font-black text-csl-dark tabular-nums">{weekJoins}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-0.5">Joins this week</p>
          </div>
        </div>
        )}

        {/* Search form */}
        <form className="flex gap-2 mb-5" method="GET">
          {!showTest ? null : <input type="hidden" name="test" value="1" />}
          {sortBy !== "created_at" && <input type="hidden" name="sortBy" value={sortBy} />}
          {sortDir !== "desc"      && <input type="hidden" name="sortDir" value={sortDir} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search email or name for full member timeline..."
            autoComplete="off"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-csl-dark"
          />
          <button
            type="submit"
            className="bg-csl-dark text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-csl-mid transition-colors"
          >
            Search
          </button>
          {q && (
            <Link
              href={filterUrl(filterState, { q: "" }, isTestMode)}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Clear
            </Link>
          )}
        </form>

        {/* ── Member timeline view (when q is set) ── */}
        {q && (
          <div>
            {results.length === 0 && (
              <p className="text-sm text-gray-500 mb-6">No member found for &ldquo;{q}&rdquo;.</p>
            )}

            {results.length > 1 && (
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-2">
                  {results.length} members matched - select one to view their timeline:
                </p>
                <ul className="divide-y border border-gray-200 rounded-lg overflow-hidden">
                  {results.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`?q=${encodeURIComponent(m.email)}`}
                        className="flex flex-wrap items-center justify-between gap-x-6 px-4 py-3 hover:bg-gray-50 text-sm"
                      >
                        <span className="font-medium text-gray-900">{memberDisplayName(m)}</span>
                        <span className="text-gray-500">{m.email}</span>
                        <span className="text-gray-400 text-xs">{m.plan_name ?? m.membership_tier ?? "-"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {target && (
              <MemberTimeline
                member={{
                  name:           memberDisplayName(target),
                  email:          target.email,
                  plan:           target.plan_name ?? target.membership_tier ?? "-",
                  status:         target.status ?? "-",
                  joinedAt:       target.created_at,
                  isLifetime:     target.is_lifetime,
                  paymentFailedAt: target.payment_failed_at,
                  pendingEmail:   target.pending_email,
                }}
                entries={entries}
                defaultShowTest={isTestMode}
                liveStripe={liveStripe}
              />
            )}
          </div>
        )}

        {/* ── All-events log view (default) ── */}
        {!q && (
          <div>
            {/* Type filter pills */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {TYPE_OPTIONS.map((opt) => (
                <Link
                  key={opt.value}
                  href={filterUrl(filterState, { type: opt.value }, isTestMode)}
                  className={`${pillBase} ${typeFilter === opt.value ? pillActive : pillInactive}`}
                >
                  {opt.label}
                </Link>
              ))}
            </div>

            {/* Period filter pills */}
            <div className="flex flex-wrap items-center gap-1.5 mb-5">
              {PERIOD_OPTIONS.map((opt) => (
                <Link
                  key={opt.value}
                  href={filterUrl(filterState, { period: opt.value }, isTestMode)}
                  className={`${pillBase} ${period === opt.value ? pillActive : pillInactive}`}
                >
                  {opt.label}
                </Link>
              ))}
              <Link
                href={filterUrl(filterState, { test: !showTest }, isTestMode)}
                className={`ml-2 ${pillBase} ${showTest ? pillActive : pillInactive}`}
              >
                {showTest ? "Hide test events" : "Show test events"}
              </Link>
            </div>

            {/* Events table */}
            {events.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center">
                <p className="text-gray-500 text-sm">No events match the current filters.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {events.length} event{events.length !== 1 ? "s" : ""}
                    {period !== "all" && (
                      <span className="font-normal normal-case ml-1 text-gray-400">
                        - {PERIOD_OPTIONS.find((p) => p.value === period)?.label.toLowerCase()}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">Click a member email to view their full timeline</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {(["created_at", "event_email", "event_type"] as SortBy[]).map((col) => {
                          const labels: Record<SortBy, string> = { created_at: "When", event_email: "Member", event_type: "Event" };
                          const isActive = sortBy === col;
                          const chevron = isActive ? (sortDir === "desc" ? " ↓" : " ↑") : " ↕";
                          return (
                            <th key={col} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              <Link href={sortUrl(filterState, col, isTestMode)} className={`hover:text-gray-800 transition-colors ${isActive ? "text-csl-dark" : ""}`}>
                                {labels[col]}<span className="opacity-50">{chevron}</span>
                              </Link>
                            </th>
                          );
                        })}
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Detail</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {events.map((ev) => {
                        const badge  = eventBadge(ev.event_type);
                        const action = eventAction(ev.event_type);
                        const detail = eventDetail(ev.event_type, ev.detail);
                        return (
                          <tr
                            key={ev.id}
                            className={`hover:bg-gray-50 ${ev.is_test ? "opacity-60" : ""}`}
                          >
                            <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                              {formatDatetime(ev.created_at)}
                              {ev.is_test && (
                                <span className="ml-1.5 text-[0.6rem] bg-amber-100 text-amber-700 px-1 py-0.5 rounded">
                                  TEST
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`?q=${encodeURIComponent(ev.event_email ?? "")}`}
                                className="text-csl-dark hover:underline font-medium text-sm"
                              >
                                {ev.event_email ?? "-"}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {detail || <span className="text-gray-300">-</span>}
                            </td>
                            <td className="px-4 py-3">
                              {action && (
                                <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                                  {action}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </PortalShell>
  );
}
