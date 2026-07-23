import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import MemberSearchSection from "@/components/MemberSearchSection";

export const dynamic = "force-dynamic";

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
  "password.changed":         { label: "Password changed", cls: "bg-blue-50 text-blue-700 border-blue-100"   },
};

function eventBadge(type: string): { label: string; cls: string } {
  return EVENT_BADGE[type] ?? { label: type.replace(/\./g, " "), cls: "bg-gray-100 text-gray-600 border-gray-200" };
}

function eventAction(type: string): string | null {
  if (type === "payment.failed") return "Ask member to update card in portal";
  return null;
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
  state: { type: TypeFilter; period: PeriodFilter; test: boolean; sortBy: SortBy; sortDir: SortDir },
  override: Partial<typeof state>,
  testModeDefault: boolean
): string {
  const m = { ...state, ...override };
  const p = new URLSearchParams();
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
  state: { type: TypeFilter; period: PeriodFilter; test: boolean; sortBy: SortBy; sortDir: SortDir },
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
  searchParams: { type?: string; period?: string; test?: string; sortBy?: string; sortDir?: string };
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

  // ── Parse filter params (non-PII only) ───────────────────────────────────

  const isTestMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? false;
  const typeFilter = (searchParams.type   ?? "all")  as TypeFilter;
  const period     = (searchParams.period ?? "30d") as PeriodFilter;
  const showTest   = searchParams.test === "1" ? true
    : searchParams.test === "0" ? false
    : isTestMode;
  const sortBy  = (["created_at", "event_email", "event_type"].includes(searchParams.sortBy ?? "")
    ? searchParams.sortBy : "created_at") as SortBy;
  const sortDir = (searchParams.sortDir === "asc" ? "asc" : "desc") as SortDir;
  const filterState = { type: typeFilter, period, test: showTest, sortBy, sortDir };

  // ── Date bounds ───────────────────────────────────────────────────────────

  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const periodStart: string | null =
    period === "today" ? todayStart.toISOString()
    : period === "7d"  ? new Date(now - 7  * 86400000).toISOString()
    : period === "30d" ? new Date(now - 30 * 86400000).toISOString()
    : null;

  // ── Stats ─────────────────────────────────────────────────────────────────

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
    db.from("members").select("id", { count: "exact", head: true }).eq("status", "payment_failed"),
    weekQ,
  ]);

  const todayCount   = todayEventsRes.count ?? 0;
  const failureCount = failuresRes.count    ?? 0;
  const weekJoins    = weekJoinsRes.count   ?? 0;

  // ── All-events log ────────────────────────────────────────────────────────

  type EventRow = {
    id: string;
    event_type: string;
    detail: Record<string, unknown> | null;
    event_email: string | null;
    is_test: boolean;
    created_at: string;
  };

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

  const { data: eventsData } = await evQ;
  const events = (eventsData ?? []) as EventRow[];

  // ── Render ────────────────────────────────────────────────────────────────

  const pillBase    = "px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors";
  const pillActive  = "bg-csl-dark text-white border-csl-dark";
  const pillInactive = "bg-white text-gray-600 border-gray-300 hover:bg-gray-50";

  return (
    <PortalShell user={{ email: user.email, id: user.id }} member={adminMember}>
      <div className="max-w-5xl">

        {/* Stats strip */}
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

        {/* Member search — POST only, no PII in URL */}
        <MemberSearchSection defaultShowTest={isTestMode} />

        {/* All-events log */}
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
                <p className="text-xs text-gray-400">Search by email above to view a member&apos;s full timeline</p>
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
                          <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                            {ev.event_email ?? "-"}
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
                            {action ? (
                              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                                {action}
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
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

      </div>
    </PortalShell>
  );
}
