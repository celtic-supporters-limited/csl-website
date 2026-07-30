import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { applyStatusChange, type AgmStatus, type AgmTable } from "@/lib/agm-change-log";

/**
 * Package 5a - active/withdrawn/voided on any AGM record type, logging the
 * change. Separate from app/api/proxy/revoke/route.ts, which keeps its own
 * URL and "Revoke" vocabulary for agm_proxies but now writes the same
 * 'withdrawn' value through the same lib/agm-change-log.ts helper.
 */
const STATUS_TABLES: Record<Exclude<AgmTable, "agm_resolution_versions">, "status" | "agm_record_status"> = {
  agm_signatures: "status",
  agm_supporters: "status",
  agm_proxies: "status",
  shareholder_cases: "agm_record_status",
};

const VALID_STATUSES: AgmStatus[] = ["active", "withdrawn", "voided"];

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

  let body: { table?: string; id?: string; status?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { table, id, status, reason } = body;

  if (!table || !(table in STATUS_TABLES)) {
    return NextResponse.json({ error: "Unrecognised table" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!status || !VALID_STATUSES.includes(status as AgmStatus)) {
    return NextResponse.json({ error: "status must be active, withdrawn or voided" }, { status: 400 });
  }
  if (!reason?.trim()) return NextResponse.json({ error: "A reason is required." }, { status: 400 });

  const statusColumn = STATUS_TABLES[table as Exclude<AgmTable, "agm_resolution_versions">];

  if (table === "shareholder_cases") {
    const { data: caseRow } = await db.from("shareholder_cases").select("case_type").eq("id", id).maybeSingle();
    if (caseRow?.case_type !== "Proxy Interest") {
      return NextResponse.json({ error: "Only Proxy Interest rows have a status here" }, { status: 400 });
    }
  }

  const result = await applyStatusChange({
    table: table as AgmTable,
    id,
    statusColumn,
    newStatus: status as AgmStatus,
    changedBy: user.email ?? user.id,
    reason: reason.trim(),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, changed: result.changed });
}
