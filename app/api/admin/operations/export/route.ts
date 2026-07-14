import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { OperationsReportPdf } from "@/components/OperationsReportPdf";
import type { OperationsReportData, TrafficLight, BackupRow } from "@/components/OperationsReportPdf";

function trafficLight(used: number, limit: number): TrafficLight {
  const pct = (used / limit) * 100;
  if (pct >= 90) return "red";
  if (pct >= 70) return "amber";
  return "green";
}

function bounceTraffic(ratePct: number): TrafficLight {
  if (ratePct >= 5) return "red";
  if (ratePct >= 2) return "amber";
  return "green";
}

function worstOf(statuses: TrafficLight[]): TrafficLight {
  if (statuses.includes("red"))   return "red";
  if (statuses.includes("amber")) return "amber";
  return "green";
}

export async function GET() {
  const authClient = createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabase();
  const { data: adminCheck } = await db
    .from("members")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminCheck?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(now); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);

  const [
    { count: emailsToday },
    { count: emailsMonth },
    { count: bouncesMonth },
    dbSizeResult,
    backupResult,
    stripeResult,
  ] = await Promise.all([
    db.from("email_log").select("id", { count: "exact", head: true }).gte("sent_at", todayStart.toISOString()),
    db.from("email_log").select("id", { count: "exact", head: true }).gte("sent_at", monthStart.toISOString()),
    db.from("email_bounces").select("id", { count: "exact", head: true }).gte("bounced_at", monthStart.toISOString()),
    db.rpc("admin_get_db_size_bytes").then((r) => r),
    db.from("backup_log").select("ran_at, status, total_rows, table_counts, error_msg").order("ran_at", { ascending: false }).limit(6),
    (async () => {
      try {
        const t0 = Date.now();
        await getStripe().balance.retrieve();
        return { ok: true, latencyMs: Date.now() - t0 };
      } catch {
        return { ok: false, latencyMs: 0 };
      }
    })(),
  ]);

  const todayCount  = emailsToday  ?? 0;
  const monthCount  = emailsMonth  ?? 0;
  const bounceCount = bouncesMonth ?? 0;
  const bounceRatePct = monthCount > 0 ? (bounceCount / monthCount) * 100 : 0;
  const dbSizeMb = typeof dbSizeResult.data === "number" ? Math.round(dbSizeResult.data / 1024 / 1024) : 0;

  const backupRows = (backupResult.data ?? []) as BackupRow[];
  const lastSuccess = backupRows.find((r) => r.status === "success") ?? null;
  const lastSuccessAgeHours = lastSuccess
    ? (now.getTime() - new Date(lastSuccess.ran_at).getTime()) / 1000 / 60 / 60
    : null;
  const backupStatus: TrafficLight =
    lastSuccessAgeHours === null ? "red" :
    lastSuccessAgeHours > 48    ? "red" :
    lastSuccessAgeHours > 26    ? "amber" : "green";

  const stripeMode = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_") ? "test" : "live";
  const stripeStatusLight: TrafficLight = !stripeResult.ok ? "red" : stripeMode === "test" ? "amber" : "green";

  const todayStatus  = trafficLight(todayCount,  100);
  const monthStatus  = trafficLight(monthCount,  3000);
  const bounceStatus = bounceTraffic(bounceRatePct);
  const dbStatus     = trafficLight(dbSizeMb, 500);

  const overall = worstOf([todayStatus, monthStatus, bounceStatus, stripeStatusLight, dbStatus, backupStatus]);

  const period = now.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const generatedAt = now.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";

  const reportData: OperationsReportData = {
    generatedAt,
    period,
    overall,
    resend: { todayCount, monthCount, bounceCount, bounceRatePct, todayStatus, monthStatus, bounceStatus },
    stripe: { ok: stripeResult.ok, latencyMs: stripeResult.latencyMs, mode: stripeMode as "test" | "live" },
    supabase: { dbSizeMb, dbStatus },
    backup: { lastSuccess, lastSuccessAgeHours, backupStatus, recentRuns: backupRows },
  };

  const buf = await renderToBuffer(OperationsReportPdf(reportData));
  const dateSlug = now.toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="csl-operations-report-${dateSlug}.pdf"`,
    },
  });
}
