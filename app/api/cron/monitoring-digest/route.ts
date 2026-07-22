import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { sendMonitoringDigest } from "@/lib/resend";
import type { DigestData, DigestTrafficLight } from "@/lib/resend";

// Triggered daily at 07:00 UTC by GitHub Actions (.github/workflows/monitoring-digest.yml).
// Authorization header set by the workflow using the CRON_SECRET env var.

function trafficLight(used: number, limit: number): DigestTrafficLight {
  const pct = (used / limit) * 100;
  if (pct >= 90) return "red";
  if (pct >= 70) return "amber";
  return "green";
}

function bounceTraffic(ratePct: number): DigestTrafficLight {
  if (ratePct >= 5) return "red";
  if (ratePct >= 2) return "amber";
  return "green";
}

function worstOf(statuses: DigestTrafficLight[]): DigestTrafficLight {
  if (statuses.includes("red"))   return "red";
  if (statuses.includes("amber")) return "amber";
  return "green";
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const window24h  = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const db = getSupabase();

  try {
    const [
      { count: emailsSent24h },
      { count: emailsSentMonth },
      { count: bounces24h },
      { count: bouncesMonth },
      { count: newJoins24h },
      { count: paymentFailures24h },
      { count: cancellations24h },
      dbSizeResult,
      backupResult,
      stripeResult,
    ] = await Promise.all([
      db.from("email_log").select("id", { count: "exact", head: true }).gte("sent_at", window24h.toISOString()),
      db.from("email_log").select("id", { count: "exact", head: true }).gte("sent_at", monthStart.toISOString()),
      db.from("email_bounces").select("id", { count: "exact", head: true }).gte("bounced_at", window24h.toISOString()),
      db.from("email_bounces").select("id", { count: "exact", head: true }).gte("bounced_at", monthStart.toISOString()),
      db.from("members").select("id", { count: "exact", head: true }).gte("created_at", window24h.toISOString()),
      db.from("member_events").select("id", { count: "exact", head: true })
        .eq("event_type", "payment.failed").gte("created_at", window24h.toISOString()),
      db.from("member_events").select("id", { count: "exact", head: true })
        .eq("event_type", "subscription.cancelled").gte("created_at", window24h.toISOString()),
      db.rpc("admin_get_db_size_bytes").then((r) => r),
      db.from("backup_log").select("ran_at, status, error_msg").order("ran_at", { ascending: false }).limit(1),
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

    const sent24h   = emailsSent24h   ?? 0;
    const sentMonth = emailsSentMonth ?? 0;
    const b24h      = bounces24h      ?? 0;
    const bMonth    = bouncesMonth    ?? 0;
    const bounceRate = sentMonth > 0 ? (bMonth / sentMonth) * 100 : 0;

    const dbSizeMb = typeof dbSizeResult.data === "number"
      ? Math.round(dbSizeResult.data / 1024 / 1024) : 0;

    const lastBackup = (backupResult.data ?? [])[0] as
      { ran_at: string; status: string; error_msg: string | null } | undefined;
    const lastRanAt = lastBackup?.ran_at ?? null;
    const ageHours = lastRanAt
      ? (now.getTime() - new Date(lastRanAt).getTime()) / 1000 / 60 / 60 : null;

    const backupStatus: DigestTrafficLight =
      ageHours === null ? "red" :
      ageHours > 48     ? "red" :
      ageHours > 26     ? "amber" : "green";

    const stripeMode = stripeResult.mode as "test" | "live" | "unknown";
    const stripeStatus: DigestTrafficLight =
      !stripeResult.ok ? "red" : stripeMode === "test" ? "amber" : "green";

    const todayStatus  = trafficLight(sent24h,   100);
    const monthStatus  = trafficLight(sentMonth, 3000);
    const bStatus      = bounceTraffic(bounceRate);
    const dbStatus     = trafficLight(dbSizeMb,  500);

    const overall = worstOf([todayStatus, monthStatus, bStatus, backupStatus, stripeStatus, dbStatus]);

    const attentionItems: string[] = [];
    if (todayStatus !== "green")  attentionItems.push(`Email sends today: ${sent24h} / 100 (${todayStatus === "red" ? "limit reached" : "approaching limit"})`);
    if (monthStatus !== "green")  attentionItems.push(`Email sends this month: ${sentMonth} / 3,000 (${monthStatus === "red" ? "limit reached" : "approaching limit"})`);
    if (bStatus !== "green")      attentionItems.push(`Bounce rate: ${bounceRate.toFixed(1)}% this month (${bStatus === "red" ? "above 5% - action required" : "approaching 2% warning threshold"})`);
    if ((paymentFailures24h ?? 0) > 0) attentionItems.push(`Payment failures: ${paymentFailures24h} in the last 24h - check member timelines`);
    if ((cancellations24h ?? 0) > 0)   attentionItems.push(`Subscription cancellations: ${cancellations24h} in the last 24h`);
    if (backupStatus !== "green") attentionItems.push(`Backup: last success was ${ageHours != null ? Math.round(ageHours) + "h ago" : "never"} (${backupStatus === "red" ? "overdue" : "approaching threshold"})`);
    if (!stripeResult.ok)         attentionItems.push("Stripe: API unreachable - checkout and webhook processing will fail");
    if (stripeMode === "test")    attentionItems.push("Stripe: running in test mode - switch to live keys before go-live");
    if (dbStatus !== "green")     attentionItems.push(`Supabase: database ${dbSizeMb} MB / 500 MB (${dbStatus === "red" ? "critical" : "approaching limit"})`);

    const fromTs = window24h.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
    const toTs   = now.toLocaleString("en-GB",       { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
    const dateRange = `${fromTs} - ${toTs} UTC`;

    const data: DigestData = {
      dateRange,
      overall,
      email: { sent24h, sentMonth, bounces24h: b24h, bounceRate, todayStatus, monthStatus, bounceStatus: bStatus },
      members: { newJoins24h: newJoins24h ?? 0, paymentFailures24h: paymentFailures24h ?? 0, cancellations24h: cancellations24h ?? 0 },
      backup: { lastStatus: lastBackup?.status ?? "none", lastRanAt, ageHours, backupStatus },
      stripe: { ok: stripeResult.ok, latencyMs: stripeResult.latencyMs, mode: stripeMode, stripeStatus },
      supabase: { dbSizeMb, dbStatus },
      attentionItems,
    };

    await sendMonitoringDigest(data);

    console.log("[cron/monitoring-digest] Digest sent successfully", { overall, attentionItems: attentionItems.length });
    return NextResponse.json({ ok: true, overall, attentionItems });

  } catch (err) {
    console.error("[cron/monitoring-digest] Failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Digest failed" }, { status: 500 });
  }
}
