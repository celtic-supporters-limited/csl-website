"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Package 5a - the one edit view used by both AGM admin pages, for every
 * record type. Brief section 2c: every field is a field, no diff view, no
 * approval workflow. This component is that literally: a list of inputs, a
 * required reason, a warning naming a number when one applies, and a
 * collapsed change history fetched on expand.
 */

export type AgmField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "checkbox";
  value: string | boolean | null;
};

type LogEntry = {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  reason: string;
  created_at: string;
};

const inputClass =
  "w-full px-2.5 py-1.5 border-[1.5px] border-gray-200 rounded-lg text-[0.8rem] font-[inherit] transition-colors duration-200 focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10";
const labelClass = "block text-[0.72rem] font-semibold text-gray-600 mb-0.5";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Raw column names must not leak to screen, same rule as every other config
// value on these pages. is_placeholder in particular must never render as
// the word "placeholder" would appear to satisfy the banned-vocabulary rule
// (docs/agm/CSL_AGM_AdminRedesign_ClaudeCode_Prompt.md section 4) - it does
// not appear in this map, and the fallback below only strips underscores, so
// the deliberate wording avoids it too.
const FIELD_LABELS: Record<string, string> = {
  body: "Resolution",
  declaration_text: "Declaration",
  consent_text: "Consent",
  supporting_statement: "Supporting statement",
  is_placeholder: "Wording finalised",
  full_name: "Full name",
  contact_name: "Name",
  address_line_1: "Address line 1",
  address_line_2: "Address line 2",
  address_town: "Town",
  address_postcode: "Postcode",
  how_held: "How held",
  computershare_srn: "Computershare SRN",
  nominee_platform: "Nominee platform",
  nominee_platform_other: "Nominee platform (other)",
  shares_held: "Shares held",
  share_class: "Share class",
  appointee_name: "Appointee",
  signature_name: "Signature name",
  signed_at: "Signed at",
  nominee_instruction_sent: "Instruction sent",
  revoked_reason: "Revocation reason",
  status: "Status",
  agm_record_status: "Status",
  consent_given: "Consent given",
  enquiry_source: "Source",
  notes: "Notes",
  phone: "Phone",
  email: "Email",
};

function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name.replace(/_/g, " ");
}

export function ChangeHistory({ table, recordId }: { table: string; recordId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState("");

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (entries !== null) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/agm-change-log?table=${table}&recordId=${recordId}`);
      if (!res.ok) {
        setError("Could not load change history.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-gray-100 pt-2.5">
      <button type="button" onClick={toggle} className="text-[0.75rem] text-gray-500 hover:underline">
        {open ? "Hide change history" : "Show change history"}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {loading && <p className="text-[0.75rem] text-gray-400">Loading...</p>}
          {error && <p className="text-[0.75rem] text-red-600">{error}</p>}
          {entries && entries.length === 0 && (
            <p className="text-[0.75rem] text-gray-400">No changes recorded.</p>
          )}
          {entries && entries.length > 0 && (
            <ul className="space-y-1.5">
              {entries.map((e) => (
                <li key={e.id} className="text-[0.75rem] text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5">
                  <span className="font-semibold text-gray-800">{fieldLabel(e.field_name)}</span>
                  {": "}
                  <span className="text-gray-400">{e.old_value ?? "(empty)"}</span>
                  {" -> "}
                  <span>{e.new_value ?? "(empty)"}</span>
                  <span className="block text-gray-400 mt-0.5">
                    {e.changed_by}, {fmtDateTime(e.created_at)}{e.reason ? ` - ${e.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function AgmRecordEditor({
  table,
  id,
  fields,
  warningText,
  triggerLabel = "Edit",
  triggerClassName = "text-[0.75rem] text-csl-dark hover:underline font-medium",
  open: controlledOpen,
  onClose: controlledOnClose,
}: {
  table: string;
  id: string;
  fields: AgmField[];
  /** Shown at the confirm step. Naming a number or a person, per brief section 3.2. */
  warningText?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  /**
   * Controlled mode, for a table row: the caller renders its own "Edit" link
   * (typically in a different cell than where this panel appears, e.g. a
   * colSpan row below) and drives open/close itself. Omit both for the
   * default self-contained mode, where this component renders its own
   * trigger button in place of the panel.
   */
  open?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  function setOpen(v: boolean) {
    if (isControlled) {
      if (!v) controlledOnClose?.();
    } else {
      setInternalOpen(v);
    }
  }
  const [values, setValues] = useState<Record<string, string | boolean | null>>(
    Object.fromEntries(fields.map((f) => [f.key, f.value]))
  );
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setValues(Object.fromEntries(fields.map((f) => [f.key, f.value])));
    setReason("");
    setConfirming(false);
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/agm-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, id, changes: values, reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        setSaving(false);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setSaving(false);
    }
  }

  if (!open) {
    if (isControlled) return null;
    return (
      <button type="button" onClick={() => setInternalOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 text-left">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-[0.85rem]">Edit record</h3>
        <button
          type="button"
          onClick={() => { setOpen(false); reset(); }}
          disabled={saving}
          className="text-[0.75rem] text-gray-500 hover:underline disabled:opacity-60"
        >
          Cancel
        </button>
      </div>

      {error && (
        <p className="text-[0.78rem] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {fields.map((f) => (
          <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
            {f.type === "checkbox" ? (
              <label className="flex items-center gap-2 cursor-pointer text-[0.8rem] text-gray-800 font-medium">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-csl-dark"
                  disabled={confirming || saving}
                  checked={values[f.key] === true}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                />
                {f.label}
              </label>
            ) : (
              <>
                <label className={labelClass} htmlFor={`edit-${table}-${id}-${f.key}`}>{f.label}</label>
                {f.type === "textarea" ? (
                  <textarea
                    id={`edit-${table}-${id}-${f.key}`}
                    rows={3}
                    className={inputClass}
                    disabled={confirming || saving}
                    value={(values[f.key] as string) ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    id={`edit-${table}-${id}-${f.key}`}
                    type="text"
                    className={inputClass}
                    disabled={confirming || saving}
                    value={(values[f.key] as string) ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div>
        <label className={labelClass} htmlFor={`edit-${table}-${id}-reason`}>Reason for this change</label>
        <input
          id={`edit-${table}-${id}-reason`}
          type="text"
          className={inputClass}
          disabled={confirming || saving}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. member emailed a corrected reference number"
        />
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!reason.trim()}
          className="px-3.5 py-1.5 text-[0.8rem] font-semibold rounded-lg bg-csl-dark text-white hover:bg-csl-mid transition-colors disabled:opacity-60"
        >
          Save
        </button>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2.5">
          {warningText && <p className="text-[0.8rem] text-amber-900 leading-snug">{warningText}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button" onClick={save} disabled={saving}
              className="text-[0.8rem] font-semibold text-amber-900 hover:underline disabled:opacity-60"
            >
              {saving ? "Saving..." : "Yes, save"}
            </button>
            <button
              type="button" onClick={() => setConfirming(false)} disabled={saving}
              className="text-[0.8rem] text-amber-600 hover:underline disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ChangeHistory table={table} recordId={id} />
    </div>
  );
}

/**
 * Active/withdrawn/voided, for any AGM record type. Same confirm-with-reason
 * shape as AgmRecordEditor, deliberately simpler: one action, not a field
 * list. agm_proxies uses its own RevokeAction/status display instead, for
 * "withdrawn" - this component covers the other three record types plus
 * "voided" generally.
 */
export function AgmStatusAction({
  table,
  id,
  currentStatus,
  personLabel,
  actions = ["withdrawn", "voided"],
}: {
  table: string;
  id: string;
  currentStatus: string;
  /** Named in the confirmation, per brief section 3.2. */
  personLabel: string;
  /**
   * Which status buttons to offer. agm_proxies passes ["voided"] only - its
   * own RevokeAction already covers "withdrawn" with proxy-specific copy, so
   * offering it twice here would just be a second, confusing way to do the
   * same thing.
   */
  actions?: ("withdrawn" | "voided")[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"withdrawn" | "voided" | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (currentStatus !== "active") {
    return <span className="text-[0.75rem] text-gray-400 capitalize">{currentStatus}</span>;
  }

  async function apply(status: "withdrawn" | "voided") {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/agm-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, id, status, reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  if (confirming) {
    return (
      <div className="text-[0.72rem] bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-2 max-w-[220px]">
        <p className="text-amber-900 leading-snug">
          Mark <strong>&quot;{personLabel}&quot;</strong> as {confirming}? The record stays visible, marked {confirming}.
        </p>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          disabled={loading}
          className="w-full px-2 py-1 text-[0.72rem] border border-amber-300 rounded"
        />
        <div className="flex items-center gap-3">
          <button onClick={() => apply(confirming)} disabled={loading} className="font-semibold text-amber-900 hover:underline disabled:opacity-60">
            {loading ? "Saving..." : "Confirm"}
          </button>
          <button onClick={() => { setConfirming(null); setError(""); }} disabled={loading} className="text-amber-600 hover:underline disabled:opacity-60">
            Cancel
          </button>
        </div>
        {error && <p className="text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <span className="text-[0.72rem] whitespace-nowrap">
      {actions.includes("withdrawn") && (
        <button onClick={() => setConfirming("withdrawn")} className="text-gray-500 hover:underline">Withdraw</button>
      )}
      {actions.includes("withdrawn") && actions.includes("voided") && " / "}
      {actions.includes("voided") && (
        <button onClick={() => setConfirming("voided")} className="text-red-600 hover:underline">Void</button>
      )}
    </span>
  );
}
