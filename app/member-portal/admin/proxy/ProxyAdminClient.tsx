"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { APPOINTEE_LABEL } from "@/lib/agm-appointee";
import { isProxyDeclarationReady } from "@/lib/site-gates";
import { AgmRecordEditor, AgmStatusAction, ChangeHistory, type AgmField } from "@/components/AgmRecordEditor";

export type Appointment = {
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
  shares_held: string | null;
  shares_held_exact: number | null;
  share_class: string | null;
  appointee_name: string;
  declaration_snapshot: string;
  signature_name: string;
  signed_at: string;
  consent_given: boolean;
  privacy_policy_version: string | null;
  lodgement_path: string;
  nominee_instruction_sent: boolean | null;
  status: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  suspected_bot: boolean;
  email_sent_at: string | null;
  email_error: string | null;
};

export type InterestRow = {
  id: string;
  contact_name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  enquiry_source: string | null;
  consent_given: boolean | null;
  privacy_policy_version: string | null;
  suspected_bot: boolean;
  agm_record_status: string;
  created_at: string;
};

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

/**
 * Release or purge a row flagged suspected_bot. Same shape as the matching
 * component on the resolution admin page - see the note there.
 */
function SuspectedBotActions({ id, table }: { id: string; table: "agm_proxies" | "shareholder_cases" }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"release" | "purge" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "release" | "purge") {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/suspected-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, id, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        setLoading(false);
        setConfirming(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
      setConfirming(null);
    }
  }

  if (confirming) {
    return (
      <span className="text-[0.7rem]">
        <button onClick={() => act(confirming)} disabled={loading} className="font-semibold text-csl-dark hover:underline disabled:opacity-60">
          {loading ? "..." : "Confirm"}
        </button>
        {" / "}
        <button onClick={() => setConfirming(null)} disabled={loading} className="text-gray-400 hover:underline disabled:opacity-60">Cancel</button>
        {error && <span className="block text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <span className="text-[0.7rem] whitespace-nowrap">
      <button onClick={() => setConfirming("release")} className="text-csl-dark hover:underline">Release</button>
      {" / "}
      <button onClick={() => setConfirming("purge")} className="text-red-600 hover:underline">Purge</button>
    </span>
  );
}

/**
 * Revoke an appointment. A status change, not a delete - section 5a of the
 * Package 5 brief. One click, no workflow: confirmation names the person and
 * requires a short reason, since the record is retained as evidence a
 * revocation happened.
 */
function RevokeAction({ appointment }: { appointment: Appointment }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (appointment.status === "withdrawn") {
    return <span className="text-[0.75rem] text-gray-400">Revoked {fmtDate(appointment.revoked_at!)}</span>;
  }
  if (appointment.status === "voided") {
    return <span className="text-[0.75rem] text-gray-400">Voided</span>;
  }

  async function revoke() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/proxy/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: appointment.id, reason: reason.trim() }),
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

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-[0.75rem] text-red-600 hover:underline font-medium">
        Revoke
      </button>
    );
  }

  return (
    <div className="text-[0.72rem] bg-red-50 border border-red-200 rounded-lg p-2.5 space-y-2 max-w-[220px]">
      <p className="text-red-900 leading-snug">
        Revoke <strong>&quot;{appointment.full_name}&quot;</strong>&apos;s appointment? The record is
        retained, marked revoked.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason"
        disabled={loading}
        className="w-full px-2 py-1 text-[0.72rem] border border-red-300 rounded"
      />
      <div className="flex items-center gap-3">
        <button onClick={revoke} disabled={loading} className="font-semibold text-red-700 hover:underline disabled:opacity-60">
          {loading ? "Revoking..." : "Yes, revoke"}
        </button>
        <button onClick={() => { setConfirming(false); setError(""); }} disabled={loading} className="text-red-500 hover:underline disabled:opacity-60">
          Cancel
        </button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-lg text-[0.85rem] font-[inherit] transition-colors duration-200 focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10";
const labelClass = "block text-[0.8rem] font-semibold text-gray-800 mb-1";

/**
 * Edit the proxy declaration in place. Same shape as WordingForm on the
 * resolution admin page - one text field, one save, one confirmation -
 * deliberately not generalised into anything reusable, since this is the
 * only config-driven text field in the AGM programme that needs an admin
 * edit surface. Saves through /api/admin/proxy-declaration, which does not
 * block on the TBD guard - the appointment route's own lock (
 * isProxyDeclarationReady) and the banner above this card both already
 * reflect an empty or TBD value reactively, so this form does not duplicate
 * that check.
 */
function DeclarationForm({
  currentText,
  signedCount,
  matchingCurrentTextCount,
  onClose,
}: {
  currentText: string | null;
  /** Every active appointment for this meeting - all affected by editing the declaration, not only the ones whose own snapshot matches it right now. */
  signedCount: number;
  /** Of signedCount, how many actually saw the text as it stands right now - the rest appointed against an earlier version of it. */
  matchingCurrentTextCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState(currentText ?? "");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/proxy-declaration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
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
          <label htmlFor="pf-text" className={labelClass}>Declaration</label>
          <p className="text-[0.72rem] text-gray-400 mb-1">
            Shown to the signatory before they appoint their proxy. Leaving this empty, or starting
            it with TBD, closes appointments until real wording is saved here.
          </p>
          <textarea
            id="pf-text" rows={5} className={inputClass} disabled={confirming || saving}
            value={text} onChange={(e) => setText(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="pf-reason" className={labelClass}>Reason for this change</label>
          <input
            id="pf-reason" type="text" className={inputClass} disabled={confirming || saving}
            value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. director-approved wording arrived"
          />
        </div>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!reason.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-csl-dark text-white hover:bg-csl-mid transition-colors disabled:opacity-60"
          >
            Save
          </button>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 space-y-3">
            <p className="text-[0.85rem] text-amber-900 leading-snug">
              {signedCount > 0
                ? `${signedCount} ${signedCount === 1 ? "person has" : "people have"} appointed a proxy for this meeting${
                    matchingCurrentTextCount < signedCount
                      ? ` - ${matchingCurrentTextCount} against the current text, ${signedCount - matchingCurrentTextCount} against an earlier version`
                      : ""
                  }. Editing it changes what they agreed to. Anyone who already appointed keeps their own snapshot of the declaration as it was when they signed.`
                : "This becomes what people sign from now on."}
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

        <ChangeHistory table="site_config" recordId="proxy_declaration_text" />
      </div>
    </div>
  );
}

export default function ProxyAdminClient({
  meetingRef,
  mode,
  appointments,
  registeredInterest,
  declarationText,
}: {
  meetingRef: string;
  mode: "closed" | "interest" | "appointment";
  appointments: Appointment[];
  registeredInterest: InterestRow[];
  declarationText: string | null;
}) {
  const [showFullText, setShowFullText] = useState(false);
  const [appointmentsExpanded, setAppointmentsExpanded] = useState(false);
  const [interestExpanded, setInterestExpanded] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [editingInterestId, setEditingInterestId] = useState<string | null>(null);
  const [editingDeclaration, setEditingDeclaration] = useState(false);

  // The numbers named in the declaration-edit warning, per brief section
  // 3.2. site_config has no version row to bind against the way a
  // resolution wording does, so signedCountForDeclaration is every active
  // appointment for this meeting - everyone affected by editing the one
  // live declaration string, whether or not their own snapshot matches it
  // right now. Counting only snapshot matches undercounts anyone who
  // appointed against an earlier edit of the same text - exactly the
  // defect flagged in review. matchingCurrentTextCount is the more precise
  // breakdown of that group: how many actually saw today's text.
  const activeAppointmentsForDeclaration = appointments.filter((a) => !a.suspected_bot && a.status === "active");
  const signedCountForDeclaration = activeAppointmentsForDeclaration.length;
  const matchingCurrentTextForDeclaration = activeAppointmentsForDeclaration.filter(
    (a) => a.declaration_snapshot === declarationText
  ).length;

  // Countable: not a suspected-bot row, active. Section 5a is explicit that
  // a non-active row (withdrawn or voided) excludes the row from every
  // count; store-and-flag is explicit that a suspected-bot row does too.
  const countable = appointments.filter((a) => !a.suspected_bot && a.status === "active");
  const directCount = countable.filter((a) => a.how_held === "direct").length;
  const nomineeCount = countable.filter((a) => a.how_held === "nominee").length;
  const revokedCount = appointments.filter((a) => a.status === "withdrawn" && !a.suspected_bot).length;
  const voidedCount = appointments.filter((a) => a.status === "voided" && !a.suspected_bot).length;
  const totalCount = countable.length;

  const heldClause = `${directCount} direct-held, ${nomineeCount} nominee-held`;
  const statusNotes = [
    revokedCount > 0 ? `${revokedCount} revoked` : null,
    voidedCount > 0 ? `${voidedCount} voided` : null,
  ].filter(Boolean);
  const qualifierLine = statusNotes.length > 0 ? `${heldClause} · ${statusNotes.join(", ")}` : heldClause;

  // Plain sentences, not raw config values - no volunteer should ever see
  // "proxy_mode", "interest" or "appointment" as a bare internal label.
  //
  // declarationReady mirrors isProxyDeclarationReady() in lib/site-gates.ts -
  // the same one condition the appointment route itself enforces, so this
  // banner can never say "open" while the route is actually refusing every
  // submission with a 503.
  const declarationReady = isProxyDeclarationReady(declarationText);

  const modeNotice =
    mode === "appointment" && !declarationReady
      ? { cls: "bg-amber-50 border-amber-200 text-amber-800", text: "Proxy mode is set to appointment, but the declaration wording below is still a placeholder. The page cannot take appointments until real wording is saved using Change wording, below." }
      : mode === "appointment"
      ? { cls: "bg-green-50 border-green-200 text-green-800", text: "Full proxy appointment is open. Shareholders can appoint their proxy below." }
      : mode === "interest"
      ? { cls: "bg-blue-50 border-blue-200 text-blue-800", text: "Registering intent to appoint a proxy is open. Full appointment is not available until Celtic plc issues the Notice of AGM." }
      : { cls: "bg-amber-50 border-amber-200 text-amber-800", text: "The proxy page is closed. It explains itself to visitors but captures nothing." };

  function downloadAppointmentsCsv() {
    const rows = appointments.filter((a) => !a.suspected_bot).map((a) => ({
      id:                       a.id,
      created_at:               a.created_at,
      signed_at:                a.signed_at,
      full_name:                a.full_name,
      email:                    a.email,
      address_line_1:           a.address_line_1 ?? "",
      address_line_2:           a.address_line_2 ?? "",
      address_town:             a.address_town ?? "",
      address_postcode:         a.address_postcode ?? "",
      how_held:                 a.how_held,
      computershare_srn:        a.computershare_srn ?? "",
      nominee_platform:         a.nominee_platform ?? "",
      nominee_platform_other:   a.nominee_platform_other ?? "",
      shares_held:              a.shares_held ?? "",
      share_class:              a.share_class ?? "",
      appointee_name:           a.appointee_name,
      declaration_snapshot:     a.declaration_snapshot,
      signature_name:           a.signature_name,
      consent_given:            a.consent_given,
      privacy_policy_version:   a.privacy_policy_version ?? "",
      lodgement_path:           a.lodgement_path,
      nominee_instruction_sent: a.nominee_instruction_sent ?? "",
      status:                   a.status,
      revoked_at:               a.revoked_at ?? "",
      revoked_reason:           a.revoked_reason ?? "",
    }));
    const csv = toCsv(rows as unknown as Record<string, unknown>[]);
    const today = new Date().toISOString().split("T")[0];
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `csl-proxy-appointments-${meetingRef}-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Excludes suspected-bot rows, matching Registered Support's audit-trail
  // philosophy on the resolution page and the appointments count/export
  // above - a flagged row is not counted or exported until released. Also
  // excludes withdrawn/voided rows from the count, per brief section 2c -
  // they stay in the export (see downloadInterestCsv), marked not omitted.
  const interestCountable = registeredInterest.filter((r) => !r.suspected_bot && r.agm_record_status === "active");

  // Separate file, deliberately - an intention is not an appointment, and
  // this list must never be mistaken for the register above it.
  function downloadInterestCsv() {
    const rows = registeredInterest.filter((r) => !r.suspected_bot).map((r) => ({
      id:                     r.id,
      created_at:             r.created_at,
      contact_name:           r.contact_name,
      email:                  r.email,
      phone:                  r.phone ?? "",
      notes:                  r.notes ?? "",
      enquiry_source:         r.enquiry_source ?? "",
      consent_given:          r.consent_given ?? "",
      privacy_policy_version: r.privacy_policy_version ?? "",
      // Not omitted for withdrawn/voided rows, per brief section 2c - marked
      // in the export rather than disappearing from it.
      status:                 r.agm_record_status,
    }));
    const csv = toCsv(rows as unknown as Record<string, unknown>[]);
    const today = new Date().toISOString().split("T")[0];
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `csl-proxy-registered-interest-${meetingRef}-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-900">AGM Proxy</h1>
        <span className="text-gray-500 font-semibold text-[0.95rem]">{meetingRef}</span>
      </div>

      <div className={`rounded-lg border px-3.5 py-2.5 ${modeNotice.cls}`}>
        <p className="text-[0.82rem] font-semibold leading-snug">{modeNotice.text}</p>
      </div>

      <div>
        <p className="text-2xl font-bold text-gray-900 tabular-nums">
          {totalCount.toLocaleString("en-GB")} proxy appointment{totalCount === 1 ? "" : "s"} recorded
        </p>
        <p className="text-[0.8rem] text-gray-500 mt-1.5">{qualifierLine}</p>
      </div>

      {/* THE APPOINTMENT - mirrors THE REQUISITION on the resolution page,
          including "Change wording": brief section 2c applies to the proxy
          declaration too, and there is no version table behind it by
          design, so editing is a single config value rather than a new
          row. */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-b border-gray-100">
          <p className="text-[0.78rem] font-bold uppercase tracking-wider text-gray-600">The Appointment</p>
          {!editingDeclaration && (
            <button
              onClick={() => setEditingDeclaration(true)}
              className="text-[0.78rem] text-csl-dark hover:underline font-semibold"
            >
              Change wording
            </button>
          )}
        </div>

        {editingDeclaration ? (
          <DeclarationForm
            currentText={declarationText}
            signedCount={signedCountForDeclaration}
            matchingCurrentTextCount={matchingCurrentTextForDeclaration}
            onClose={() => setEditingDeclaration(false)}
          />
        ) : (
          <>
            <p className="px-4 pt-3 text-[0.82rem] text-gray-500">
              Every appointment names <strong className="text-gray-800">{APPOINTEE_LABEL}</strong> as proxy.
            </p>
            <button
              onClick={() => setShowFullText((e) => !e)}
              aria-expanded={showFullText}
              className="w-full flex items-center gap-2 px-4 py-2.5 mt-1 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-[0.82rem] text-gray-500">{showFullText ? "Hide" : "Show declaration text"}</span>
              <ChevronIcon open={showFullText} />
            </button>
            {showFullText && (
              <div className="px-4 pb-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3.5">
                  <p className="text-[0.82rem] text-gray-800 leading-relaxed whitespace-pre-line">
                    {declarationText ?? "No declaration text has been set."}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Appointments: a single collapsed row with Export beside it - same
          shape as Who has signed on the resolution page. */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={() => setAppointmentsExpanded((e) => !e)}
            aria-expanded={appointmentsExpanded}
            className="flex items-center gap-2 text-left"
          >
            <span className="text-[0.82rem] font-semibold text-gray-600">
              Appointments ({appointments.length.toLocaleString("en-GB")})
            </span>
            <ChevronIcon open={appointmentsExpanded} />
          </button>
          <button
            onClick={downloadAppointmentsCsv}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-csl-dark text-white hover:bg-csl-mid transition-colors whitespace-nowrap"
          >
            Export CSV
          </button>
        </div>

        {appointmentsExpanded && (
          <div className="border-t border-gray-100 overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: "10%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "21%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "14%" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Name</th>
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Email</th>
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Held</th>
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">SRN</th>
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                      No appointments yet.
                    </td>
                  </tr>
                )}
                {appointments.map((a) => {
                  const fields: AgmField[] = [
                    { key: "full_name", label: "Full name", type: "text", value: a.full_name },
                    { key: "email", label: "Email", type: "text", value: a.email },
                    { key: "address_line_1", label: "Address line 1", type: "text", value: a.address_line_1 },
                    { key: "address_line_2", label: "Address line 2", type: "text", value: a.address_line_2 },
                    { key: "address_town", label: "Town", type: "text", value: a.address_town },
                    { key: "address_postcode", label: "Postcode", type: "text", value: a.address_postcode },
                    { key: "how_held", label: "How held (direct/nominee)", type: "text", value: a.how_held },
                    { key: "computershare_srn", label: "Computershare SRN", type: "text", value: a.computershare_srn },
                    { key: "nominee_platform", label: "Nominee platform", type: "text", value: a.nominee_platform },
                    { key: "nominee_platform_other", label: "Nominee platform (other)", type: "text", value: a.nominee_platform_other },
                    { key: "shares_held", label: "Shares held (band)", type: "text", value: a.shares_held },
                    { key: "shares_held_exact", label: "Shares held (exact)", type: "text", value: a.shares_held_exact != null ? String(a.shares_held_exact) : null },
                    { key: "share_class", label: "Share class", type: "text", value: a.share_class },
                    { key: "appointee_name", label: "Appointee", type: "text", value: a.appointee_name },
                    { key: "signature_name", label: "Signature name", type: "text", value: a.signature_name },
                    { key: "signed_at", label: "Signed at", type: "text", value: a.signed_at },
                    { key: "lodgement_path", label: "Lodgement path (we-lodge/member-lodges)", type: "text", value: a.lodgement_path },
                    // Package 6, section 7: a volunteer must be able to set
                    // this from the admin, because members reply by email
                    // rather than clicking the confirmation link.
                    { key: "nominee_instruction_sent", label: "Nominee has sent instruction to platform", type: "checkbox", value: a.nominee_instruction_sent === true },
                  ];
                  return (
                  <Fragment key={a.id}>
                  <tr
                    className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${
                      a.suspected_bot ? "bg-red-50/40" : a.status === "withdrawn" ? "bg-gray-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(a.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 truncate">{a.full_name}</td>
                    <td className="px-4 py-3 text-gray-600 truncate" title={a.email}>{a.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{heldBadge(a.how_held)}</td>
                    <td className="px-4 py-3 text-gray-500 text-[0.8rem] whitespace-nowrap truncate">{a.computershare_srn ?? "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        {a.suspected_bot ? (
                          <>
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[0.75rem] font-semibold bg-red-100 text-red-800">
                              Suspected bot
                            </span>
                            <SuspectedBotActions id={a.id} table="agm_proxies" />
                          </>
                        ) : (
                          <>
                            <RevokeAction appointment={a} />
                            {a.status === "active" && (
                              <AgmStatusAction
                                table="agm_proxies"
                                id={a.id}
                                currentStatus={a.status}
                                personLabel={a.full_name}
                                actions={["voided"]}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <button
                          type="button"
                          onClick={() => setEditingAppointmentId(editingAppointmentId === a.id ? null : a.id)}
                          className="text-[0.75rem] text-csl-dark hover:underline font-medium"
                        >
                          {editingAppointmentId === a.id ? "Close" : "Edit"}
                        </button>
                        <a href={`/api/proxy/pdf/${a.id}`} className="text-[0.75rem] text-gray-500 hover:underline">
                          Download PDF
                        </a>
                        {a.email_error && (
                          <span className="text-[0.7rem] text-red-700 font-semibold" title={a.email_error}>
                            Email failed
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingAppointmentId === a.id && (
                    <tr className="border-b border-gray-100">
                      <td colSpan={7} className="px-4 py-3 bg-gray-50">
                        <AgmRecordEditor
                          table="agm_proxies"
                          id={a.id}
                          fields={fields}
                          warningText={`This edits ${a.full_name}'s appointment record. If the appointee name or signature no longer matches what they signed, the registrar may reject the appointment - re-signing may be needed.`}
                          open={true}
                          onClose={() => setEditingAppointmentId(null)}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Registered interest: pre-Notice-of-AGM intentions, from
          shareholder_cases, not agm_proxies - an intention is not an
          appointment, so it is not counted above and lives in its own
          disclosure with its own export, never mixed into the appointments
          file. This is the list a Notice-of-AGM email campaign works from,
          which previously only existed on the Cases page with no proxy
          context around it. */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={() => setInterestExpanded((e) => !e)}
            aria-expanded={interestExpanded}
            className="flex items-center gap-2 text-left"
          >
            <span className="text-[0.82rem] font-semibold text-gray-600">
              Registered interest ({interestCountable.length.toLocaleString("en-GB")})
            </span>
            <ChevronIcon open={interestExpanded} />
          </button>
          <button
            onClick={downloadInterestCsv}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-csl-dark text-white hover:bg-csl-mid transition-colors whitespace-nowrap"
          >
            Export CSV
          </button>
        </div>

        {interestExpanded && (
          <div className="border-t border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Name</th>
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {registeredInterest.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">
                      No registered interest yet.
                    </td>
                  </tr>
                )}
                {registeredInterest.map((r) => (
                  <Fragment key={r.id}>
                  <tr
                    className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${r.suspected_bot ? "bg-red-50/40" : ""}`}
                  >
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.contact_name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.suspected_bot ? (
                        <div className="flex flex-col gap-1 items-start">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[0.75rem] font-semibold bg-red-100 text-red-800">
                            Suspected bot
                          </span>
                          <SuspectedBotActions id={r.id} table="shareholder_cases" />
                        </div>
                      ) : r.agm_record_status !== "active" ? (
                        <span className="text-gray-400 text-[0.75rem] capitalize">{r.agm_record_status}</span>
                      ) : (
                        <span className="text-gray-400 text-[0.75rem]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <button
                          type="button"
                          onClick={() => setEditingInterestId(editingInterestId === r.id ? null : r.id)}
                          className="text-[0.75rem] text-csl-dark hover:underline font-medium"
                        >
                          {editingInterestId === r.id ? "Close" : "Edit"}
                        </button>
                        {!r.suspected_bot && (
                          <AgmStatusAction table="shareholder_cases" id={r.id} currentStatus={r.agm_record_status} personLabel={r.contact_name} />
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingInterestId === r.id && (
                    <tr className="border-b border-gray-100">
                      <td colSpan={5} className="px-4 py-3 bg-gray-50">
                        <AgmRecordEditor
                          table="shareholder_cases"
                          id={r.id}
                          fields={[
                            { key: "contact_name", label: "Name", type: "text", value: r.contact_name },
                            { key: "email", label: "Email", type: "text", value: r.email },
                            { key: "phone", label: "Phone", type: "text", value: r.phone },
                            { key: "notes", label: "Notes", type: "textarea", value: r.notes },
                            { key: "enquiry_source", label: "Source", type: "text", value: r.enquiry_source },
                          ]}
                          open={true}
                          onClose={() => setEditingInterestId(null)}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
