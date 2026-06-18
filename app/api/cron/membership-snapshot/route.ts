import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { sweepStripeCharges } from "@/lib/stripe";
import {
  computeSupabaseMetrics,
  MEMBERSHIP_TARGET,
  type MembershipSnapshot,
  type SupabaseMemberRow,
} from "@/lib/membership-metrics";

// Vercel cron: every Monday at 06:00 UTC — see vercel.json
// Authorization header is set by Vercel using the CRON_SECRET env var.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabase();

  // ── Live Supabase data ────────────────────────────────────────────────────

  const { data: supabaseMembers, error: dbError } = await db
    .from("members")
    .select("email, status, plan_name, amount_pence, membership_tier, stripe_subscription_id, user_id");

  if (dbError) {
    console.error("[cron/membership-snapshot] DB error:", dbError.message);
    return NextResponse.json({ error: "DB query failed" }, { status: 500 });
  }

  const supabaseRows = (supabaseMembers ?? []) as SupabaseMemberRow[];
  const { metrics: sbMetrics, migration, dataQuality } = computeSupabaseMetrics(supabaseRows);

  // ── Carry forward WP data from the most recent snapshot that has it ──────

  const { data: prevSnaps } = await db
    .from("membership_snapshots")
    .select("wp_as_of_date, metrics")
    .not("wp_as_of_date", "is", null)
    .order("snapshotted_at", { ascending: false })
    .limit(1);

  const prevWpSnap = prevSnaps?.[0] ?? null;
  const wpData     = prevWpSnap
    ? (prevWpSnap.metrics as MembershipSnapshot).wordpress_legacy
    : null;
  const wpAsOfDate = prevWpSnap?.wp_as_of_date ?? null;

  const legacyNotYetMigrated =
    prevWpSnap
      ? (prevWpSnap.metrics as MembershipSnapshot).migration?.not_yet_migrated ?? 0
      : 0;

  // ── Stripe charge sweep ───────────────────────────────────────────────────

  let stripeData: { total_collected_pence: number; earliest_charge_date: string | null; country_breakdown: Record<string, number> } | null = null;
  try {
    stripeData = await sweepStripeCharges();
    console.log(`[cron/membership-snapshot] Stripe sweep: £${(stripeData.total_collected_pence / 100).toFixed(0)} total collected`);
  } catch (e) {
    console.error("[cron/membership-snapshot] Stripe sweep failed:", e);
  }

  // ── Build snapshot ────────────────────────────────────────────────────────

  const combinedActive = sbMetrics.active + (wpData?.active ?? 0);
  const unknownPlanCount =
    sbMetrics.unknown_plans.length + (wpData?.unknown_plans.length ?? 0);

  const snapshot: MembershipSnapshot = {
    supabase: sbMetrics,
    wordpress_legacy: wpData,
    combined: {
      active_total: combinedActive,
      target: MEMBERSHIP_TARGET,
      progress_pct: Math.round((combinedActive / MEMBERSHIP_TARGET) * 1000) / 10,
    },
    migration: {
      ...migration,
      not_yet_migrated: legacyNotYetMigrated,
      total: migration.migrated + migration.migration_in_progress + legacyNotYetMigrated,
    },
    data_quality: {
      ...dataQuality,
      wp_pending_count: wpData?.pending ?? 0,
      wp_spam_count: wpData?.spam ?? 0,
      unknown_plan_count: unknownPlanCount,
    },
    wp_as_of_date: wpAsOfDate,
    stripe: stripeData,
  };

  const { error: insertError } = await db.from("membership_snapshots").insert({
    wp_as_of_date: wpAsOfDate,
    metrics: snapshot,
  });

  if (insertError) {
    console.error("[cron/membership-snapshot] Insert failed:", insertError.message);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  await db.from("site_config").upsert(
    { key: "active_members", value: String(combinedActive), updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  revalidatePath("/");

  console.log(`[cron/membership-snapshot] Snapshot written. Active: ${combinedActive}, WP as-of: ${wpAsOfDate ?? "none"}`);
  return NextResponse.json({ ok: true, active_total: combinedActive, wp_as_of_date: wpAsOfDate });
}
