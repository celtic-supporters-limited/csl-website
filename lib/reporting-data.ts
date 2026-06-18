import { getSupabase } from "@/lib/supabase";
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
  countryBreakdown: Record<string, number>;
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

  // Read Stripe totals from the most recent snapshot that ran a sweep.
  // The sweep runs in the cron job and on WP CSV upload — never on demand here.
  const latestStripeSnap = snapshots?.find((s) => (s.metrics as MembershipSnapshot).stripe != null) ?? null;
  const latestStripe = (latestStripeSnap?.metrics as MembershipSnapshot | undefined)?.stripe;
  const totalCollectedPence = latestStripe?.total_collected_pence ?? 0;
  const earliestChargeDate  = latestStripe?.earliest_charge_date ?? null;
  const countryBreakdown    = latestStripe?.country_breakdown ?? {};

  const formattedEarliestDate = earliestChargeDate
    ? new Date(earliestChargeDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return {
    generatedAt: new Date().toLocaleString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }),
    combinedActive: liveMetrics.active + (wpData?.active ?? 0),
    targetMembers: MEMBERSHIP_TARGET,
    combinedMrrPence: liveMetrics.mrr_pence + (wpData?.mrr_pence ?? 0),
    totalCollectedPence,
    earliestChargeDate: formattedEarliestDate,
    countryBreakdown,
    liveMetrics,
    wpData,
    wpAsOfDate,
    liveMigration,
    liveQuality,
    snapshotCount: snapshots?.length ?? 0,
  };
}
