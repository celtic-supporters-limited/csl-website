import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

/**
 * Package 5a - reads the change log for one record, lazily, so the admin
 * pages do not have to load every record's full history on every page load.
 * "Collapsed at the foot of the record" (brief section 2c) means fetched on
 * expand, not shipped with the row.
 */
export async function GET(request: NextRequest) {
  const authClient = createServerSupabase();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const db = getSupabase();

  let { data: member } = await db
    .from("members")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member && user.email) {
    ({ data: member } = await db
      .from("members")
      .select("is_admin")
      .eq("email", user.email)
      .maybeSingle());
  }

  if (!member?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const table = request.nextUrl.searchParams.get("table");
  const recordId = request.nextUrl.searchParams.get("recordId");
  if (!table || !recordId) {
    return NextResponse.json({ error: "table and recordId are required" }, { status: 400 });
  }

  const { data, error } = await db
    .from("agm_change_log")
    .select("id, field_name, old_value, new_value, changed_by, reason, created_at")
    .eq("table_name", table)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[agm-change-log] read error:", error.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
}
