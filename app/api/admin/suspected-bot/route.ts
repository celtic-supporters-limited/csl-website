import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

const TABLES = ["agm_signatures", "agm_supporters", "agm_proxies", "shareholder_cases"] as const;
type Table = (typeof TABLES)[number];

// The three tables carrying a partial unique index on (email, meeting_ref)
// scoped to status = 'active' AND suspected_bot = false (see
// sql/agm-p5a-followup3-suspected-bot-index.sql). shareholder_cases has no
// such index - a Proxy Interest row is a lead, not a signed instrument, and
// re-submission there was never blocked - so it needs no conflict check.
// All three share the full_name column, which is why this is a plain tuple
// type rather than a per-table field map - the select below can stay a
// literal string.
type EmailScopedTable = "agm_signatures" | "agm_supporters" | "agm_proxies";
const EMAIL_SCOPED_TABLES: readonly EmailScopedTable[] = ["agm_signatures", "agm_supporters", "agm_proxies"];

/**
 * Releases or purges a row flagged suspected_bot - section 8a of the Package
 * 5 brief. A flag nothing filters on is worse than no flag, but a flag
 * nothing acts on is nearly as bad: this is the other half of store-and-flag,
 * the one-click review action for a row a volunteer has actually looked at
 * and judged. Release clears the flag so the row rejoins every count and
 * export; purge deletes it outright once judged genuinely not a person.
 *
 * Release has one conflict release itself creates: excluding suspected_bot
 * rows from the uniqueness check (Package 5a follow-up) means a real person
 * can now sign for real while their email is still held by a flagged row.
 * If a volunteer then releases that flagged row, both rows become active
 * and unflagged at once, which is exactly what the partial index exists to
 * prevent. Checked here, before the update, so the failure is a clear
 * refusal naming the conflicting record rather than a raw database error -
 * the volunteer decides which one to void, this route does not decide for
 * them.
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
    .select("id, suspected_bot, email, meeting_ref")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }
  if (!row.suspected_bot) {
    return NextResponse.json({ error: "This row is not flagged." }, { status: 400 });
  }

  if (action === "release" && EMAIL_SCOPED_TABLES.includes(table as EmailScopedTable)) {
    const { data: conflict } = await db
      .from(table as EmailScopedTable)
      .select("id, full_name")
      .eq("email", row.email)
      .eq("meeting_ref", row.meeting_ref)
      .eq("status", "active")
      .eq("suspected_bot", false)
      .neq("id", id)
      .maybeSingle();

    if (conflict) {
      return NextResponse.json(
        {
          error: `Cannot release: an active record already exists for this email - "${conflict.full_name ?? "unnamed"}" (id ${conflict.id}). Void one of the two records first, then release this one.`,
        },
        { status: 409 }
      );
    }
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
