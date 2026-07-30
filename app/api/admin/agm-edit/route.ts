import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { applyFieldEdit, type AgmTable } from "@/lib/agm-change-log";

/**
 * Package 5a - edits any field on any AGM record, logging every change.
 * Brief section 2c: no field is locked, no record is single-shot.
 *
 * The editable-fields allowlist below is deliberately narrower than "every
 * column": id, created_at, created_by, resolution_version_id, meeting_ref,
 * capture_status, shareholder_tag, member_tag and case_type are excluded.
 * Those are structural or server-derived, not the mistyped-reference kind of
 * field a volunteer corrects - the spec says no exceptions, so this line is
 * a judgement call, not a literal reading, and is flagged as such in the
 * report rather than decided silently.
 */
const EDITABLE_FIELDS: Record<AgmTable, string[]> = {
  agm_resolution_versions: [
    "body", "version_label", "declaration_text", "consent_text",
    "supporting_statement", "is_placeholder",
  ],
  agm_signatures: [
    "full_name", "address_line_1", "address_line_2", "address_town", "address_postcode",
    "email", "how_held", "computershare_srn", "nominee_platform", "nominee_platform_other",
    "year_of_purchase", "shares_held", "share_class",
    "eligibility_confirmed", "resolution_supported", "consent_given",
    "signature_name", "signed_at",
  ],
  agm_supporters: ["full_name", "email", "consent_given"],
  agm_proxies: [
    "full_name", "address_line_1", "address_line_2", "address_town", "address_postcode",
    "email", "how_held", "computershare_srn", "nominee_platform", "nominee_platform_other",
    "shares_held", "share_class", "appointee_name",
    "signature_name", "signed_at", "nominee_instruction_sent", "revoked_reason",
  ],
  // Proxy Interest rows only - enforced by checking case_type below, not by
  // a separate table.
  shareholder_cases: ["contact_name", "email", "phone", "notes", "enquiry_source"],
};

// Fields where an edit is the clearest case of changing the record of what
// someone actually agreed to or was named as. The client is expected to warn
// before sending these, but the server names them back in the response so a
// future caller cannot skip the warning by not asking.
const EVIDENTIAL_FIELDS = new Set([
  "body", "declaration_text", "consent_text", "supporting_statement",
  "signature_name", "signed_at", "appointee_name",
]);

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

  let body: { table?: string; id?: string; changes?: Record<string, unknown>; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { table, id, changes, reason } = body;

  if (!table || !(table in EDITABLE_FIELDS)) {
    return NextResponse.json({ error: "Unrecognised table" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!reason?.trim()) return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return NextResponse.json({ error: "changes must be an object" }, { status: 400 });
  }

  const allowlist = EDITABLE_FIELDS[table as AgmTable];
  const requestedFields = Object.keys(changes);
  const disallowed = requestedFields.filter((f) => !allowlist.includes(f));
  if (disallowed.length > 0) {
    return NextResponse.json(
      { error: `Field(s) not editable on ${table}: ${disallowed.join(", ")}` },
      { status: 400 }
    );
  }
  if (requestedFields.length === 0) {
    return NextResponse.json({ error: "No fields supplied" }, { status: 400 });
  }

  if (table === "shareholder_cases") {
    const { data: caseRow } = await db.from("shareholder_cases").select("case_type").eq("id", id).maybeSingle();
    if (caseRow?.case_type !== "Proxy Interest") {
      return NextResponse.json({ error: "Only Proxy Interest rows are editable here" }, { status: 400 });
    }
  }

  const result = await applyFieldEdit({
    table: table as AgmTable,
    id,
    changes,
    changedBy: user.email ?? user.id,
    reason: reason.trim(),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    changed: result.changed,
    evidential: requestedFields.some((f) => EVIDENTIAL_FIELDS.has(f)),
  });
}
