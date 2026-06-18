import { getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import {
  computeSupabaseMetrics,
  MEMBERSHIP_TARGET,
  type MembershipSnapshot,
  type SupabaseMemberRow,
  type SourceMetrics,
  type DataQualityFlags,
} from "@/lib/membership-metrics";

export type ReportData = {
  generatedAt: string;
  combinedActive: number;
  targetMembers: number;
  combinedMrrPence: number;
  totalCollectedPence: number;
  earliestChargeDate: string | null;
  liveMetrics: SourceMetrics;
  wpData: SourceMetrics | null;
  wpAsOfDate: string | null;
  liveMigration: { migrated: number; migration_in_progress: number };
  liveQuality: Pick<DataQualityFlags, "payment_failed_count" | "no_auth_account_count">;
  snapshotCount: number;
};

export async function gatherReportData(): Promise<ReportData> {
  const db = getSupabase();

  const { data: supabaseMembers } = await db
    .from("members")
    .select("email, status, plan_name, amount_pence, membership_tier, stripe_subscription_id, user_id");
  const supabaseRows = (supabaseMembers ?? []) as SupabaseMemberRow[];
  const { metrics: liveMetrics, migration: liveMigration, dataQuality: liveQuality } =
    computeSupabaseMetrics(supabaseRows);

  const { data: snapshots } = await db
    .from("membership_snapshots")
    .select("id, snapshotted_at, wp_as_of_date, metrics")
    .order("snapshotted_at", { ascending: false })
    .limit(10);

  const latestWpSnap = snapshots?.find((s) => s.wp_as_of_date) ?? null;
  const wpData = latestWpSnap
    ? (latestWpSnap.metrics as MembershipSnapshot).wordpress_legacy
    : null;
  const wpAsOfDate = latestWpSnap?.wp_as_of_date ?? null;

  let totalCollectedPence = 0;
  let earliestChargeDate: string | null = null;
  try {
    const stripe = getStripe();
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const batch = await stripe.charges.list({ limit: 100, starting_after: startingAfter });
      for (const charge of batch.data) {
        if (charge.paid && charge.status === "succeeded") {
          totalCollectedPence += charge.amount - (charge.amount_refunded ?? 0);
        }
        earliestChargeDate = new Date(charge.created * 1000)
          .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      }
      hasMore = batch.has_more;
      startingAfter = batch.data[batch.data.length - 1]?.id;
    }
  } catch (e) {
    console.error("[reporting] Stripe error:", e);
  }

  return {
    generatedAt: new Date().toLocaleString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }),
    combinedActive: liveMetrics.active + (wpData?.active ?? 0),
    targetMembers: MEMBERSHIP_TARGET,
    combinedMrrPence: liveMetrics.mrr_pence + (wpData?.mrr_pence ?? 0),
    totalCollectedPence,
    earliestChargeDate,
    liveMetrics,
    wpData,
    wpAsOfDate,
    liveMigration,
    liveQuality,
    snapshotCount: snapshots?.length ?? 0,
  };
}
