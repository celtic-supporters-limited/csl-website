"use client";

import { useState, useTransition, useMemo } from "react";

export type Case = {
  id: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  case_type: string | null;
  enquiry_source: string | null;
  notes: string | null;
  status: string | null;
  assigned_to: string | null;
  created_at: string;
};

type TypeFilter   = "all" | "Proxy Assignment" | "Share Tracing";
type StatusFilter = "all" | "New" | "In Progress" | "Resolved";

const STATUSES = ["New", "In Progress", "Resolved"] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string | null }) {
  const cls =
    status === "Resolved"   ? "bg-green-100 text-green-800 border-green-200" :
    status === "In Progress" ? "bg-blue-100 text-blue-800 border-blue-200"   :
                               "bg-amber-100 text-amber-800 border-amber-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {status ?? "New"}
    </span>
  );
}

function TypeBadge({ type }: { type: string | null }) {
  const isProxy = type === "Proxy Assignment";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
      isProxy
        ? "bg-yellow-50 text-yellow-800 border-yellow-200"
        : "bg-emerald-50 text-emerald-800 border-emerald-200"
    }`}>
      {isProxy ? "Proxy" : "Share Tracing"}
    </span>
  );
}

function CaseRow({ c, onUpdated }: { c: Case; onUpdated: (updated: Partial<Case>) => void }) {
  const [expanded, setExpanded]   = useState(false);
  const [assignedTo, setAssignedTo] = useState(c.assigned_to ?? "");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [, startTransition]       = useTransition();

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/cases/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json() as { error?: string };
        setError(j.error ?? "Update failed.");
      } else {
        startTransition(() => onUpdated(body as Partial<Case>));
      }
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      {/* Header row */}
      <div className="flex flex-wrap items-start gap-3 px-5 py-4">
        {/* Left: type + name + email + date */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <TypeBadge type={c.case_type} />
            <StatusBadge status={c.status} />
          </div>
          <p className="font-semibold text-gray-900 text-sm truncate">{c.contact_name ?? "—"}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {c.email && (
              <a href={`mailto:${c.email}`} className="text-xs text-csl-dark hover:underline">
                {c.email}
              </a>
            )}
            {c.phone && (
              <span className="text-xs text-gray-400">{c.phone}</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">Submitted {formatDate(c.created_at)}</p>
          {c.enquiry_source && (
            <p className="text-xs text-gray-400">Source: {c.enquiry_source}</p>
          )}
        </div>

        {/* Right: status select + assigned to */}
        <div className="flex flex-col gap-2 items-end min-w-[160px]">
          <select
            value={c.status ?? "New"}
            disabled={saving}
            onChange={(e) => patch({ status: e.target.value })}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-csl-dark disabled:opacity-60 bg-white"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Assign to..."
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            onBlur={() => {
              if (assignedTo !== (c.assigned_to ?? "")) {
                patch({ assigned_to: assignedTo || null });
              }
            }}
            disabled={saving}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs w-full focus:outline-none focus:ring-2 focus:ring-csl-dark disabled:opacity-60"
          />
        </div>
      </div>

      {/* Notes / expand */}
      {c.notes && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setExpanded((x) => !x)}
            className="w-full text-left px-5 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1"
          >
            <span>{expanded ? "&#9650;" : "&#9660;"}</span>
            {expanded ? "Hide notes" : "Show notes"}
          </button>
          {expanded && (
            <div className="px-5 pb-4">
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans">{c.notes}</pre>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="px-5 pb-3 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

export default function CasesAdmin({ initialCases }: { initialCases: Case[] }) {
  const [cases, setCases]           = useState<Case[]>(initialCases);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  function updateCase(id: string, updated: Partial<Case>) {
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updated } : c))
    );
  }

  const counts = useMemo(() => ({
    all:              cases.length,
    proxy:            cases.filter((c) => c.case_type === "Proxy Assignment").length,
    tracing:          cases.filter((c) => c.case_type === "Share Tracing").length,
    new:              cases.filter((c) => (c.status ?? "New") === "New").length,
    inProgress:       cases.filter((c) => c.status === "In Progress").length,
    resolved:         cases.filter((c) => c.status === "Resolved").length,
  }), [cases]);

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (typeFilter !== "all" && c.case_type !== typeFilter) return false;
      const s = c.status ?? "New";
      if (statusFilter !== "all" && s !== statusFilter) return false;
      return true;
    });
  }, [cases, typeFilter, statusFilter]);

  function pill(
    label: string,
    count: number,
    active: boolean,
    onClick: () => void,
    colour = "bg-gray-100 text-gray-600"
  ) {
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
          active
            ? "bg-csl-dark text-white border-csl-dark"
            : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
        }`}
      >
        {label}
        <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${
          active ? "bg-white/20 text-white" : colour
        }`}>
          {count}
        </span>
      </button>
    );
  }

  return (
    <div>
      {/* Type filter */}
      <div className="flex flex-wrap gap-2 mb-3">
        {pill("All", counts.all, typeFilter === "all", () => setTypeFilter("all"))}
        {pill("Proxy Assignment", counts.proxy, typeFilter === "Proxy Assignment", () => setTypeFilter("Proxy Assignment"), "bg-yellow-100 text-yellow-800")}
        {pill("Share Tracing", counts.tracing, typeFilter === "Share Tracing", () => setTypeFilter("Share Tracing"), "bg-emerald-100 text-emerald-800")}
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {pill("All statuses", counts.all, statusFilter === "all", () => setStatusFilter("all"))}
        {pill("New", counts.new, statusFilter === "New", () => setStatusFilter("New"), "bg-amber-100 text-amber-800")}
        {pill("In Progress", counts.inProgress, statusFilter === "In Progress", () => setStatusFilter("In Progress"), "bg-blue-100 text-blue-800")}
        {pill("Resolved", counts.resolved, statusFilter === "Resolved", () => setStatusFilter("Resolved"), "bg-green-100 text-green-800")}
      </div>

      {/* Case list */}
      {filtered.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-10 text-center">
          <p className="font-semibold text-gray-900 mb-1">No cases match these filters</p>
          <p className="text-sm text-gray-400">Try a different type or status filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => (
            <CaseRow
              key={c.id}
              c={c}
              onUpdated={(updated) => updateCase(c.id, updated)}
            />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-gray-400 mt-4 text-right">
          {filtered.length} of {cases.length} case{cases.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
