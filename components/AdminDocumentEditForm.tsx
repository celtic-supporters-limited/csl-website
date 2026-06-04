"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

type Props = {
  id: string;
  initial: {
    title: string;
    description: string;
    category: string;
    drive_url: string;
    published_at: string;
  };
};

export default function AdminDocumentEditForm({ id, initial }: Props) {
  const [title, setTitle]             = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory]       = useState(initial.category);
  const [driveUrl, setDriveUrl]       = useState(initial.drive_url);
  const [docDate, setDocDate]         = useState(initial.published_at);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
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
        setError(data.error ?? "Failed to update document.");
        return;
      }
      router.push("/member-portal");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
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
        />
        <p className="text-gray-400 text-xs mt-1.5">
          Right-click the file in Google Drive &rarr; Get link &rarr; Copy link.
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
          {submitting ? "Saving..." : "Save Changes"}
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
