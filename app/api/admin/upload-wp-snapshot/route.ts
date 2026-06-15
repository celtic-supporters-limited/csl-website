import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
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
    .select("email, status, plan_name, amount_pence, membership_tier, stripe_subscription_id, user_id");

  if (dbError) {
    console.error("[upload-wp-snapshot] DB error:", dbError.message);
    return NextResponse.json({ error: "Failed to read member data" }, { status: 500 });
  }

  const supabaseRows = (supabaseMembers ?? []) as SupabaseMemberRow[];
  const supabaseEmails = new Set(supabaseRows.map((m) => m.email.toLowerCase()));

  const snapshot = buildSnapshot({ supabaseRows, wpRows, supabaseEmails, wpAsOfDate: asOfDate });

  const { error: insertError } = await db.from("membership_snapshots").insert({
    wp_as_of_date: asOfDate,
    metrics: snapshot,
  });

  if (insertError) {
    console.error("[upload-wp-snapshot] Insert failed:", insertError.message);
    return NextResponse.json({ error: "Failed to save snapshot" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    rows_parsed: wpRows.length,
    legacy_count: snapshot.migration?.not_yet_migrated ?? 0,
    active_combined: snapshot.combined.active_total,
  });
}
