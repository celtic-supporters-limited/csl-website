import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import PortalShell from "@/components/PortalShell";
import BackupButton from "@/components/BackupButton";
import OperationsExportButton from "@/components/OperationsExportButton";

export const metadata: Metadata = { title: "Operations | CSL Admin" };
export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

type TrafficLight = "green" | "amber" | "red";

// ── Helpers ───────────────────────────────────────────────────────────────────

function trafficLight(used: number, limit: number): TrafficLight {
  const pct = (used / limit) * 100;
  if (pct >= 90) return "red";
  if (pct >= 70) return "amber";
  return "green";
}

function bounceStatus(ratePct: number): TrafficLight {
  if (ratePct >= 5) return "red";
  if (ratePct >= 2) return "amber";
  return "green";
}

function worstStatus(statuses: TrafficLight[]): TrafficLight {
  if (statuses.includes("red"))   return "red";
  if (statuses.includes("amber")) return "amber";
  return "green";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Dot({ s }: { s: TrafficLight }) {
  const cls =
    s === "red"   ? "bg-red-500"   :
    s === "amber" ? "bg-amber-400" :
                    "bg-green-500";
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls}`} />;
}

function Badge({ s, label }: { s: TrafficLight; label: string }) {
  const cls =
    s === "red"   ? "bg-red-50 text-red-700 border-red-200"       :
    s === "amber" ? "bg-amber-50 text-amber-700 border-amber-200" :
                    "bg-green-50 text-green-700 border-green-200";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

function StatusPill({
  label,
  value,
  s,
}: {
  label: string;
  value: string;
  s: TrafficLight;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 bg-white text-[11px] text-gray-600 font-medium">
      <Dot s={s} />
      <span className="text-gray-900">{label}</span>
      {value}
    </span>
  );
}

function ServiceCard({
  title,
  plan,
  badge,
  badgeStatus,
  children,
}: {
  title: string;
  plan: string;
  badge: string;
  badgeStatus: TrafficLight;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between pb-3 border-b border-gray-100">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">{plan}</p>
        </div>
        <Badge s={badgeStatus} label={badge} />
      </div>
      {children}
    </div>
  );
}

function MetricRow({
  label,
  value,
  pct,
  s,
}: {
  label: string;
  value: string;
  pct: number;
  s: TrafficLight;
}) {
  const barCls =
    s === "red"   ? "bg-red-500"   :
    s === "amber" ? "bg-amber-400" :
                    "bg-green-500";
  const cappedPct = Math.min(100, pct);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs">
        <Dot s={s} />
        <span className="flex-1 text-gray-700">{label}</span>
        <span className="tabular-nums text-gray-500 text-[11px]">{value}</span>
      </div>
      <div className="h-[3px] w-full rounded-full bg-gray-100">
        <div className={`h-[3px] rounded-full ${barCls}`} style={{ width: `${cappedPct}%` }} />
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  note,
  s,
}: {
  label: string;
  value: string;
  note?: string;
  s?: TrafficLight;
}) {
  const valueColor =
    s === "red"   ? "text-red-600"   :
    s === "amber" ? "text-amber-600" :
    s === "green" ? "text-green-700" :
                    "text-gray-900";
  return (
    <div className="flex justify-between items-start text-xs py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right ml-3">
        <span className={`font-medium ${valueColor}`}>{value}</span>
        {note && <span className="block text-[10px] text-amber-600 mt-0.5">{note}</span>}
      </span>
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

  const now = new Date();
  const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(now); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);

  // ── Data fetches (parallel) ────────────────────────────────────────────────

  const [
    { count: emailsToday },
    { count: emailsThisMonth },
    { count: bouncesThisMonth },
    dbSizeResult,
    backupResult,
    stripeResult,
  ] = await Promise.all([
    db.from("email_log").select("id", { count: "exact", head: true }).gte("sent_at", todayStart.toISOString()),
    db.from("email_log").select("id", { count: "exact", head: true }).gte("sent_at", monthStart.toISOString()),
    db.from("email_bounces").select("id", { count: "exact", head: true }).gte("bounced_at", monthStart.toISOString()),
    db.rpc("admin_get_db_size_bytes").then((r) => r),
    db.from("backup_log").select("ran_at, status, total_rows, table_counts, error_msg").order("ran_at", { ascending: false }).limit(7),
    (async () => {
      try {
        const t0 = Date.now();
        await getStripe().balance.retrieve();
        const mode = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_") ? "test" : "live";
        return { ok: true, latencyMs: Date.now() - t0, mode } as const;
      } catch {
        return { ok: false, latencyMs: 0, mode: "unknown" } as const;
      }
    })(),
  ]);

  const todayCount    = emailsToday       ?? 0;
  const monthCount    = emailsThisMonth   ?? 0;
  const bounceCount   = bouncesThisMonth  ?? 0;
  const bounceRatePct = monthCount > 0 ? (bounceCount / monthCount) * 100 : 0;
  const dbSizeMb      = typeof dbSizeResult.data === "number" ? Math.round(dbSizeResult.data / 1024 / 1024) : 0;

  const backupRows = (backupResult.data ?? []) as {
    ran_at: string; status: string; total_rows: number | null;
    table_counts: Record<string, number> | null; error_msg: string | null;
  }[];
  const lastSuccess = backupRows.find((r) => r.status === "success") ?? null;
  const lastSuccessAge = lastSuccess
    ? (now.getTime() - new Date(lastSuccess.ran_at).getTime()) / 1000 / 60 / 60
    : null;
  const backupStatusValue: TrafficLight =
    lastSuccessAge === null ? "red" :
    lastSuccessAge > 48     ? "red" :
    lastSuccessAge > 26     ? "amber" : "green";

  const stripeStatus: TrafficLight = !stripeResult.ok ? "red" : stripeResult.mode === "test" ? "amber" : "green";

  const todayStatus  = trafficLight(todayCount,  100);
  const monthStatus  = trafficLight(monthCount,  3000);
  const bStatus      = bounceStatus(bounceRatePct);
  const dbStatus     = trafficLight(dbSizeMb, 500);

  const overall = worstStatus([todayStatus, monthStatus, bStatus, stripeStatus, dbStatus, backupStatusValue]);

  const bannerCls =
    overall === "red"   ? "bg-red-50 border-red-200 text-red-800"         :
    overall === "amber" ? "bg-amber-50 border-amber-200 text-amber-800"   :
                          "bg-green-50 border-green-200 text-green-800";
  const bannerMsg =
    overall === "red"   ? "One or more services require immediate attention." :
    overall === "amber" ? "One or more services are approaching their free-tier limit." :
                          "All services are operating within safe limits.";

  const lastChecked = now.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
  });

  return (
    <PortalShell user={{ email: user.email, id: user.id }} member={member}>
      <div className="max-w-3xl space-y-4">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Operations</h1>
            <p className="text-xs text-gray-400 mt-0.5">Last checked: {lastChecked}</p>
          </div>
          <OperationsExportButton />
        </div>

        {/* Overall status banner */}
        <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-xs font-medium ${bannerCls}`}>
          <Dot s={overall} />
          {bannerMsg}
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-1.5">
          <StatusPill label="Daily emails"    value={`${todayCount} / 100`}            s={todayStatus}       />
          <StatusPill label="Monthly emails"  value={`${monthCount} / 3,000`}          s={monthStatus}       />
          <StatusPill label="Bounce rate"     value={`${bounceRatePct.toFixed(1)}%`}   s={bStatus}           />
          <StatusPill label="Stripe"          value={stripeResult.ok ? `${stripeResult.latencyMs} ms` : "Error"} s={stripeStatus} />
          <StatusPill label="Database"        value={`${dbSizeMb} / 500 MB`}           s={dbStatus}          />
          <StatusPill label="Backup"          value={lastSuccess ? `${Math.round(lastSuccessAge ?? 0)}h ago` : "None"} s={backupStatusValue} />
        </div>

        {/* 2×2 service grid */}
        <div className="grid grid-cols-2 gap-3">

          {/* Resend */}
          <ServiceCard
            title="Resend"
            plan="Free - 100 emails/day, 3,000/month"
            badge={todayStatus === "red" || monthStatus === "red" ? "Critical" : todayStatus === "amber" || monthStatus === "amber" ? "Warning" : "Healthy"}
            badgeStatus={worstStatus([todayStatus, monthStatus, bStatus])}
          >
            <MetricRow
              label="Emails today"
              value={`${todayCount} / 100 (${Math.round((todayCount / 100) * 100)}%)`}
              pct={(todayCount / 100) * 100}
              s={todayStatus}
            />
            <MetricRow
              label="Emails this month"
              value={`${monthCount} / 3,000 (${Math.round((monthCount / 3000) * 100)}%)`}
              pct={(monthCount / 3000) * 100}
              s={monthStatus}
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <Dot s={bStatus} />
                <span className="flex-1 text-gray-700">Bounce rate</span>
                <span className="tabular-nums text-gray-500 text-[11px]">
                  {bounceCount} / {monthCount} sent ({bounceRatePct.toFixed(1)}%)
                </span>
              </div>
              <div className="h-[3px] w-full rounded-full bg-gray-100">
                <div
                  className={`h-[3px] rounded-full ${bStatus === "red" ? "bg-red-500" : bStatus === "amber" ? "bg-amber-400" : "bg-green-500"}`}
                  style={{ width: `${Math.min(100, bounceRatePct * 10)}%` }}
                />
              </div>
            </div>
            {todayCount >= 80 && todayCount < 100 && (
              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1">
                Approaching daily limit. Upgrade Resend to Pro before any bulk migration send.
              </p>
            )}
          </ServiceCard>

          {/* Stripe */}
          <ServiceCard
            title="Stripe"
            plan={`Payments API - ${stripeResult.ok && stripeResult.mode === "test" ? "test mode" : stripeResult.ok ? "live mode" : "error"}`}
            badge={stripeStatus === "red" ? "Error" : stripeResult.mode === "test" ? "Test mode" : "Live"}
            badgeStatus={stripeStatus}
          >
            <div className="flex items-center gap-2 text-xs pb-2 border-b border-gray-100">
              <Dot s={stripeResult.ok ? "green" : "red"} />
              <span className="flex-1 text-gray-700">API connectivity</span>
              <span className={`font-medium text-[11px] ${stripeResult.ok ? "text-green-700" : "text-red-600"}`}>
                {stripeResult.ok ? "Connected" : "Unreachable"}
              </span>
            </div>
            <div className="space-y-0">
              <StatRow label="Response time" value={stripeResult.ok ? `${stripeResult.latencyMs} ms` : "-"} />
              <StatRow
                label="Key mode"
                value={stripeResult.mode === "test" ? "Test" : stripeResult.mode === "live" ? "Live" : "Unknown"}
                note={stripeResult.mode === "test" ? "Switch to live keys before go-live" : undefined}
                s={stripeResult.mode === "live" ? "green" : "amber"}
              />
            </div>
            {!stripeResult.ok && (
              <p className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                Stripe is unreachable or the secret key is invalid. Checkout and webhook processing will fail.
              </p>
            )}
          </ServiceCard>

          {/* Supabase */}
          <ServiceCard
            title="Supabase"
            plan="Free - 500 MB database, 2 projects"
            badge={dbStatus === "red" ? "Critical" : "At ceiling"}
            badgeStatus={worstStatus([dbStatus, "amber"])}
          >
            <MetricRow
              label="Database size"
              value={`${dbSizeMb} / 500 MB (${Math.round((dbSizeMb / 500) * 100)}%)`}
              pct={(dbSizeMb / 500) * 100}
              s={dbStatus}
            />
            <div className="pt-1 border-t border-gray-100 space-y-0">
              <StatRow label="Active projects"        value="2 / 2"        note="No headroom for new environments" s="amber" />
              <StatRow label="Auto-pause threshold"   value="After 7 days" note="Cron runs every 3 days - 4 days of headroom" />
              <StatRow label="Point-in-time recovery" value="Not available" note="See backup section below" s="amber" />
            </div>
          </ServiceCard>

          {/* Vercel */}
          <ServiceCard
            title="Vercel"
            plan="Hobby (Free) - no SLA"
            badge="Constrained"
            badgeStatus="amber"
          >
            <div className="space-y-0">
              <StatRow label="Bandwidth"             value="100 GB / month" />
              <StatRow label="Function timeout"      value="10 s max"       note="Upload and webhook at risk at scale" s="amber" />
              <StatRow label="Cron slots"            value="1 / 1"          note="Slot fully consumed" s="amber" />
              <StatRow label="Team access"           value="1 person"       note="Martin cannot be added on Hobby" s="amber" />
              <StatRow label="Uptime SLA"            value="None" />
            </div>
          </ServiceCard>

        </div>

        {/* Database Backup - full width */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <div className="flex items-start justify-between pb-3 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Database backup</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Daily at 02:00 UTC via GitHub Actions - CSV export emailed to info@celticsupporters.net
              </p>
            </div>
            <BackupButton />
          </div>

          {/* Last known good backup */}
          <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-xs ${
            backupStatusValue === "red"   ? "bg-red-50 border-red-200"     :
            backupStatusValue === "amber" ? "bg-amber-50 border-amber-200" :
                                            "bg-green-50 border-green-200"
          }`}>
            <Dot s={backupStatusValue} />
            <div>
              {lastSuccess ? (
                <>
                  <p className={`font-medium ${
                    backupStatusValue === "red" ? "text-red-800" : backupStatusValue === "amber" ? "text-amber-800" : "text-green-800"
                  }`}>
                    Last good backup:{" "}
                    {new Date(lastSuccess.ran_at).toLocaleString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
                    })}
                  </p>
                  {lastSuccess.total_rows != null && (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {lastSuccess.total_rows.toLocaleString("en-GB")} rows across{" "}
                      {lastSuccess.table_counts ? Object.keys(lastSuccess.table_counts).length : "?"} tables
                    </p>
                  )}
                  {backupStatusValue === "amber" && (
                    <p className="text-[10px] text-amber-700 mt-1">One scheduled backup may have been missed.</p>
                  )}
                  {backupStatusValue === "red" && lastSuccessAge !== null && lastSuccessAge > 48 && (
                    <p className="text-[10px] text-red-700 mt-1">More than 48 hours since the last successful backup. Check GitHub Actions.</p>
                  )}
                </>
              ) : (
                <p className="font-medium text-red-800">No successful backup on record. History will appear after the next scheduled run at 02:00 UTC.</p>
              )}
            </div>
          </div>

          {/* Recent run history */}
          {backupRows.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left pb-1.5 font-medium">Date / time (UTC)</th>
                  <th className="text-left pb-1.5 font-medium">Outcome</th>
                  <th className="text-right pb-1.5 font-medium">Total rows</th>
                  <th className="text-right pb-1.5 font-medium">Members</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {backupRows.map((row, i) => {
                  const ok = row.status === "success";
                  return (
                    <tr key={i} className="text-gray-600">
                      <td className="py-1.5 tabular-nums">
                        {new Date(row.ran_at).toLocaleString("en-GB", {
                          day: "numeric", month: "short",
                          hour: "2-digit", minute: "2-digit", timeZone: "UTC",
                        })}
                      </td>
                      <td className="py-1.5">
                        {ok
                          ? <span className="text-green-700 font-medium">Success</span>
                          : <span className="text-red-600 font-medium" title={row.error_msg ?? undefined}>Failed</span>
                        }
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{row.total_rows?.toLocaleString("en-GB") ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.table_counts?.members?.toLocaleString("en-GB") ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
            Workaround until Supabase Pro PITR. Run a manual backup before any bulk data operation.
          </p>
        </div>

      </div>
    </PortalShell>
  );
}
