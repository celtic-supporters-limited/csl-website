"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type VersionRow = {
  id: string;
  version_label: string;
  body: string;
  declaration_text: string;
  consent_text: string;
  supporting_statement: string | null;
  is_placeholder: boolean;
  is_current: boolean;
  created_at: string;
  created_by: string | null;
  meeting_ref: string;
  signatureCount: number;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

const inputClass =
  "w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-lg text-[0.85rem] font-[inherit] transition-colors duration-200 focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10";
const labelClass = "block text-[0.8rem] font-semibold text-gray-800 mb-1";

/** Same chevron used by the accordion panels on the My Membership portal tab. */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`w-4 h-4 text-gray-400 transition-transform duration-150 flex-shrink-0 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type SectionTone = {
  badgeBg: string;
  badgeText: string;
  cardBg: string;
  cardBorder: string;
  labelText: string;
};

const RESOLUTION_TONE: SectionTone = {
  badgeBg: "bg-csl-light", badgeText: "text-csl-dark",
  cardBg: "bg-csl-light/60", cardBorder: "border-csl-dark/20", labelText: "text-csl-dark",
};
const STATEMENT_TONE: SectionTone = {
  badgeBg: "bg-blue-100", badgeText: "text-blue-800",
  cardBg: "bg-blue-50", cardBorder: "border-blue-200", labelText: "text-blue-800",
};
const DECLARATION_TONE: SectionTone = {
  badgeBg: "bg-amber-100", badgeText: "text-amber-800",
  cardBg: "bg-amber-50", cardBorder: "border-amber-200", labelText: "text-amber-800",
};
const CONSENT_TONE: SectionTone = {
  badgeBg: "bg-purple-100", badgeText: "text-purple-800",
  cardBg: "bg-purple-50", cardBorder: "border-purple-200", labelText: "text-purple-800",
};

/**
 * One of the four texts, styled as its own card so it reads as a distinct
 * section rather than blending into the ones either side of it - each gets
 * its own colour identity, held constant everywhere this appears.
 */
function ContentSection({
  icon,
  label,
  text,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  text: string;
  tone: SectionTone;
}) {
  return (
    <div className={`rounded-lg border p-3.5 ${tone.cardBg} ${tone.cardBorder}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${tone.badgeBg} ${tone.badgeText}`} aria-hidden="true">
          {icon}
        </span>
        <p className={`text-[0.68rem] font-bold uppercase tracking-wider ${tone.labelText}`}>{label}</p>
      </div>
      <p className="text-[0.82rem] text-gray-800 leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}

const iconProps = { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "1.6", className: "w-3.5 h-3.5" };

/**
 * The four texts of a version, read-only. Shared between the row expansion
 * and the activation confirmation, so the two never drift out of sync with
 * each other or with what the public page actually renders.
 */
function VersionContent({ version }: { version: VersionRow }) {
  return (
    <div className="space-y-2.5">
      <ContentSection
        tone={RESOLUTION_TONE}
        label="Resolution"
        text={version.body}
        icon={
          <svg {...iconProps}>
            <rect x="4" y="3" width="12" height="14" rx="1" />
            <path d="M7 7h6M7 10h6M7 13h4" strokeLinecap="round" />
          </svg>
        }
      />
      {version.supporting_statement && (
        <ContentSection
          tone={STATEMENT_TONE}
          label="Supporting Statement"
          text={version.supporting_statement}
          icon={
            <svg {...iconProps}>
              <path d="M4 5h12v7H9l-3 3v-3H4V5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
      )}
      <ContentSection
        tone={DECLARATION_TONE}
        label="Declaration"
        text={version.declaration_text}
        icon={
          <svg {...iconProps}>
            <path d="M10 3l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V5l6-2z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7.5 10l2 2 3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
      />
      <ContentSection
        tone={CONSENT_TONE}
        label="Consent"
        text={version.consent_text}
        icon={
          <svg {...iconProps}>
            <rect x="5" y="9" width="10" height="7" rx="1" />
            <path d="M7 9V6a3 3 0 016 0v3" strokeLinecap="round" />
          </svg>
        }
      />
    </div>
  );
}

/**
 * Activate a version. The confirmation shows the version's full content
 * before offering the action, not just its label - this is the one action on
 * this page that can release the second lock, and it must not be possible to
 * activate a version without having had its text in front of you.
 */
function ActivateAction({ version }: { version: VersionRow }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (version.is_current) {
    return <span className="text-[0.75rem] text-gray-400">Already current</span>;
  }

  async function activate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/resolution-versions/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: version.id }),
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
      <button
        onClick={() => setConfirming(true)}
        className="text-[0.78rem] text-csl-dark hover:underline font-medium"
      >
        Make current
      </button>
    );
  }

  return (
    <div className="text-[0.75rem] bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-3 max-w-xl">
      <p className="text-amber-900 leading-snug">
        Make <strong>&quot;{version.version_label}&quot;</strong> the current version for{" "}
        <strong>{version.meeting_ref}</strong>.{" "}
        {version.is_placeholder
          ? "It is a placeholder, so signing stays blocked even if the gate is open."
          : "If the requisition gate is also open, signing becomes possible immediately."}
      </p>

      <div className="max-h-80 overflow-y-auto pr-0.5">
        <VersionContent version={version} />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={activate}
          disabled={loading}
          className="font-semibold text-amber-900 hover:underline disabled:opacity-60"
        >
          {loading ? "Activating..." : "Yes, activate"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="text-amber-600 hover:underline disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

function CreateVersionForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const payload = {
      versionLabel: fd.get("versionLabel"),
      body: fd.get("body"),
      declarationText: fd.get("declarationText"),
      consentText: fd.get("consentText"),
      supportingStatement: fd.get("supportingStatement"),
      isPlaceholder: fd.get("isPlaceholder") === "on",
    };

    try {
      const res = await fetch("/api/admin/resolution-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }
      setOpen(false);
      setSubmitting(false);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 text-sm font-semibold rounded-lg bg-csl-dark text-white hover:bg-csl-mid transition-colors"
      >
        Create version
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-gray-200 rounded-xl p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">Create a new version</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[0.78rem] text-gray-500 hover:underline"
        >
          Cancel
        </button>
      </div>

      <p className="text-[0.78rem] text-gray-500 leading-relaxed">
        Creates a new version only. It does not become current - do that as a separate,
        explicit step below once you are ready. There is no edit action anywhere, and the
        database refuses an update if one is attempted: a signature has to be provably bound
        to the exact text a person saw. If the wording could change under an existing version
        after the fact, every signature already recorded against it would become unprovable.
        Create a new version instead, and activate it when ready.
      </p>

      {error && (
        <p className="text-[0.8rem] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="versionLabel" className={labelClass}>Version label</label>
        <input id="versionLabel" name="versionLabel" type="text" required className={inputClass}
          placeholder="e.g. Solicitor-approved wording, 1 August 2026" />
      </div>

      <div>
        <label htmlFor="body" className={labelClass}>Resolution text</label>
        <textarea id="body" name="body" required rows={5} className={inputClass} />
      </div>

      <div>
        <label htmlFor="declarationText" className={labelClass}>Declaration text</label>
        <p className="text-[0.72rem] text-gray-400 mb-1">
          Shown next to the tick the signatory makes. Must be in the correct section 338 frame.
        </p>
        <textarea id="declarationText" name="declarationText" required rows={3} className={inputClass} />
      </div>

      <div>
        <label htmlFor="consentText" className={labelClass}>Consent text</label>
        <p className="text-[0.72rem] text-gray-400 mb-1">
          Requisition-specific. Must disclose that details are provided to Celtic plc.
        </p>
        <textarea id="consentText" name="consentText" required rows={3} className={inputClass} />
      </div>

      <div>
        <label htmlFor="supportingStatement" className={labelClass}>
          Supporting statement <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <p className="text-[0.72rem] text-gray-400 mb-1">
          Leave blank unless the section 314 statement has been decided. Blank means this
          section does not render at all on the public page.
        </p>
        <textarea id="supportingStatement" name="supportingStatement" rows={3} className={inputClass} />
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-[0.8rem] text-gray-700">
        <input type="checkbox" name="isPlaceholder" className="w-4 h-4 accent-csl-dark" />
        This is a placeholder, not real content signing should ever be collected against
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 text-sm font-semibold rounded-lg bg-csl-dark text-white hover:bg-csl-mid transition-colors disabled:opacity-60"
      >
        {submitting ? "Creating..." : "Create version"}
      </button>
    </form>
  );
}

/**
 * One version's table row, plus its expandable read-only content row. Local
 * state per row rather than a lifted set of expanded ids, since rows do not
 * need to coordinate with each other.
 *
 * The toggle and its reveal use the same chevron-and-left-accent-bar language
 * as the accordion panels on the My Membership portal tab, so an admin who
 * already knows that pattern reads this one the same way.
 */
function VersionTableRow({ version }: { version: VersionRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={`border-b border-gray-100 last:border-0 align-top hover:bg-gray-50 border-l-4 ${
          expanded ? "border-l-csl-dark" : "border-l-transparent"
        }`}
      >
        <td className="px-4 py-3 max-w-xs">
          <p className="font-medium text-gray-900">{version.version_label}</p>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="inline-flex px-2 py-0.5 rounded-full text-[0.72rem] font-semibold bg-csl-light text-csl-dark">
            {version.meeting_ref}
          </span>
        </td>
        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(version.created_at)}</td>
        <td className="px-4 py-3 text-gray-500 text-[0.8rem] whitespace-nowrap">{version.created_by ?? "-"}</td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex flex-col gap-1">
            {version.is_current && (
              <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-[0.72rem] font-semibold bg-green-100 text-green-800">
                Current
              </span>
            )}
            {version.is_placeholder && (
              <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-[0.72rem] font-semibold bg-gray-100 text-gray-600">
                Placeholder
              </span>
            )}
          </div>
        </td>
        {/* The important column: it is what makes the immutability real
            to whoever is looking at this list. */}
        <td className="px-4 py-3 text-right text-gray-900 font-semibold tabular-nums">
          {version.signatureCount.toLocaleString("en-GB")}
        </td>
        <td className="px-4 py-3">
          <ActivateAction version={version} />
        </td>
      </tr>
      <tr
        className={`border-b border-gray-100 last:border-0 border-l-4 ${
          expanded ? "border-l-csl-dark" : "border-l-transparent"
        }`}
      >
        <td colSpan={7} className="p-0">
          <div className={expanded ? "bg-gray-50/60" : ""}>
            <button
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-100/60 transition-colors"
            >
              <span className="text-[0.78rem] font-semibold text-csl-dark">Version text</span>
              <ChevronIcon open={expanded} />
            </button>
            {expanded && (
              <div className="px-4 pb-4">
                <VersionContent version={version} />
              </div>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}

export default function ResolutionVersionsClient({ versions }: { versions: VersionRow[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">AGM Resolution Versions</h1>
        <CreateVersionForm />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Label</th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">AGM</th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Created</th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">By</th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">State</th>
                <th className="px-4 py-3 text-right text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Signatures</th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {versions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No versions yet.
                  </td>
                </tr>
              )}
              {versions.map((v) => (
                <VersionTableRow key={v.id} version={v} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
