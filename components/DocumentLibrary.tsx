"use client";

import { useState } from "react";
import DocumentCard from "@/components/DocumentCard";
import type { MemberDocument } from "@/app/member-portal/documents/page";

const CATEGORIES = [
  "All",
  "Meeting Minutes",
  "Research & Papers",
  "AGM Documents",
  "Governance",
  "Guides & Templates",
] as const;

type Props = {
  documents: MemberDocument[];
};

export default function DocumentLibrary({ documents }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const filtered =
    activeCategory === "All"
      ? documents
      : documents.filter((d) => d.category === activeCategory);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Library</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            CSL documents available to all active members.
          </p>
        </div>
        <span className="self-start text-xs font-semibold bg-white text-csl-dark border border-gray-200 px-2.5 py-1 rounded-full whitespace-nowrap">
          {documents.length} document{documents.length !== 1 ? "s" : ""}
        </span>
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
            <DocumentCard key={doc.id} document={doc} />
          ))}
        </div>
      )}
    </div>
  );
}
