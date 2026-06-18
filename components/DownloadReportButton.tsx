"use client";

import { useState, useRef, useEffect } from "react";

const FORMATS = [
  { fmt: "pdf",  label: "PDF",  desc: "For sharing or printing" },
  { fmt: "docx", label: "Word", desc: "Editable in Microsoft Word" },
  { fmt: "xlsx", label: "Excel", desc: "Spreadsheet for analysis" },
] as const;

export default function DownloadReportButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="border border-csl-dark text-csl-dark px-4 py-2 rounded-lg text-sm font-semibold hover:bg-csl-light transition-colors whitespace-nowrap flex items-center gap-2"
      >
        Download report
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
          {FORMATS.map(({ fmt, label, desc }) => (
            <a
              key={fmt}
              href={`/api/admin/reporting/export?format=${fmt}`}
              onClick={() => setOpen(false)}
              className="flex flex-col px-4 py-3 hover:bg-csl-light transition-colors border-b border-gray-100 last:border-0"
            >
              <span className="text-sm font-semibold text-gray-900">{label}</span>
              <span className="text-xs text-gray-500">{desc}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
