import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { sweepStripeCharges, getStripe } from "@/lib/stripe";
import {
  parseWordPressCsv,
  buildSnapshot,
  type SupabaseMemberRow,
} from "@/lib/membership-metrics";

export async function POST(req: NextRequest) {
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

  let csvText: string;
  let asOfDate: string;
  try {
    const form = await req.formData();
    const file = form.get("csv") as File | null;
    asOfDate   = (form.get("as_of_date") as string | null) ?? "";
    if (!file || !asOfDate) {
      return NextResponse.json({ error: "Missing csv file or as_of_date" }, { status: 400 });
    }
    csvText = await file.text();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const wpRows = parseWordPressCsv(csvText);
  if (wpRows.length === 0) {
    return NextResponse.json({ error: "No valid rows found in CSV. Check the file format." }, { status: 400 });
  }

  const { data: supabaseMembers, error: dbError } = await db
    .from("members")
    .select("email, status, plan_name, amount_pence, membership_tier, stripe_subscription_id, user_id, created_at, subscription_start_date");

  if (dbError) {
    console.error("[upload-wp-snapshot] DB error:", dbError.message);
    return NextResponse.json({ error: "Failed to read member data" }, { status: 500 });
  }

  const supabaseRows = (supabaseMembers ?? []) as SupabaseMemberRow[];
  const supabaseEmails = new Set(supabaseRows.map((m) => m.email.toLowerCase()));

  let stripeData: { total_collected_pence: number; earliest_charge_date: string | null; country_breakdown: Record<string, number> } | null = null;
  try {
    stripeData = await sweepStripeCharges();
  } catch (e) {
    console.error("[upload-wp-snapshot] Stripe sweep failed:", e);
  }

  const snapshot = buildSnapshot({ supabaseRows, wpRows, supabaseEmails, wpAsOfDate: asOfDate, stripeData });

  const { error: insertError } = await db.from("membership_snapshots").insert({
    wp_as_of_date: asOfDate,
    metrics: snapshot,
  });

  if (insertError) {
    console.error("[upload-wp-snapshot] Insert failed:", insertError.message, insertError.code, insertError.details);
    return NextResponse.json({ error: `Failed to save snapshot: ${insertError.message} (${insertError.code})` }, { status: 500 });
  }

  await db.from("site_config").upsert(
    { key: "active_members", value: String(snapshot.combined.active_total), updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  revalidatePath("/");

  // Backfill subscription_start_date for any members row where it is null.
  // Matches by email — only updates migrated WP members who already have a row.
  // WP-only members (no members row yet) are handled by the migration scripts.
  let backfilled = 0;
  const wpByEmail = new Map(wpRows.map((r) => [r.email, r]));
  for (const sbRow of supabaseRows) {
    const wpRow = wpByEmail.get(sbRow.email.toLowerCase());
    if (wpRow?.start_date) {
      const { error: backfillError } = await db
        .from("members")
        .update({ subscription_start_date: new Date(wpRow.start_date).toISOString() })
        .eq("email", sbRow.email)
        .is("subscription_start_date", null);
      if (!backfillError) backfilled++;
    }
  }
  if (backfilled > 0) {
    console.log(`[upload-wp-snapshot] Backfilled subscription_start_date for ${backfilled} WP members`);
  }

  // Stripe-based backfill for new-platform members not in the WP export.
  // Any member who has a stripe_subscription_id but still null subscription_start_date
  // joined via the new Stripe checkout before PR #69 added automatic population.
  const needsStripeFetch = supabaseRows.filter(
    (r) => r.stripe_subscription_id && !r.subscription_start_date
  );
  let stripeBackfilled = 0;
  for (const sbRow of needsStripeFetch) {
    try {
      const sub = await getStripe().subscriptions.retrieve(sbRow.stripe_subscription_id!);
      const startDate = new Date(sub.start_date * 1000).toISOString();
      const { error: stripeBackfillError } = await db
        .from("members")
        .update({ subscription_start_date: startDate })
        .eq("email", sbRow.email)
        .is("subscription_start_date", null);
      if (!stripeBackfillError) {
        stripeBackfilled++;
        console.log(`[upload-wp-snapshot] Stripe backfill: ${sbRow.email} start_date=${startDate}`);
      }
    } catch (e) {
      console.error(`[upload-wp-snapshot] Stripe fetch failed for ${sbRow.email}:`, e);
    }
  }
  if (stripeBackfilled > 0) {
    console.log(`[upload-wp-snapshot] Stripe-backfilled subscription_start_date for ${stripeBackfilled} members`);
  }

  return NextResponse.json({
    ok: true,
    rows_parsed: wpRows.length,
    legacy_count: snapshot.migration?.not_yet_migrated ?? 0,
    active_combined: snapshot.combined.active_total,
    start_dates_backfilled: backfilled + stripeBackfilled,
  });
}
