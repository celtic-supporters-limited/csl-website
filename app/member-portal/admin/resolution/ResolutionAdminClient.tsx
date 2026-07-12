"use client";

import { useState } from "react";

type Signature = {
  id: string;
  full_name: string;
  email: string;
  postal_address: string;
  is_shareholder: boolean;
  shareholder_type: string | null;
  computershare_srn: string | null;
  nominee_platform: string | null;
  approximate_shares: number | null;
  typed_signature: string;
  signature_date: string;
  shareholder_tag: string;
  member_tag: string;
  created_at: string;
};

type SortKey = "created_at" | "shareholder_tag";
type SortDir = "asc" | "desc";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function tagBadge(tag: string) {
  const map: Record<string, { label: string; cls: string }> = {
    "direct-registered": { label: "Direct", cls: "bg-green-100 text-green-800" },
    "nominee-platform":  { label: "Nominee", cls: "bg-blue-100 text-blue-700" },
    "non-shareholder":   { label: "Non-shareholder", cls: "bg-gray-100 text-gray-600" },
    "member":            { label: "Member", cls: "bg-csl-light text-csl-dark" },
    "non-member":        { label: "Non-member", cls: "bg-gray-100 text-gray-500" },
  };
  const { label, cls } = map[tag] ?? { label: tag, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[0.75rem] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// RFC 4180 CSV
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\r\n");
}

export default function ResolutionAdminClient({
  signatures,
  resolutionTarget,
}: {
  signatures: Signature[];
  resolutionTarget: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const directCount      = signatures.filter((s) => s.shareholder_tag === "direct-registered").length;
  const nomineeCount     = signatures.filter((s) => s.shareholder_tag === "nominee-platform").length;
  const nonShareholderCount = signatures.filter((s) => s.shareholder_tag === "non-shareholder").length;
  const memberCount      = signatures.filter((s) => s.member_tag === "member").length;
  const nonMemberCount   = signatures.filter((s) => s.member_tag === "non-member").length;
  const totalCount       = signatures.length;
  const progressPct      = Math.min(100, Math.round((directCount / resolutionTarget) * 100));

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...signatures].sort((a, b) => {
    const va = a[sortKey] ?? "";
    const vb = b[sortKey] ?? "";
    const cmp = String(va).localeCompare(String(vb));
    return sortDir === "asc" ? cmp : -cmp;
  });

  function downloadCsv() {
    const rows = signatures.map((s) => ({
      date:              fmtDate(s.created_at),
      full_name:         s.full_name,
      email:             s.email,
      postal_address:    s.postal_address,
      is_shareholder:    s.is_shareholder ? "Yes" : "No",
      shareholder_type:  s.shareholder_type ?? "",
      computershare_srn: s.computershare_srn ?? "",
      nominee_platform:  s.nominee_platform ?? "",
      approximate_shares: s.approximate_shares ?? "",
      typed_signature:   s.typed_signature,
      signature_date:    s.signature_date,
      shareholder_tag:   s.shareholder_tag,
      member_tag:        s.member_tag,
    }));
    const csv = toCsv(rows as unknown as Record<string, unknown>[]);
    const today = new Date().toISOString().split("T")[0];
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `csl-resolution-signatures-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-1">&#8597;</span>;
    return <span className="text-csl-dark ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">AGM Resolution Signatures</h1>
        <button
          onClick={downloadCsv}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-csl-dark text-white hover:bg-csl-mid transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Direct registered shareholders", value: directCount, highlight: true },
          { label: "Nominee / platform holders", value: nomineeCount },
          { label: "Non-shareholders", value: nonShareholderCount },
          { label: "Total signatures", value: totalCount },
          { label: "CSL members", value: memberCount },
          { label: "Non-members", value: nonMemberCount },
        ].map(({ label, value, highlight }) => (
          <div
            key={label}
            className={`rounded-xl p-4 border ${highlight ? "bg-csl-dark text-white border-csl-dark" : "bg-white border-gray-200"}`}
          >
            <p className={`text-2xl font-bold tabular-nums ${highlight ? "text-white" : "text-gray-900"}`}>
              {value.toLocaleString("en-GB")}
            </p>
            <p className={`text-[0.78rem] mt-0.5 ${highlight ? "text-white/75" : "text-gray-500"}`}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700">Direct registered shareholder signatures</p>
          <span className="text-sm font-bold text-csl-dark tabular-nums">
            {directCount.toLocaleString("en-GB")} / {resolutionTarget.toLocaleString("en-GB")}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div className="bg-csl-dark h-3 rounded-full" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="text-[0.75rem] text-gray-400 mt-1.5">{progressPct}% of target</p>
      </div>

      {/* Signatures table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th
                  className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 cursor-pointer whitespace-nowrap"
                  onClick={() => toggleSort("created_at")}
                >
                  Date <SortIcon k="created_at" />
                </th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Name</th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Email</th>
                <th
                  className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 cursor-pointer whitespace-nowrap"
                  onClick={() => toggleSort("shareholder_tag")}
                >
                  Shareholder <SortIcon k="shareholder_tag" />
                </th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Member</th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">SRN</th>
                <th className="px-4 py-3 text-left text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Platform</th>
                <th className="px-4 py-3 text-right text-[0.78rem] font-semibold text-gray-500 whitespace-nowrap">Shares</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No signatures yet.
                  </td>
                </tr>
              )}
              {sorted.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(s.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{s.full_name}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.email}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{tagBadge(s.shareholder_tag)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{tagBadge(s.member_tag)}</td>
                  <td className="px-4 py-3 text-gray-500 text-[0.8rem] whitespace-nowrap">{s.computershare_srn ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-500 text-[0.8rem] whitespace-nowrap">{s.nominee_platform ?? "-"}</td>
                  <td className="px-4 py-3 text-right text-gray-600 tabular-nums whitespace-nowrap">
                    {s.approximate_shares?.toLocaleString("en-GB") ?? "-"}
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
