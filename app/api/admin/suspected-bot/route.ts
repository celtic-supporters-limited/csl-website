import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

const TABLES = ["agm_signatures", "agm_supporters", "agm_proxies", "shareholder_cases"] as const;
type Table = (typeof TABLES)[number];

/**
 * Releases or purges a row flagged suspected_bot - section 8a of the Package
 * 5 brief. A flag nothing filters on is worse than no flag, but a flag
 * nothing acts on is nearly as bad: this is the other half of store-and-flag,
 * the one-click review action for a row a volunteer has actually looked at
 * and judged. Release clears the flag so the row rejoins every count and
 * export; purge deletes it outright once judged genuinely not a person.
 */
export async function POST(request: NextRequest) {
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

  let body: { table?: string; id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { table, id, action } = body;
  if (!table || !TABLES.includes(table as Table)) {
    return NextResponse.json({ error: "table must be one of agm_signatures, agm_supporters, agm_proxies, shareholder_cases" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (action !== "release" && action !== "purge") {
    return NextResponse.json({ error: "action must be release or purge" }, { status: 400 });
  }

  const { data: row, error: fetchError } = await db
    .from(table as Table)
    .select("id, suspected_bot")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }
  if (!row.suspected_bot) {
    return NextResponse.json({ error: "This row is not flagged." }, { status: 400 });
  }

  if (action === "release") {
    const { error } = await db.from(table as Table).update({ suspected_bot: false }).eq("id", id);
    if (error) {
      console.error("[suspected-bot] release error:", error.message);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  } else {
    const { error } = await db.from(table as Table).delete().eq("id", id);
    if (error) {
      console.error("[suspected-bot] purge error:", error.message);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id, action });
}
