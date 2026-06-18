import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import {
  computeSupabaseMetrics,
  MEMBERSHIP_TARGET,
  type MembershipSnapshot,
  type SupabaseMemberRow,
} from "@/lib/membership-metrics";
import { MembershipReportPdf } from "@/components/MembershipReportPdf";

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

  // Live Supabase members
  const { data: supabaseMembers } = await db
    .from("members")
    .select("email, status, plan_name, amount_pence, membership_tier, stripe_subscription_id, user_id");
  const supabaseRows = (supabaseMembers ?? []) as SupabaseMemberRow[];
  const { metrics: liveMetrics, migration: liveMigration, dataQuality: liveQuality } =
    computeSupabaseMetrics(supabaseRows);

  // Latest snapshot for WP legacy data
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

  // Stripe total collected
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
    console.error("[export] Stripe error:", e);
  }

  const combinedActive = liveMetrics.active + (wpData?.active ?? 0);
  const combinedMrr = liveMetrics.mrr_pence + (wpData?.mrr_pence ?? 0);

  const buf = await renderToBuffer(
    MembershipReportPdf({
      generatedAt: new Date().toLocaleString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }),
      combinedActive,
      targetMembers: MEMBERSHIP_TARGET,
      combinedMrrPence: combinedMrr,
      totalCollectedPence,
      earliestChargeDate,
      liveMetrics,
      wpData,
      wpAsOfDate,
      liveMigration,
      liveQuality,
      snapshotCount: snapshots?.length ?? 0,
    })
  );

  const filename = `csl-membership-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
