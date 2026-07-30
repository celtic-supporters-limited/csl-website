import { getSupabase } from "@/lib/supabase";

/**
 * Package 5a - the append-only change log, and the one rule that makes every
 * other AGM record safe to edit: a change that cannot be logged must not be
 * written.
 *
 * Both functions below write the log entry (or entries) first, then perform
 * the update, in that order. If the log write fails, the function returns
 * before touching the record at all - there is no window in which a field
 * changes without a corresponding log row. This is a real database
 * transaction only inside applyFieldEdit's own two awaited calls made in
 * sequence, not a wrapping SQL transaction: correct because the log write
 * happening with no following update leaves an orphaned log entry, which is
 * a paperwork inconsistency, while an update happening with no log entry is
 * the actual defect this design exists to prevent. Log-then-update, never
 * the reverse, is what makes that true.
 */

export type AgmTable =
  | "agm_resolution_versions"
  | "agm_signatures"
  | "agm_supporters"
  | "agm_proxies"
  | "shareholder_cases";

export type AgmStatus = "active" | "withdrawn" | "voided";

function serialise(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

/**
 * Edits a set of fields on one record. Diffs against the current stored
 * values so only fields that actually changed are logged - saving with no
 * real change writes nothing.
 */
export async function applyFieldEdit({
  table,
  id,
  changes,
  changedBy,
  reason,
}: {
  table: AgmTable;
  id: string;
  changes: Record<string, unknown>;
  changedBy: string;
  reason: string;
}): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  const db = getSupabase();
  const fields = Object.keys(changes);
  if (fields.length === 0) return { ok: true, changed: false };

  const { data: current, error: fetchError } = await db
    .from(table)
    .select(fields.join(","))
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !current) {
    return { ok: false, error: "Record not found" };
  }

  const currentRow = current as unknown as Record<string, unknown>;
  const logEntries = fields
    .filter((field) => serialise(currentRow[field]) !== serialise(changes[field]))
    .map((field) => ({
      table_name: table,
      record_id: id,
      field_name: field,
      old_value: serialise(currentRow[field]),
      new_value: serialise(changes[field]),
      changed_by: changedBy,
      reason,
    }));

  if (logEntries.length === 0) return { ok: true, changed: false };

  const { error: logError } = await db.from("agm_change_log").insert(logEntries);
  if (logError) {
    console.error(`[agm-change-log] log write failed for ${table}/${id}:`, logError.message);
    return { ok: false, error: "Could not record the change. Nothing was saved." };
  }

  const changedFields = Object.fromEntries(logEntries.map((e) => [e.field_name, changes[e.field_name]]));
  const { error: updateError } = await db.from(table).update(changedFields).eq("id", id);
  if (updateError) {
    console.error(
      `[agm-change-log] logged but update failed for ${table}/${id} - log and record now disagree:`,
      updateError.message
    );
    return { ok: false, error: "The change was recorded but could not be saved. Contact info@celticsupporters.net." };
  }

  return { ok: true, changed: true };
}

/**
 * Changes the shared active/withdrawn/voided status on one record. Same
 * log-then-update guarantee as applyFieldEdit. extraUpdates carries
 * table-specific side effects that are not independently edited fields, not
 * logged as their own entries - agm_proxies' revoked_at/revoked_reason are
 * a consequence of the status change itself, not a separate correction.
 */
export async function applyStatusChange({
  table,
  id,
  statusColumn,
  newStatus,
  changedBy,
  reason,
  extraUpdates,
}: {
  table: AgmTable;
  id: string;
  statusColumn: "status" | "agm_record_status";
  newStatus: AgmStatus;
  changedBy: string;
  reason: string;
  extraUpdates?: Record<string, unknown>;
}): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  const db = getSupabase();

  const { data: current, error: fetchError } = await db
    .from(table)
    .select(statusColumn)
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !current) {
    return { ok: false, error: "Record not found" };
  }

  const currentStatus = (current as unknown as Record<string, unknown>)[statusColumn];
  if (currentStatus === newStatus) return { ok: true, changed: false };

  const { error: logError } = await db.from("agm_change_log").insert({
    table_name: table,
    record_id: id,
    field_name: statusColumn,
    old_value: serialise(currentStatus),
    new_value: newStatus,
    changed_by: changedBy,
    reason,
  });
  if (logError) {
    console.error(`[agm-change-log] status log write failed for ${table}/${id}:`, logError.message);
    return { ok: false, error: "Could not record the change. Nothing was saved." };
  }

  const { error: updateError } = await db
    .from(table)
    .update({ [statusColumn]: newStatus, ...extraUpdates })
    .eq("id", id);
  if (updateError) {
    console.error(
      `[agm-change-log] status logged but update failed for ${table}/${id} - log and record now disagree:`,
      updateError.message
    );
    return { ok: false, error: "The change was recorded but could not be saved. Contact info@celticsupporters.net." };
  }

  return { ok: true, changed: true };
}
