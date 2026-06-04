"use client";

import { useState } from "react";
import DocumentCard, { toPreviewUrl, type MemberDocument } from "@/components/DocumentCard";
import DocumentViewerModal from "@/components/DocumentViewerModal";

const CATEGORIES = [
  "All",
  "Meeting Minutes",
  "Research & Papers",
  "AGM Documents",
  "Governance",
  "Guides & Templates",
  "Recordings",
] as const;

type Props = {
  documents: MemberDocument[];
  isAdmin?: boolean;
};

export default function DocumentLibrary({ documents, isAdmin }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [viewingDoc, setViewingDoc] = useState<MemberDocument | null>(null);

  const filtered =
    activeCategory === "All"
      ? documents
      : documents.filter((d) => d.category === activeCategory);

  return (
    <>
      <div>
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">Documents</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            CSL documents available to all active members.
          </p>
        </div>

        {/* Category filter pills */}
        <div className="overflow-x-auto mb-6 -mx-1 px-1">
          <div className="flex gap-2 min-w-max pb-0.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? "bg-csl-dark text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Document list */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-400 text-sm">No documents in this category yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((doc) => (
              <DocumentCard key={doc.id} document={doc} onView={setViewingDoc} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </div>

      {/* Document viewer modal */}
      {viewingDoc && (
        <DocumentViewerModal
          title={viewingDoc.title}
          previewUrl={toPreviewUrl(viewingDoc.drive_url)}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </>
  );
}
