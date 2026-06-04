"use client";

import { useEffect } from "react";

type Props = {
  title: string;
  previewUrl: string;
  onClose: () => void;
};

export default function DocumentViewerModal({ title, previewUrl, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col"
        style={{ height: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 flex-shrink-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate pr-4">{title}</h3>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-base"
            aria-label="Close document viewer"
          >
            &#10005;
          </button>
        </div>
        {/* Embedded document */}
        <div className="flex-1 min-h-0 rounded-b-xl overflow-hidden">
          <iframe
            src={previewUrl}
            className="w-full h-full border-0"
            title={title}
          />
        </div>
      </div>
    </div>
  );
}
