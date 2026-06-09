import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import MemberTimeline from "@/components/MemberTimeline";
import type { TimelineEntry } from "@/components/MemberTimeline";

export const metadata: Metadata = {
  title: "Member Lookup | CSL Admin",
};

// ── Label helpers ─────────────────────────────────────────────────────────────

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    "checkout.completed":       "Joined CSL",
    "invoice.paid":             "Invoice paid",
    "payment.failed":           "Payment failed",
    "subscription.cancelled":   "Membership cancelled",
    "email_change.initiated":   "Email change requested",
    "email_change.confirmed":   "Email change confirmed",
    "password_reset.requested": "Password reset requested",
    "profile.updated":          "Profile updated",
  };
  return labels[type] ?? type;
}

function eventDetail(
  type: string,
  detail: Record<string, unknown> | null
): string {
  if (!detail) return "";
  switch (type) {
    case "checkout.completed":
      return [
        detail.plan_name,
        detail.amount_pence != null
          ? `£${((detail.amount_pence as number) / 100).toFixed(2)}`
          : null,
      ]
        .filter(Boolean)
        .join(" — ");
    case "invoice.paid":
      return detail.amount_pence != null
        ? `£${((detail.amount_pence as number) / 100).toFixed(2)}`
        : "";
    case "email_change.initiated":
      return `Requested change to ${detail.new_email ?? ""}`;
    case "email_change.confirmed":
      return `${detail.old_email ?? ""} → ${detail.new_email ?? ""}`;
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: { q?: string };
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

  // ── Search ────────────────────────────────────────────────────────────────

  const q = searchParams.q?.trim() ?? "";

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
  };

  let results: MemberRow[] = [];

  if (q) {
    const lowerQ = q.toLowerCase();
    // Escape LIKE wildcards in user input
    const escapedQ = lowerQ.replace(/[%_\\]/g, "\\$&");

    let query = db
      .from("members")
      .select(
        "id, user_id, email, name, first_name, last_name, plan_name, membership_tier, status, amount_pence, created_at"
      )
      .limit(10);

    // Email search: exact match (fast, unambiguous)
    // Name search: ILIKE across name, first_name, last_name
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

  // ── Timeline fetch (only when exactly one result) ────────────────────────

  const target = results.length === 1 ? results[0] : null;
  let entries: TimelineEntry[] = [];

  if (target) {
    const [eventsResult, casesResult] = await Promise.all([
      db
        .from("member_events")
        .select("id, event_type, detail, event_email, created_at, is_test")
        .eq("member_id", target.id)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("shareholder_cases")
        .select("id, case_type, status, created_at")
        .eq("email", target.email)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    // Auth events via service-role RPC — queries auth.audit_log_entries.
    // Only available when members.user_id is set (post-migration members).
    type AuthEvent = { id: string; action: string; ip_address: string | null; created_at: string };
    let authEvents: AuthEvent[] = [];
    if (target.user_id) {
      const { data: authData } = await db.rpc("get_member_auth_events", {
        p_user_id: target.user_id,
      });
      authEvents = (authData ?? []) as AuthEvent[];
    }

    // member_events
    for (const ev of eventsResult.data ?? []) {
      entries.push({
        id: ev.id,
        timestamp: ev.created_at,
        type: ev.event_type,
        label: eventLabel(ev.event_type),
        detail: eventDetail(
          ev.event_type,
          (ev.detail ?? null) as Record<string, unknown> | null
        ),
        isTest: ev.is_test ?? false,
      });
    }

    // shareholder_cases (form submissions)
    for (const c of casesResult.data ?? []) {
      entries.push({
        id: c.id,
        timestamp: c.created_at,
        type:
          c.case_type === "Share Tracing"
            ? "share_tracing.submitted"
            : "proxy.submitted",
        label:
          c.case_type === "Share Tracing"
            ? "Share tracing enquiry"
            : "Proxy assignment request",
        detail: c.status ?? "",
      });
    }

    // auth.audit_log_entries (via service-role RPC)
    for (const a of authEvents) {
      entries.push({
        id: a.id,
        timestamp: a.created_at,
        type: `auth.${a.action}`,
        label: authLabel(a.action),
        detail: a.ip_address ? `IP: ${a.ip_address}` : "",
      });
    }

    // Merge into reverse-chronological order
    entries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function displayName(m: MemberRow): string {
    if (m.first_name && m.last_name) return `${m.first_name} ${m.last_name}`;
    return m.name ?? m.email;
  }

  return (
    <PortalShell user={{ email: user.email, id: user.id }} member={adminMember}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Member Lookup</h1>
        <p className="text-gray-500 text-sm mb-6">
          Search by email address or member name to view their full activity
          timeline.
        </p>

        {/* Search form */}
        <form className="flex gap-2 mb-8" method="GET">
          <input
            name="q"
            defaultValue={q}
            placeholder="Email or name"
            autoComplete="off"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-csl-dark"
          />
          <button
            type="submit"
            className="bg-csl-dark text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-csl-mid transition-colors"
          >
            Search
          </button>
        </form>

        {/* No results */}
        {q && results.length === 0 && (
          <p className="text-sm text-gray-500">
            No member found for &ldquo;{q}&rdquo;.
          </p>
        )}

        {/* Disambiguation list */}
        {results.length > 1 && (
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-2">
              {results.length} members matched — select one to view their
              timeline:
            </p>
            <ul className="divide-y border rounded-md">
              {results.map((m) => (
                <li key={m.id}>
                  <a
                    href={`?q=${encodeURIComponent(m.email)}`}
                    className="flex flex-wrap items-center justify-between gap-x-6 px-4 py-3 hover:bg-gray-50 text-sm"
                  >
                    <span className="font-medium text-gray-900">
                      {displayName(m)}
                    </span>
                    <span className="text-gray-500">{m.email}</span>
                    <span className="text-gray-400 text-xs">
                      {m.plan_name ?? m.membership_tier ?? "—"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Timeline */}
        {target && (
          <MemberTimeline
            member={{
              name: displayName(target),
              email: target.email,
              plan: target.plan_name ?? target.membership_tier ?? "—",
              status: target.status ?? "—",
              joinedAt: target.created_at,
            }}
            entries={entries}
          />
        )}
      </div>
    </PortalShell>
  );
}
