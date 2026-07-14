import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import BackupButton from "@/components/BackupButton";

export const metadata: Metadata = { title: "Operations | CSL Admin" };
export const dynamic = "force-dynamic";

// ── Status helpers ─────────────────────────────────────────────────────────────

type TrafficLight = "green" | "amber" | "red";

function trafficLight(used: number, limit: number): TrafficLight {
  const pct = (used / limit) * 100;
  if (pct >= 90) return "red";
  if (pct >= 70) return "amber";
  return "green";
}

// Bounce rate uses different thresholds - Resend flags >5% as a deliverability risk.
function bounceStatus(ratePct: number): TrafficLight {
  if (ratePct >= 5)  return "red";
  if (ratePct >= 2)  return "amber";
  return "green";
}

function worstStatus(statuses: TrafficLight[]): TrafficLight {
  if (statuses.includes("red"))   return "red";
  if (statuses.includes("amber")) return "amber";
  return "green";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusDot({ s }: { s: TrafficLight }) {
  const cls =
    s === "red"   ? "bg-red-500"   :
    s === "amber" ? "bg-amber-400" :
                    "bg-green-500";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${cls}`} />;
}

function Metric({
  label,
  used,
  limit,
  unit = "",
  warning,
}: {
  label: string;
  used: number;
  limit: number;
  unit?: string;
  warning?: string;
}) {
  const s = trafficLight(used, limit);
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const remaining = limit - used;
  const barCls =
    s === "red"   ? "bg-red-500"   :
    s === "amber" ? "bg-amber-400" :
                    "bg-green-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-gray-700 font-medium">
          <StatusDot s={s} />
          {label}
        </span>
        <span className="tabular-nums text-gray-600 text-xs">
          {used.toLocaleString("en-GB")} / {limit.toLocaleString("en-GB")}{unit}
          <span className="text-gray-400 ml-1">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
        <div className={`h-2 rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500">
        {remaining.toLocaleString("en-GB")}{unit} remaining
      </p>
      {s === "red" && warning && (
        <p className="text-xs text-red-600 font-medium">{warning}</p>
      )}
    </div>
  );
}

function StaticLimit({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex justify-between items-start text-sm py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className="text-right ml-4">
        <span className="text-gray-900 font-medium">{value}</span>
        {note && <span className="block text-xs text-amber-600 mt-0.5">{note}</span>}
      </span>
    </div>
  );
}

function ServiceCard({
  title,
  plan,
  upgrade,
  children,
}: {
  title: string;
  plan: string;
  upgrade?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{plan}</p>
      </div>
      <div className="space-y-4">{children}</div>
      {upgrade && (
        <p className="text-xs text-gray-500 border-t border-gray-100 pt-3 mt-2">
          {upgrade}
        </p>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function OperationsPage() {
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

  // ── Resend: daily and monthly email counts ────────────────────────────────

  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    { count: emailsToday },
    { count: emailsThisMonth },
    { count: bouncesThisMonth },
  ] = await Promise.all([
    db.from("email_log").select("id", { count: "exact", head: true }).gte("sent_at", todayStart.toISOString()),
    db.from("email_log").select("id", { count: "exact", head: true }).gte("sent_at", monthStart.toISOString()),
    db.from("email_bounces").select("id", { count: "exact", head: true }).gte("bounced_at", monthStart.toISOString()),
  ]);

  const todayCount   = emailsToday       ?? 0;
  const monthCount   = emailsThisMonth   ?? 0;
  const bounceCount  = bouncesThisMonth  ?? 0;
  const bounceRatePct = monthCount > 0 ? (bounceCount / monthCount) * 100 : 0;

  // ── Supabase: database size ───────────────────────────────────────────────

  let dbSizeBytes = 0;
  try {
    const { data } = await db.rpc("admin_get_db_size_bytes");
    dbSizeBytes = typeof data === "number" ? data : 0;
  } catch {
    // RPC not yet created - show 0 until migration is run
  }

  const dbSizeMb   = Math.round(dbSizeBytes / 1024 / 1024);
  const DB_LIMIT_MB = 500;

  // ── Backup log: last 7 runs ───────────────────────────────────────────────

  const { data: backupRows } = await db
    .from("backup_log")
    .select("ran_at, status, total_rows, table_counts, error_msg")
    .order("ran_at", { ascending: false })
    .limit(7);

  const backupLog = (backupRows ?? []) as {
    ran_at: string;
    status: string;
    total_rows: number | null;
    table_counts: Record<string, number> | null;
    error_msg: string | null;
  }[];

  const lastSuccess = backupLog.find((r) => r.status === "success") ?? null;
  const lastSuccessAge = lastSuccess
    ? (now.getTime() - new Date(lastSuccess.ran_at).getTime()) / 1000 / 60 / 60
    : null;

  // Green: last success < 26h ago. Amber: 26-48h (one missed). Red: >48h or none.
  const backupStatusValue: TrafficLight =
    lastSuccessAge === null      ? "red"   :
    lastSuccessAge > 48          ? "red"   :
    lastSuccessAge > 26          ? "amber" :
                                   "green";

  // ── Overall status ────────────────────────────────────────────────────────

  const allStatuses: TrafficLight[] = [
    trafficLight(todayCount,  100),
    trafficLight(monthCount,  3000),
    bounceStatus(bounceRatePct),
    trafficLight(dbSizeMb,    DB_LIMIT_MB),
    backupStatusValue,
  ];
  const overall = worstStatus(allStatuses);

  const bannerCls =
    overall === "red"   ? "bg-red-50 border-red-200 text-red-800"     :
    overall === "amber" ? "bg-amber-50 border-amber-200 text-amber-800" :
                          "bg-green-50 border-green-200 text-green-800";
  const bannerMsg =
    overall === "red"   ? "One or more services are at or near their free-tier limit. Check the items marked red below." :
    overall === "amber" ? "One or more services are approaching their free-tier limit. Review the items marked amber below." :
                          "All services are within safe operating limits.";

  const lastChecked = now.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
  });

  return (
    <PortalShell user={{ email: user.email, id: user.id }} member={member}>
      <div className="max-w-3xl space-y-5">

        <div>
          <h1 className="text-xl font-bold text-gray-900">Operations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Free-tier usage across all services. Last checked: {lastChecked}
          </p>
        </div>

        {/* Overall status banner */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium ${bannerCls}`}>
          <StatusDot s={overall} />
          {bannerMsg}
        </div>

        {/* Resend */}
        <ServiceCard
          title="Resend"
          plan="Free - 100 emails/day, 3,000 emails/month"
          upgrade="Pro plan: £20/month removes the daily cap and raises the monthly limit to 50,000."
        >
          <Metric
            label="Emails sent today"
            used={todayCount}
            limit={100}
            warning="Daily limit reached. Transactional emails (password resets, payment alerts) and any migration sends will be blocked until tomorrow."
          />
          <Metric
            label="Emails sent this month"
            used={monthCount}
            limit={3000}
            warning="Monthly limit reached. No further emails can be sent this month."
          />
          {/* Bounce rate - uses Resend webhook data, thresholds differ from capacity metrics */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-gray-700 font-medium">
                <StatusDot s={bounceStatus(bounceRatePct)} />
                Bounce rate this month
              </span>
              <span className="tabular-nums text-gray-600 text-xs">
                {bounceCount} bounced / {monthCount} sent
                <span className="text-gray-400 ml-1">({bounceRatePct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div
                className={`h-2 rounded-full ${bounceStatus(bounceRatePct) === "red" ? "bg-red-500" : bounceStatus(bounceRatePct) === "amber" ? "bg-amber-400" : "bg-green-500"}`}
                style={{ width: `${Math.min(100, bounceRatePct * 10)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              {monthCount === 0
                ? "No emails sent this month - rate unavailable"
                : bounceRatePct >= 5
                ? "Resend may suspend sending if bounce rate exceeds 5%. Check Resend Logs for bounced addresses."
                : bounceRatePct >= 2
                ? "Approaching Resend's 5% concern threshold. Check bounced addresses."
                : "Within safe range. Resend flags concern above 5%."}
            </p>
          </div>

          {todayCount >= 80 && todayCount < 100 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Approaching daily limit. If a member migration run is planned today, upgrade Resend to Pro first to avoid blocked sends.
            </p>
          )}
        </ServiceCard>

        {/* Supabase */}
        <ServiceCard
          title="Supabase"
          plan="Free - 500 MB database, 2 active projects"
          upgrade="Pro plan: ~£25/month per project removes auto-pause and adds daily backups with 7-day retention."
        >
          <Metric
            label="Database size"
            used={dbSizeMb}
            limit={DB_LIMIT_MB}
            unit=" MB"
            warning="Database is near capacity. Upgrade to Pro or archive old data before inserting further records."
          />
          <div className="pt-1 space-y-0">
            <StaticLimit
              label="Active projects"
              value="2 / 2"
              note="At ceiling - no headroom for additional environments"
            />
            <StaticLimit
              label="Auto-pause (inactivity)"
              value="After 7 days"
              note="Production mitigated by 3-day cron. Staging requires external keep-alive."
            />
            <StaticLimit
              label="Point-in-time recovery"
              value="Not available"
              note="See Database Backup section below for the current workaround"
            />
          </div>
        </ServiceCard>

        {/* Database Backup */}
        <ServiceCard
          title="Database Backup"
          plan="Daily at 02:00 UTC via GitHub Actions - CSV export emailed to info@celticsupporters.net"
          upgrade="Workaround: Supabase free tier has no point-in-time recovery. This export-to-email approach provides a daily snapshot but cannot restore to an arbitrary point in time. Upgrade to Supabase Pro (~£25/month) for true PITR with 7-day retention."
        >
          {/* Last known good backup */}
          <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border text-sm ${
            backupStatusValue === "red"   ? "bg-red-50 border-red-200"     :
            backupStatusValue === "amber" ? "bg-amber-50 border-amber-200" :
                                            "bg-green-50 border-green-200"
          }`}>
            <StatusDot s={backupStatusValue} />
            <div>
              {lastSuccess ? (
                <>
                  <p className={`font-medium ${
                    backupStatusValue === "red"   ? "text-red-800"   :
                    backupStatusValue === "amber" ? "text-amber-800" :
                                                    "text-green-800"
                  }`}>
                    Last known good backup:{" "}
                    {new Date(lastSuccess.ran_at).toLocaleString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
                    })}
                  </p>
                  {lastSuccess.total_rows != null && (
                    <p className="text-xs mt-0.5 text-gray-600">
                      {lastSuccess.total_rows.toLocaleString("en-GB")} rows across{" "}
                      {lastSuccess.table_counts ? Object.keys(lastSuccess.table_counts).length : "unknown number of"} tables
                    </p>
                  )}
                  {backupStatusValue === "amber" && (
                    <p className="text-xs mt-1 text-amber-700">One scheduled backup may have been missed.</p>
                  )}
                  {backupStatusValue === "red" && lastSuccessAge !== null && lastSuccessAge > 48 && (
                    <p className="text-xs mt-1 text-red-700">More than 48 hours since last successful backup. Check GitHub Actions for failures.</p>
                  )}
                </>
              ) : (
                <p className="font-medium text-red-800">
                  No successful backup recorded. History will appear after the next scheduled run at 02:00 UTC.
                </p>
              )}
            </div>
          </div>

          {/* Recent run history */}
          {backupLog.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Recent runs</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100">
                    <th className="text-left pb-1.5 font-medium">Date / Time (UTC)</th>
                    <th className="text-left pb-1.5 font-medium">Outcome</th>
                    <th className="text-right pb-1.5 font-medium">Rows</th>
                    <th className="text-right pb-1.5 font-medium">Members</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {backupLog.map((row, i) => {
                    const isSuccess = row.status === "success";
                    const memberCount = row.table_counts?.members ?? null;
                    return (
                      <tr key={i} className="text-gray-700">
                        <td className="py-1.5 tabular-nums">
                          {new Date(row.ran_at).toLocaleString("en-GB", {
                            day: "numeric", month: "short",
                            hour: "2-digit", minute: "2-digit", timeZone: "UTC",
                          })}
                        </td>
                        <td className="py-1.5">
                          {isSuccess ? (
                            <span className="text-green-700 font-medium">Success</span>
                          ) : (
                            <span className="text-red-600 font-medium" title={row.error_msg ?? undefined}>Failed</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {row.total_rows != null ? row.total_rows.toLocaleString("en-GB") : "-"}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {memberCount != null ? memberCount.toLocaleString("en-GB") : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Manual backup */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-500 mb-2">Run a manual backup before any migration or bulk data operation.</p>
            <BackupButton />
          </div>
        </ServiceCard>

        {/* Vercel */}
        <ServiceCard
          title="Vercel"
          plan="Hobby (Free) - no SLA"
          upgrade="Pro plan: £20/month adds longer function timeouts, additional cron slots, and team access."
        >
          <div className="space-y-0">
            <StaticLimit label="Bandwidth"             value="100 GB / month"  />
            <StaticLimit label="Serverless function timeout" value="10 seconds max" note="WP snapshot upload and Stripe webhook may approach this limit at scale" />
            <StaticLimit label="Cron jobs"             value="1 / 1 (in use)"  note="Slot fully consumed - no headroom for additional scheduled jobs" />
            <StaticLimit label="Team collaborators"    value="1 (Gary only)"   note="Martin cannot be added as a Vercel collaborator on the Hobby plan" />
            <StaticLimit label="Uptime SLA"            value="None"            />
          </div>
        </ServiceCard>

      </div>
    </PortalShell>
  );
}
