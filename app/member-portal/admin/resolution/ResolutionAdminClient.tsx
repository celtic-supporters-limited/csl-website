"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WordingContent, type WordingRow } from "@/components/ResolutionWordingContent";

export type Signature = {
  id: string;
  full_name: string;
  address_line_1: string | null;
  address_line_2: string | null;
  address_town: string | null;
  address_postcode: string | null;
  email: string;
  how_held: string;
  computershare_srn: string | null;
  nominee_platform: string | null;
  nominee_platform_other: string | null;
  year_of_purchase: string | null;
  shares_held: string | null;
  share_class: string | null;
  eligibility_confirmed: boolean | null;
  resolution_supported: boolean | null;
  consent_given: boolean;
  privacy_policy_version: string | null;
  resolution_version_id: string | null;
  signature_name: string;
  signed_at: string;
  signer_ip: string | null;
  signer_user_agent: string | null;
  capture_status: string;
  shareholder_tag: string;
  member_tag: string;
  created_at: string;
};

type SortKey = "created_at" | "shareholder_tag";
type SortDir = "asc" | "desc";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function heldBadge(howHeld: string) {
  const map: Record<string, { label: string; cls: string }> = {
    "direct":  { label: "Direct", cls: "bg-green-100 text-green-800" },
    "nominee": { label: "Nominee", cls: "bg-blue-100 text-blue-700" },
  };
  const { label, cls } = map[howHeld] ?? { label: howHeld, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[0.75rem] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

/**
 * What a volunteer would actually chase this row for, not a generic "needs
 * completion". Direct holders with no SRN cannot be reconciled against the
 * share register at all - that is the single most common real gap (see
 * docs/2026-07-27_Proxy_Requisition_Audit.md Finding 6), so it is checked
 * first and named specifically. A pre_rebuild row that already has an SRN is
 * still not usable: it predates the discrete address, share class and
 * wording-binding fields, and per Package 2 the only real fix is asking the
 * person to sign again - so that is what the status says, not "completion".
 */
function rowStatus(s: Signature): { label: string; needsAttention: boolean } {
  if (s.how_held === "direct" && !s.computershare_srn) {
    return { label: "Needs SRN", needsAttention: true };
  }
  if (s.capture_status === "pre_rebuild") {
    return { label: "Needs to re-sign", needsAttention: true };
  }
  return { label: "Complete", needsAttention: false };
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`w-4 h-4 text-gray-400 transition-transform duration-150 flex-shrink-0 ${open ? "rotate-180" : ""}`}
      fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// RFC 4180 CSV
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\r\n");
}

const inputClass =
  "w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-lg text-[0.85rem] font-[inherit] transition-colors duration-200 focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10";
const labelClass = "block text-[0.8rem] font-semibold text-gray-800 mb-1";

/**
 * Edit the four texts and save. One button, one confirmation, one underlying
 * action: create a new wording row, then make it current - exactly what
 * "Make current" used to do as a second, separate step. The label is never
 * shown here because there is nothing to type: POST /api/admin/resolution-
 * versions generates it server-side.
 */
function WordingForm({
  current,
  onClose,
}: {
  current: WordingRow & { is_placeholder: boolean };
  onClose: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(current.body);
  const [declarationText, setDeclarationText] = useState(current.declaration_text);
  const [consentText, setConsentText] = useState(current.consent_text);
  const [supportingStatement, setSupportingStatement] = useState(current.supporting_statement ?? "");
  const [isFinal, setIsFinal] = useState(!current.is_placeholder);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const createRes = await fetch("/api/admin/resolution-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          declarationText,
          consentText,
          supportingStatement: supportingStatement.trim() || null,
          isPlaceholder: !isFinal,
        }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        setSaving(false);
        return;
      }
      const created = await createRes.json();

      const activateRes = await fetch("/api/admin/resolution-versions/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: created.id }),
      });
      if (!activateRes.ok) {
        const data = await activateRes.json().catch(() => ({}));
        setError(data.error ?? "Saved, but could not make it current. Try again.");
        setSaving(false);
        return;
      }

      onClose();
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">Change wording</h2>
        <button
          type="button" onClick={onClose} disabled={saving}
          className="text-[0.78rem] text-gray-500 hover:underline disabled:opacity-60"
        >
          Cancel
        </button>
      </div>

      {error && (
        <p className="text-[0.8rem] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="wf-body" className={labelClass}>Resolution</label>
        <textarea
          id="wf-body" rows={5} className={inputClass} disabled={confirming || saving}
          value={body} onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="wf-declaration" className={labelClass}>Declaration</label>
        <p className="text-[0.72rem] text-gray-400 mb-1">Shown next to the tick the signatory makes.</p>
        <textarea
          id="wf-declaration" rows={3} className={inputClass} disabled={confirming || saving}
          value={declarationText} onChange={(e) => setDeclarationText(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="wf-consent" className={labelClass}>Consent</label>
        <textarea
          id="wf-consent" rows={3} className={inputClass} disabled={confirming || saving}
          value={consentText} onChange={(e) => setConsentText(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="wf-statement" className={labelClass}>
          Supporting statement <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <p className="text-[0.72rem] text-gray-400 mb-1">
          Leave blank unless this has been decided. Blank means it does not appear on the signing page.
        </p>
        <textarea
          id="wf-statement" rows={3} className={inputClass} disabled={confirming || saving}
          value={supportingStatement} onChange={(e) => setSupportingStatement(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-[0.85rem] text-gray-800 font-medium">
        <input
          type="checkbox" className="w-4 h-4 accent-csl-dark" disabled={confirming || saving}
          checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)}
        />
        This wording is final and signing may open
      </label>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!body.trim() || !declarationText.trim() || !consentText.trim()}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-csl-dark text-white hover:bg-csl-mid transition-colors disabled:opacity-60"
        >
          Save
        </button>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 space-y-3">
          <p className="text-[0.85rem] text-amber-900 leading-snug">
            This becomes what people sign from now on. Anyone who already signed keeps the old wording.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button" onClick={save} disabled={saving}
              className="text-[0.85rem] font-semibold text-amber-900 hover:underline disabled:opacity-60"
            >
              {saving ? "Saving..." : "Yes, save"}
            </button>
            <button
              type="button" onClick={() => setConfirming(false)} disabled={saving}
              className="text-[0.85rem] text-amber-600 hover:underline disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One past wording, collapsed by default - label and date, expandable to
 * its full text. No signature count, no delete: history exists to be read,
 * not curated. */
function HistoryRow({ wording }: { wording: WordingRow }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-[0.82rem] text-gray-700">{wording.version_label}</span>
        <ChevronIcon open={expanded} />
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <WordingContent wording={wording} />
        </div>
      )}
    </div>
  );
}

export default function ResolutionAdminClient({
  signatures,
  supporterCount,
  resolutionTarget,
  currentWording,
  wordingHistory,
}: {
  signatures: Signature[];
  supporterCount: number;
  resolutionTarget: number;
  currentWording: (WordingRow & { is_placeholder: boolean; is_current: boolean; created_at: string }) | null;
  wordingHistory: (WordingRow & { is_placeholder: boolean; is_current: boolean; created_at: string })[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [wordingExpanded, setWordingExpanded] = useState(false);
  const [editingWording, setEditingWording] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Counting logic unchanged: only direct registered holders count toward
  // the 100, and rows preserved from before Package 2 are excluded, because
  // they were collected without a wording binding and cannot be relied on.
  const complete = signatures.filter((s) => s.capture_status === "complete");
  const preRebuild = signatures.filter((s) => s.capture_status === "pre_rebuild");
  const directCount = complete.filter((s) => s.shareholder_tag === "direct-registered").length;

  // Label lookup for the CSV export, built from what this page already has
  // rather than a separate prop - every wording a signature could reference
  // is either the current one or in the history list.
  const versionLabels: Record<string, string> = {};
  if (currentWording) versionLabels[currentWording.id] = currentWording.version_label;
  for (const w of wordingHistory) versionLabels[w.id] = w.version_label;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...signatures].sort((a, b) => {
    const va = a[sortKey] ?? "";
    const vb = b[sortKey] ?? "";
    const cmp = String(va).localeCompare(String(vb));
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Reconciliation working file, not a report: raw ids and full ISO
  // timestamps, every schema field, and capture_status so incomplete rows
  // are visible. Unchanged from before this redesign - this is what
  // lodgement day runs on.
  function downloadCsv() {
    const rows = signatures.map((s) => ({
      id:                     s.id,
      capture_status:         s.capture_status,
      created_at:             s.created_at,
      signed_at:              s.signed_at,
      full_name:              s.full_name,
      email:                  s.email,
      address_line_1:         s.address_line_1 ?? "",
      address_line_2:         s.address_line_2 ?? "",
      address_town:           s.address_town ?? "",
      address_postcode:       s.address_postcode ?? "",
      how_held:               s.how_held,
      computershare_srn:      s.computershare_srn ?? "",
      nominee_platform:       s.nominee_platform ?? "",
      nominee_platform_other: s.nominee_platform_other ?? "",
      year_of_purchase:       s.year_of_purchase ?? "",
      shares_held:            s.shares_held ?? "",
      share_class:            s.share_class ?? "",
      eligibility_confirmed:  s.eligibility_confirmed ?? "",
      resolution_supported:   s.resolution_supported ?? "",
      consent_given:          s.consent_given,
      privacy_policy_version: s.privacy_policy_version ?? "",
      resolution_version_id:  s.resolution_version_id ?? "",
      resolution_version_label:
        s.resolution_version_id ? (versionLabels[s.resolution_version_id] ?? "") : "",
      signature_name:         s.signature_name,
      signer_ip:              s.signer_ip ?? "",
      signer_user_agent:      s.signer_user_agent ?? "",
      shareholder_tag:        s.shareholder_tag,
      member_tag:             s.member_tag,
    }));
    const csv = toCsv(rows as unknown as Record<string, unknown>[]);
    const today = new Date().toISOString().split("T")[0];
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `csl-resolution-signatures-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-1">&#8597;</span>;
    return <span className="text-csl-dark ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">AGM Resolution</h1>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {directCount.toLocaleString("en-GB")} of {resolutionTarget.toLocaleString("en-GB")} direct registered shareholders
          </p>
          <p className="text-[0.82rem] text-gray-500 mt-1">
            Plus {supporterCount.toLocaleString("en-GB")} supporter{supporterCount === 1 ? "" : "s"} recorded,
            who {supporterCount === 1 ? "is" : "are"} not shareholder{supporterCount === 1 ? "" : "s"} and cannot sign.
          </p>
        </div>
        <button
          onClick={downloadCsv}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-csl-dark text-white hover:bg-csl-mid transition-colors whitespace-nowrap"
        >
          Export CSV
        </button>
      </div>

      {preRebuild.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            {preRebuild.length} record{preRebuild.length === 1 ? "" : "s"} need completion
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-b border-gray-100">
          <p className="text-[0.78rem] font-bold uppercase tracking-wider text-gray-600">
            {currentWording?.is_placeholder
              ? "Current wording (not yet final)"
              : "What shareholders are signing now"}
          </p>
          {!editingWording && currentWording && (
            <button
              onClick={() => setEditingWording(true)}
              className="text-[0.78rem] text-csl-dark hover:underline font-semibold"
            >
              Change wording
            </button>
          )}
        </div>

        {editingWording && currentWording ? (
          <div className="p-4">
            <WordingForm current={currentWording} onClose={() => setEditingWording(false)} />
          </div>
        ) : currentWording ? (
          <>
            <button
              onClick={() => setWordingExpanded((e) => !e)}
              aria-expanded={wordingExpanded}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-[0.82rem] text-gray-500">
                {wordingExpanded ? "Hide" : "Read in full"}
              </span>
              <ChevronIcon open={wordingExpanded} />
            </button>
            {wordingExpanded && (
              <div className="px-4 pb-4">
                <WordingContent wording={currentWording} />
              </div>
            )}
          </>
        ) : (
          <p className="px-4 py-4 text-[0.85rem] text-gray-500">No wording has been saved yet.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p className="px-4 py-3 border-b border-gray-100 text-[0.78rem] font-bold uppercase tracking-wider text-gray-600">
          Who has signed
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th
                  className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 cursor-pointer whitespace-nowrap"
                  onClick={() => toggleSort("created_at")}
                >
                  Date <SortIcon k="created_at" />
                </th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Name</th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Email</th>
                <th
                  className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 cursor-pointer whitespace-nowrap"
                  onClick={() => toggleSort("shareholder_tag")}
                >
                  Held <SortIcon k="shareholder_tag" />
                </th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">SRN</th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No signatures yet.
                  </td>
                </tr>
              )}
              {sorted.map((s) => {
                const status = rowStatus(s);
                return (
                  <tr key={s.id} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${status.needsAttention ? "bg-amber-50/40" : ""}`}>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(s.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{s.full_name}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{heldBadge(s.how_held)}</td>
                    <td className="px-4 py-3 text-gray-500 text-[0.8rem] whitespace-nowrap">{s.computershare_srn ?? "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {status.needsAttention ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[0.75rem] font-semibold bg-amber-100 text-amber-800">
                          {status.label}
                        </span>
                      ) : (
                        <span className="text-[0.75rem] text-gray-400">Complete</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setHistoryExpanded((e) => !e)}
          aria-expanded={historyExpanded}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        >
          <span className="text-[0.82rem] font-semibold text-gray-600">
            Wording history ({wordingHistory.length})
          </span>
          <ChevronIcon open={historyExpanded} />
        </button>
        {historyExpanded && (
          wordingHistory.length === 0 ? (
            <p className="px-4 pb-4 text-[0.82rem] text-gray-400">No earlier wording.</p>
          ) : (
            <div>
              {wordingHistory.map((w) => <HistoryRow key={w.id} wording={w} />)}
            </div>
          )
        )}
      </div>
    </div>
  );
}
