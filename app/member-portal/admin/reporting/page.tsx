import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import DownloadReportButton from "@/components/DownloadReportButton";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import {
  computeSupabaseMetrics,
  MEMBERSHIP_TARGET,
  type MembershipSnapshot,
  type SourceMetrics,
  type SupabaseMemberRow,
} from "@/lib/membership-metrics";

export const metadata: Metadata = { title: "Membership Reporting | CSL Admin" };

// Force dynamic rendering — page reads cookies for auth and must never be ISR-cached
export const dynamic = "force-dynamic";;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-GB");
}

function fmtGbp(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusRow({ label, sb, wp, total, highlight }: {
  label: string;
  sb: number;
  wp: number | null;
  total: number;
  highlight?: "green" | "red" | "amber";
}) {
  const cls =
    highlight === "green" ? "text-green-700 font-semibold" :
    highlight === "red"   ? "text-red-600 font-semibold"   :
    highlight === "amber" ? "text-amber-700 font-semibold" :
    "text-gray-700";
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className={`px-4 py-2.5 text-sm ${cls}`}>{label}</td>
      <td className={`px-4 py-2.5 text-sm text-right tabular-nums ${cls}`}>{fmt(sb)}</td>
      {wp !== null && (
        <td className={`px-4 py-2.5 text-sm text-right tabular-nums ${cls}`}>{fmt(wp)}</td>
      )}
      <td className={`px-4 py-2.5 text-sm text-right tabular-nums font-bold ${cls}`}>{fmt(total)}</td>
    </tr>
  );
}

function PlanTable({ sb, wp }: { sb: SourceMetrics; wp: SourceMetrics | null }) {
  const allPlans = new Set([
    ...Object.keys(sb.by_plan),
    ...(wp ? Object.keys(wp.by_plan) : []),
  ]);
  const planRows = Array.from(allPlans)
    .map((plan) => ({
      plan,
      sbCount: sb.by_plan[plan] ?? 0,
      wpCount: wp?.by_plan[plan] ?? 0,
    }))
    .sort((a, b) => (b.sbCount + b.wpCount) - (a.sbCount + a.wpCount));

  const hasWp = wp !== null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">New platform</th>
            {hasWp && <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Legacy (WP)</th>}
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {planRows.map(({ plan, sbCount, wpCount }) => (
            <tr key={plan}>
              <td className="px-4 py-2.5 text-sm text-gray-700">
                {plan}
                {sb.unknown_plans.includes(plan) || wp?.unknown_plans.includes(plan) ? (
                  <span className="ml-1.5 text-[0.6rem] font-bold uppercase text-amber-700 bg-amber-100 px-1 py-0.5 rounded">Unknown</span>
                ) : null}
              </td>
              <td className="px-4 py-2.5 text-sm text-right tabular-nums text-gray-700">{sbCount > 0 ? fmt(sbCount) : <span className="text-gray-300">-</span>}</td>
              {hasWp && <td className="px-4 py-2.5 text-sm text-right tabular-nums text-gray-700">{wpCount > 0 ? fmt(wpCount) : <span className="text-gray-300">-</span>}</td>}
              <td className="px-4 py-2.5 text-sm text-right tabular-nums font-semibold text-gray-900">{fmt(sbCount + wpCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Delta badge ───────────────────────────────────────────────────────────────

function Delta({ prev, curr, invert }: { prev: number; curr: number; invert?: boolean }) {
  const diff = curr - prev;
  if (diff === 0) return <span className="text-xs text-gray-400">no change</span>;
  const positive = invert ? diff < 0 : diff > 0;
  const sign = diff > 0 ? "+" : "";
  return (
    <span className={`text-xs font-semibold ${positive ? "text-green-600" : "text-red-600"}`}>
      {sign}{fmt(diff)} vs prev snapshot
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReportingPage() {
  const authClient = createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) redirect("/login");

  const db = getSupabase();
  const { data: member } = await db
    .from("members")
    .select("first_name, last_name, name, membership_tier, plan_name, status, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member?.is_admin) redirect("/member-portal");

  // ── Live Supabase query ───────────────────────────────────────────────────

  const { data: supabaseMembers } = await db
    .from("members")
    .select("email, status, plan_name, amount_pence, membership_tier, stripe_subscription_id, user_id");

  const supabaseRows = (supabaseMembers ?? []) as SupabaseMemberRow[];
  const { metrics: liveMetrics, migration: liveMigration, dataQuality: liveQuality } =
    computeSupabaseMetrics(supabaseRows);

  // ── Latest snapshot (for WP legacy data and trend comparison) ────────────

  const { data: snapshots } = await db
    .from("membership_snapshots")
    .select("id, snapshotted_at, wp_as_of_date, metrics")
    .order("snapshotted_at", { ascending: false })
    .limit(10);

  const prevSnap = snapshots?.[1] ?? null;

  // The WP portion comes from the most recent snapshot that has WP data
  const latestWpSnap = snapshots?.find((s) => s.wp_as_of_date) ?? null;
  const wpData = latestWpSnap
    ? (latestWpSnap.metrics as MembershipSnapshot).wordpress_legacy
    : null;
  const wpAsOf = latestWpSnap?.wp_as_of_date ?? null;
  const wpUploadedAt = latestWpSnap?.snapshotted_at ?? null;

  // Combined active total
  const combinedActive = liveMetrics.active + (wpData?.active ?? 0);
  const progressPct    = Math.round((combinedActive / MEMBERSHIP_TARGET) * 1000) / 10;

  // Monthly income
  const combinedMrr = liveMetrics.mrr_pence + (wpData?.mrr_pence ?? 0);

  // Total collected — read from the most recent snapshot that ran a Stripe sweep.
  // The sweep itself runs in the cron job and on WP CSV upload (never on page load).
  const latestStripeSnap = snapshots?.find((s) => (s.metrics as MembershipSnapshot).stripe != null) ?? null;
  const totalCollectedPence = (latestStripeSnap?.metrics as MembershipSnapshot | undefined)?.stripe?.total_collected_pence ?? null;
  const earliestChargeDate  = (latestStripeSnap?.metrics as MembershipSnapshot | undefined)?.stripe?.earliest_charge_date ?? null;
  const stripeSnapDate      = latestStripeSnap?.snapshotted_at ?? null;

  // Migration progress
  const totalKnown =
    liveMigration.migrated +
    liveMigration.migration_in_progress +
    (wpData ? (snapshots?.find((s) => s.wp_as_of_date)?.metrics as MembershipSnapshot | undefined)?.migration?.not_yet_migrated ?? 0 : 0);

  // Previous snapshot for deltas
  const prevMetrics = prevSnap ? (prevSnap.metrics as MembershipSnapshot) : null;
  const prevActive  = prevMetrics
    ? (prevMetrics.combined?.active_total ?? (prevMetrics.supabase.active + (prevMetrics.wordpress_legacy?.active ?? 0)))
    : null;

  const hasWp = wpData !== null;

  return (
    <PortalShell user={{ email: user.email, id: user.id }} member={member}>
      <div className="max-w-4xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Membership Reporting</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
              <span>New platform data: <strong className="text-gray-700">live</strong></span>
              {hasWp ? (
                <span>
                  WordPress data: <strong className="text-gray-700">as of {fmtDate(wpAsOf)}</strong>
                  {wpUploadedAt && ` (uploaded ${fmtDate(wpUploadedAt)})`}
                </span>
              ) : (
                <span className="text-amber-600 font-medium">No WordPress export uploaded yet - totals show new platform only</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DownloadReportButton />
            <Link
              href="/member-portal/admin/reporting/upload"
              className="bg-csl-dark text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-csl-mid transition-colors whitespace-nowrap"
            >
              Upload WP export
            </Link>
          </div>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
            <p className="text-3xl font-black text-csl-dark tabular-nums">{fmt(combinedActive)}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">Active members</p>
            {prevActive !== null && (
              <p className="mt-1"><Delta prev={prevActive} curr={combinedActive} /></p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
            <p className="text-3xl font-black text-csl-dark tabular-nums">{progressPct}%</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">Of {fmt(MEMBERSHIP_TARGET)} target</p>
            <div className="mt-2 bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-csl-gold rounded-full transition-all"
                style={{ width: `${Math.min(progressPct, 100)}%` }}
              />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
            <p className="text-3xl font-black text-csl-dark tabular-nums">{fmtGbp(combinedMrr)}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">Monthly income (excl. lifetime)</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
            <p className="text-3xl font-black text-csl-dark tabular-nums">
              {totalCollectedPence !== null ? fmtGbp(totalCollectedPence) : "—"}
            </p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">Total collected</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {totalCollectedPence !== null && stripeSnapDate
                ? `As of ${fmtDate(stripeSnapDate)}${earliestChargeDate ? ` (charges since ${fmtDate(earliestChargeDate)})` : ""}`
                : "Upload a WP snapshot or wait for the weekly cron to populate"}
            </p>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Status breakdown</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">New platform</th>
                {hasWp && <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Legacy (WP)</th>}
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody>
              {([
                { label: "Active",          sb: liveMetrics.active,         wp: wpData?.active         ?? 0, highlight: "green"  as const },
                { label: "Pending",         sb: liveMetrics.pending,        wp: wpData?.pending        ?? 0, highlight: "amber"  as const },
                { label: "Expired",         sb: liveMetrics.expired,        wp: wpData?.expired        ?? 0, highlight: undefined },
                { label: "Other / unknown", sb: liveMetrics.other,          wp: wpData?.other          ?? 0, highlight: undefined },
                { label: "Cancelled",       sb: liveMetrics.cancelled,      wp: wpData?.cancelled      ?? 0, highlight: undefined },
                { label: "Payment failed",  sb: liveMetrics.payment_failed, wp: wpData?.payment_failed ?? 0, highlight: "red"    as const },
              ]
                .map((r) => ({ ...r, total: r.sb + r.wp }))
                .sort((a, b) => b.total - a.total)
                .filter((r) => r.total > 0 || r.label === "Active")
                .map(({ label, sb, wp, total, highlight }) => (
                  <StatusRow
                    key={label}
                    label={label}
                    sb={sb}
                    wp={hasWp ? wp : null}
                    total={total}
                    highlight={highlight && total > 0 ? highlight : undefined}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Plan breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Active members by plan</h2>
          </div>
          <PlanTable sb={liveMetrics} wp={wpData} />
        </div>

        {/* Migration progress */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Migration progress</h2>
            <p className="text-xs text-gray-500 mt-0.5">How many members have moved to the new platform</p>
          </div>
          <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-black text-green-700 tabular-nums">{fmt(liveMigration.migrated)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Fully migrated</p>
              <p className="text-[0.65rem] text-gray-400">(Supabase + Stripe sub)</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-amber-600 tabular-nums">{fmt(liveMigration.migration_in_progress)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Migration started</p>
              <p className="text-[0.65rem] text-gray-400">(Supabase only, no Stripe sub)</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-gray-500 tabular-nums">
                {hasWp ? fmt((latestWpSnap!.metrics as MembershipSnapshot).migration?.not_yet_migrated ?? 0) : "?"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Not yet migrated</p>
              <p className="text-[0.65rem] text-gray-400">(WordPress only)</p>
            </div>
          </div>
          {totalKnown > 0 && (
            <div className="px-4 pb-4">
              <div className="flex gap-0.5 h-3 rounded-full overflow-hidden">
                <div
                  className="bg-green-500 h-full transition-all"
                  style={{ width: `${(liveMigration.migrated / totalKnown) * 100}%` }}
                  title={`Migrated: ${liveMigration.migrated}`}
                />
                <div
                  className="bg-amber-400 h-full transition-all"
                  style={{ width: `${(liveMigration.migration_in_progress / totalKnown) * 100}%` }}
                  title={`In progress: ${liveMigration.migration_in_progress}`}
                />
                <div
                  className="bg-gray-300 h-full transition-all"
                  style={{ width: `${(((latestWpSnap?.metrics as MembershipSnapshot | undefined)?.migration?.not_yet_migrated ?? 0) / totalKnown) * 100}%` }}
                  title="Not yet migrated"
                />
              </div>
              <div className="flex gap-4 mt-1.5 text-[0.65rem] text-gray-500">
                <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Migrated</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />In progress</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />Not yet migrated</span>
              </div>
            </div>
          )}
        </div>

        {/* Data quality */}
        {(liveQuality.payment_failed_count > 0 ||
          liveQuality.no_auth_account_count > 0 ||
          (wpData && (wpData.pending > 0 || wpData.spam > 0)) ||
          liveMetrics.unknown_plans.length > 0 ||
          wpData?.unknown_plans.length) ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-200">
              <h2 className="text-sm font-bold text-amber-900">Data quality flags</h2>
              <p className="text-xs text-amber-700 mt-0.5">Items that may need attention</p>
            </div>
            <ul className="divide-y divide-amber-100">
              {liveQuality.payment_failed_count > 0 && (
                <li className="px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-amber-800">Members with payment failures (new platform)</span>
                  <span className="font-bold text-red-700 tabular-nums">{fmt(liveQuality.payment_failed_count)}</span>
                </li>
              )}
              {liveQuality.no_auth_account_count > 0 && (
                <li className="px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-amber-800">Members with no linked auth account</span>
                  <span className="font-bold text-amber-700 tabular-nums">{fmt(liveQuality.no_auth_account_count)}</span>
                </li>
              )}
              {wpData && wpData.spam > 0 && (
                <li className="px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-amber-800">WordPress spam/bot accounts (excluded from all counts)</span>
                  <span className="font-bold text-amber-700 tabular-nums">{fmt(wpData.spam)}</span>
                </li>
              )}
              {wpData && wpData.pending > 0 && (
                <li className="px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-amber-800">WordPress pending - real members, payment not completed</span>
                  <span className="font-bold text-amber-700 tabular-nums">{fmt(wpData.pending)}</span>
                </li>
              )}
              {[...liveMetrics.unknown_plans, ...(wpData?.unknown_plans ?? [])].length > 0 && (
                <li className="px-4 py-2.5 text-sm">
                  <span className="text-amber-800">Unrecognised plan names: </span>
                  <span className="font-mono text-xs font-semibold text-amber-900">
                    {Array.from(new Set([...liveMetrics.unknown_plans, ...(wpData?.unknown_plans ?? [])])).join(", ")}
                  </span>
                </li>
              )}
            </ul>
          </div>
        ) : null}

        {/* Trend history */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Snapshot history</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {snapshots && snapshots.length > 0
                ? `${snapshots.length} snapshot${snapshots.length !== 1 ? "s" : ""} recorded. Charts will follow once more history builds up.`
                : "Snapshots run weekly (Monday 06:00 UTC). The first upload will appear here."}
            </p>
          </div>
          {snapshots && snapshots.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Recorded</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">WP data as of</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-500 uppercase tracking-wider">Active members</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {snapshots.map((s) => {
                  const m = s.metrics as MembershipSnapshot;
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-2 text-gray-700">{fmtDateTime(s.snapshotted_at)}</td>
                      <td className="px-4 py-2 text-gray-500">{s.wp_as_of_date ? fmtDate(s.wp_as_of_date) : <span className="text-gray-300">none</span>}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">{fmt(m.combined?.active_total ?? m.supabase.active)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>

      </div>
    </PortalShell>
  );
}
