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

/**
 * Activate a version. The confirmation names the version and states plainly
 * what activating it does - this is the one action in this page that can
 * release the second lock, and the only place that fact is surfaced before it
 * happens.
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
    <div className="text-[0.75rem] bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2 max-w-xs">
      <p className="text-amber-900 leading-snug">
        Make <strong>&quot;{version.version_label}&quot;</strong> the current version.{" "}
        {version.is_placeholder
          ? "It is a placeholder, so signing stays blocked even if the gate is open."
          : "If the requisition gate is also open, signing becomes possible immediately."}
      </p>
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
        explicit step below once you are ready. There is no edit action anywhere: a version
        already saved cannot be changed, the database refuses it. Create a new one instead.
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
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No versions yet.
                  </td>
                </tr>
              )}
              {versions.map((v) => (
                <tr key={v.id} className="border-b border-gray-100 last:border-0 align-top hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">{v.version_label}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(v.created_at)}</td>
                  <td className="px-4 py-3 text-gray-500 text-[0.8rem] whitespace-nowrap">{v.created_by ?? "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      {v.is_current && (
                        <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-[0.72rem] font-semibold bg-green-100 text-green-800">
                          Current
                        </span>
                      )}
                      {v.is_placeholder && (
                        <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-[0.72rem] font-semibold bg-gray-100 text-gray-600">
                          Placeholder
                        </span>
                      )}
                    </div>
                  </td>
                  {/* The important column: it is what makes the immutability real
                      to whoever is looking at this list. */}
                  <td className="px-4 py-3 text-right text-gray-900 font-semibold tabular-nums">
                    {v.signatureCount.toLocaleString("en-GB")}
                  </td>
                  <td className="px-4 py-3">
                    <ActivateAction version={v} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
