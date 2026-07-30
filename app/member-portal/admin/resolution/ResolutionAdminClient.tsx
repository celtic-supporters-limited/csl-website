"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WordingContent, type WordingRow } from "@/components/ResolutionWordingContent";
import { SigningStateNotice } from "@/components/SigningStateNotice";
import type { ResolutionSigningState } from "@/lib/agm-signing-state";

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

export type Supporter = {
  id: string;
  full_name: string;
  email: string;
  consent_given: boolean;
  privacy_policy_version: string | null;
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
    <div className="p-4">
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
    </div>
  );
}

export default function ResolutionAdminClient({
  meetingRef,
  signingState,
  signatures,
  supporters,
  resolutionTarget,
  currentWording,
  versionLabels,
}: {
  meetingRef: string;
  signingState: ResolutionSigningState;
  signatures: Signature[];
  supporters: Supporter[];
  resolutionTarget: number;
  currentWording: (WordingRow & { is_placeholder: boolean; is_current: boolean; created_at: string }) | null;
  /** Label lookup for the CSV export only - see the comment in page.tsx. */
  versionLabels: Record<string, string>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showFullText, setShowFullText] = useState(false);
  const [editingWording, setEditingWording] = useState(false);
  const [signaturesExpanded, setSignaturesExpanded] = useState(false);
  const [supportersExpanded, setSupportersExpanded] = useState(false);

  const supporterCount = supporters.length;

  // Counting logic unchanged: only direct registered holders count toward
  // the 100, and rows preserved from before Package 2 are excluded, because
  // they were collected without a wording binding and cannot be relied on.
  const complete = signatures.filter((s) => s.capture_status === "complete");
  const preRebuild = signatures.filter((s) => s.capture_status === "pre_rebuild");
  const directCount = complete.filter((s) => s.shareholder_tag === "direct-registered").length;

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
  // are visible. The filename carries the meeting reference because this
  // file leaves the system and lands in a solicitor's inbox, with no page
  // around it to say which meeting it is for.
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
    a.download = `csl-resolution-signatures-${meetingRef}-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // A separate file from downloadCsv() above, deliberately. The signature
  // export is the lodgement document - it leaves the system and may reach a
  // solicitor or a registrar, and it must contain only people who have
  // actually signed the requisition. Supporters are non-shareholders who
  // cannot sign one; mixing the two populations in one file would misstate
  // who is actually requisitioning.
  function downloadSupportersCsv() {
    const rows = supporters.map((s) => ({
      id:                     s.id,
      created_at:             s.created_at,
      full_name:              s.full_name,
      email:                  s.email,
      consent_given:          s.consent_given,
      privacy_policy_version: s.privacy_policy_version ?? "",
    }));
    const csv = toCsv(rows as unknown as Record<string, unknown>[]);
    const today = new Date().toISOString().split("T")[0];
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `csl-resolution-supporters-${meetingRef}-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-1">&#8597;</span>;
    return <span className="text-csl-dark ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // One quiet line, not a box: the completion count and the supporter note
  // together, singular/plural agreeing in both halves. The completion clause
  // is omitted entirely once nothing needs it, rather than reading "0 records
  // need completion".
  const completionClause = preRebuild.length > 0
    ? `${preRebuild.length} record${preRebuild.length === 1 ? "" : "s"} need${preRebuild.length === 1 ? "s" : ""} completion`
    : null;
  const supporterClause =
    `${supporterCount.toLocaleString("en-GB")} supporter${supporterCount === 1 ? "" : "s"} recorded, who cannot sign`;
  const qualifierLine = completionClause ? `${completionClause} · ${supporterClause}` : supporterClause;

  return (
    <div className="space-y-5">
      {/* The meeting is the page's scope, stated at the top. Plain text while
          one meeting exists - a selector only appears once a second one does,
          and that is a display choice over which meeting's data is being
          looked at. It never changes which meeting is live: that stays a
          config action with no interface, so a volunteer browsing last year's
          signatures can never silently redirect this year's collection. */}
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-900">AGM Resolution</h1>
        <span className="text-gray-500 font-semibold text-[0.95rem]">{meetingRef}</span>
      </div>

      <SigningStateNotice state={signingState} />

      <div>
        <p className="text-2xl font-bold text-gray-900 tabular-nums">
          {directCount.toLocaleString("en-GB")} of {resolutionTarget.toLocaleString("en-GB")} needed to lodge
        </p>
        <p className="text-[0.85rem] text-gray-500 mt-0.5">direct registered shareholders</p>
        <p className="text-[0.8rem] text-gray-500 mt-1.5">{qualifierLine}</p>
      </div>

      {/* The requisition is the object of this page, not a panel bolted onto
          a tracker: a state badge, a one-line description, and a single
          toggle revealing all four texts in the order a signatory reads
          them - never four separate disclosures for one document. */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <p className="text-[0.78rem] font-bold uppercase tracking-wider text-gray-600">The Requisition</p>
            {currentWording && (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[0.72rem] font-semibold ${
                  currentWording.is_placeholder ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                }`}
              >
                {currentWording.is_placeholder ? "Not final" : "Final"}
              </span>
            )}
          </div>
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
          <WordingForm current={currentWording} onClose={() => setEditingWording(false)} />
        ) : currentWording ? (
          <>
            <p className="px-4 pt-3 text-[0.82rem] text-gray-500">
              What every signatory agrees to, in the order they see it.
            </p>
            <button
              onClick={() => setShowFullText((e) => !e)}
              aria-expanded={showFullText}
              className="w-full flex items-center gap-2 px-4 py-2.5 mt-1 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-[0.82rem] text-gray-500">
                {showFullText ? "Hide" : "Show full text"}
              </span>
              <ChevronIcon open={showFullText} />
            </button>
            {showFullText && (
              <div className="px-4 pb-4">
                <WordingContent wording={currentWording} />
              </div>
            )}
          </>
        ) : (
          <p className="px-4 py-4 text-[0.85rem] text-gray-500">No wording has been saved yet.</p>
        )}
      </div>

      {/* Who has signed: a single collapsed row with Export beside it - the
          export is that list leaving the building, so it sits next to the
          thing it exports rather than up by the count. */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={() => setSignaturesExpanded((e) => !e)}
            aria-expanded={signaturesExpanded}
            className="flex items-center gap-2 text-left"
          >
            <span className="text-[0.82rem] font-semibold text-gray-600">
              Who has signed ({signatures.length.toLocaleString("en-GB")})
            </span>
            <ChevronIcon open={signaturesExpanded} />
          </button>
          <button
            onClick={downloadCsv}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-csl-dark text-white hover:bg-csl-mid transition-colors whitespace-nowrap"
          >
            Export CSV
          </button>
        </div>

        {signaturesExpanded && (
          <div className="border-t border-gray-100 overflow-x-auto">
            {/* table-fixed with explicit widths, and Email left to truncate,
                so Status - what a volunteer actually chases a row for - is
                always in view without horizontal scroll. */}
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: "11%" }} />
                <col style={{ width: "19%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "17%" }} />
              </colgroup>
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
                      <td className="px-4 py-3 font-medium text-gray-900 truncate">{s.full_name}</td>
                      <td className="px-4 py-3 text-gray-600 truncate" title={s.email}>{s.email}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{heldBadge(s.how_held)}</td>
                      <td className="px-4 py-3 text-gray-500 text-[0.8rem] whitespace-nowrap truncate">{s.computershare_srn ?? "-"}</td>
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
        )}
      </div>

      {/* Registered Support: non-shareholders who registered support but
          cannot sign the requisition. Same collapsed-row-plus-export shape
          as "Who has signed" immediately above, deliberately - the only
          differences are the columns (no shareholding fields exist to show)
          and that this export is entirely separate from the signature one,
          so the lodgement document never mixes the two populations. This
          closes the gap left when Package 2 moved non-shareholders out of
          agm_signatures: until now there was a count in the qualifier line
          above and no way to see who they actually were. */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={() => setSupportersExpanded((e) => !e)}
            aria-expanded={supportersExpanded}
            className="flex items-center gap-2 text-left"
          >
            <span className="text-[0.82rem] font-semibold text-gray-600">
              Registered Support ({supporterCount.toLocaleString("en-GB")})
            </span>
            <ChevronIcon open={supportersExpanded} />
          </button>
          <button
            onClick={downloadSupportersCsv}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-csl-dark text-white hover:bg-csl-mid transition-colors whitespace-nowrap"
          >
            Export CSV
          </button>
        </div>

        {supportersExpanded && (
          <div className="border-t border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Name</th>
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500">Email</th>
                </tr>
              </thead>
              <tbody>
                {supporters.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-gray-400 text-sm">
                      No supporters yet.
                    </td>
                  </tr>
                )}
                {supporters.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(s.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{s.full_name}</td>
                    <td className="px-4 py-3 text-gray-600">{s.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
