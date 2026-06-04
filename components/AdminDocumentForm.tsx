"use client";

import { useState } from "react";
import Link from "next/link";

const CATEGORIES = [
  "Meeting Minutes",
  "Research & Papers",
  "AGM Documents",
  "Governance",
  "Guides & Templates",
  "Recordings",
] as const;

const inputCls =
  "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-csl-dark focus:border-transparent";

const labelCls = "block text-sm font-semibold text-gray-700 mb-1.5";

export default function AdminDocumentForm() {
  const [title, setTitle]           = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory]     = useState<string>(CATEGORIES[0]);
  const [driveUrl, setDriveUrl]     = useState("");
  const [docDate, setDocDate]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [published, setPublished]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          category,
          drive_url: driveUrl,
          published_at: docDate,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to publish document.");
        return;
      }
      setPublished(true);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (published) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="text-4xl mb-4">&#10003;</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Document published</h2>
        <p className="text-gray-500 text-sm mb-6">
          The document is now visible in the member portal Documents section.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/member-portal"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors"
          >
            Back to portal
          </Link>
          <button
            onClick={() => {
              setTitle(""); setDescription(""); setDriveUrl(""); setDocDate("");
              setCategory(CATEGORIES[0]); setPublished(false);
            }}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Add another document
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="title" className={labelCls}>Title</label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          placeholder="e.g. Members Meeting Minutes - June 2026"
        />
      </div>

      <div>
        <label htmlFor="description" className={labelCls}>
          Description <span className="text-gray-400 font-normal">(one line)</span>
        </label>
        <input
          id="description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputCls}
          placeholder="e.g. Minutes from the CSL members meeting held 10 June 2026."
        />
      </div>

      <div>
        <label htmlFor="category" className={labelCls}>Category</label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputCls}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="driveUrl" className={labelCls}>Google Drive URL</label>
        <input
          id="driveUrl"
          type="url"
          required
          value={driveUrl}
          onChange={(e) => setDriveUrl(e.target.value)}
          className={inputCls}
          placeholder="https://drive.google.com/file/d/..."
        />
        <p className="text-gray-400 text-xs mt-1.5">
          Right-click the file in Google Drive &rarr; Get link &rarr; Copy link.
          Ensure the root folder is shared as &ldquo;Anyone with the link &mdash; Viewer&rdquo;.
        </p>
      </div>

      <div>
        <label htmlFor="docDate" className={labelCls}>Document date</label>
        <input
          id="docDate"
          type="date"
          required
          value={docDate}
          onChange={(e) => setDocDate(e.target.value)}
          className={inputCls}
        />
        <p className="text-gray-400 text-xs mt-1.5">
          Use the date of the document, not today&apos;s date.
        </p>
      </div>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center px-6 py-2.5 rounded-lg text-sm font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors disabled:opacity-60"
        >
          {submitting ? "Publishing..." : "Publish Document"}
        </button>
        <Link
          href="/member-portal"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
