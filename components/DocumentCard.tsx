"use client";

export type MemberDocument = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  drive_url: string;
  file_type: string;
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
};

export default function DocumentCard({ document: doc, onView }: Props) {
  const badgeClass = CATEGORY_BADGE[doc.category] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${badgeClass}`}>
            {doc.category}
          </span>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {doc.file_type}
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
      <button
        onClick={() => onView(doc)}
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors whitespace-nowrap"
      >
        View Document &#8594;
      </button>
    </div>
  );
}
