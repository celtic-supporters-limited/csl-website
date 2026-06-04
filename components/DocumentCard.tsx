"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type MemberDocument = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  drive_url: string;
  published_at: string;
};

const CATEGORY_BADGE: Record<string, string> = {
  "Meeting Minutes":    "bg-blue-100 text-blue-800",
  "Research & Papers":  "bg-purple-100 text-purple-800",
  "AGM Documents":      "bg-amber-100 text-amber-800",
  "Governance":         "bg-green-100 text-green-800",
  "Guides & Templates": "bg-gray-100 text-gray-700",
  "Recordings":         "bg-teal-100 text-teal-800",
};

export function toPreviewUrl(driveUrl: string): string {
  // Convert .../file/d/FILE_ID/view?usp=... to .../file/d/FILE_ID/preview
  // so the document opens in a clean viewer with no Drive navigation chrome.
  return driveUrl.replace(/\/view(\?.*)?$/, "/preview");
}

function formatDate(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

type Props = {
  document: MemberDocument;
  onView: (doc: MemberDocument) => void;
  isAdmin?: boolean;
};

export default function DocumentCard({ document: doc, onView, isAdmin }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const router = useRouter();
  const badgeClass = CATEGORY_BADGE[doc.category] ?? "bg-gray-100 text-gray-700";

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDeleteError(data.error ?? "Delete failed.");
        setDeleting(false);
        return;
      }
      router.push("/member-portal");
    } catch {
      setDeleteError("An unexpected error occurred.");
      setDeleting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${badgeClass}`}>
            {doc.category}
          </span>
        </div>
        <h3 className="font-semibold text-gray-900 text-[0.93rem] leading-snug">
          {doc.title}
        </h3>
        {doc.description && (
          <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">{doc.description}</p>
        )}
        <p className="text-gray-400 text-xs mt-1.5">{formatDate(doc.published_at)}</p>
      </div>

      <div className="flex-shrink-0 flex flex-col items-stretch gap-2">
        <button
          onClick={() => onView(doc)}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors whitespace-nowrap"
        >
          View Document &#8594;
        </button>

        {isAdmin && !confirming && (
          <div className="flex gap-2">
            <Link
              href={`/member-portal/admin/documents/${doc.id}/edit`}
              className="flex-1 inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Edit
            </Link>
            <button
              onClick={() => setConfirming(true)}
              className="flex-1 inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          </div>
        )}

        {isAdmin && confirming && (
          <div className="space-y-2">
            <p className="text-xs text-gray-700 font-medium">
              Are you sure? This cannot be undone.
            </p>
            {deleteError && (
              <p className="text-xs text-red-600">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
              <button
                onClick={() => { setConfirming(false); setDeleteError(null); }}
                disabled={deleting}
                className="flex-1 inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60"
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
