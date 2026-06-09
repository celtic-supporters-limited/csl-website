"use client";

import { useState } from "react";

export type TimelineEntry = {
  id: string;
  timestamp: string;
  type: string;
  label: string;
  detail: string;
};

type MemberSummary = {
  name: string;
  email: string;
  plan: string;
  status: string;
  joinedAt: string;
};

type Props = {
  member: MemberSummary;
  entries: TimelineEntry[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toPlainText(member: MemberSummary, entries: TimelineEntry[]): string {
  const lines = [
    "CSL Member Timeline",
    "===================",
    `Member: ${member.name} (${member.email})`,
    `Plan: ${member.plan} | Status: ${member.status}`,
    `Joined: ${formatDate(member.joinedAt)}`,
    "",
    "-".repeat(72),
  ];
  for (const e of entries) {
    const ts = formatDate(e.timestamp).padEnd(22);
    const label = e.label.padEnd(32);
    const row = `${ts}  ${label}  ${e.detail}`.trimEnd();
    lines.push(row);
  }
  lines.push("-".repeat(72));
  lines.push(`Generated: ${new Date().toLocaleString("en-GB")}`);
  return lines.join("\n");
}

function toCsv(entries: TimelineEntry[]): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = entries.map((e) =>
    [e.timestamp, escape(e.type), escape(e.label), escape(e.detail)].join(",")
  );
  return ["Timestamp,Type,Label,Detail", ...rows].join("\n");
}

export default function MemberTimeline({ member, entries }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(toPlainText(member, entries)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleExportCsv() {
    const blob = new Blob([toCsv(entries)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `csl-${member.email.replace(/@.*/, "")}-timeline.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Member summary */}
      <div className="bg-csl-light border border-green-200 rounded-md p-4 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900">{member.name}</p>
            <p className="text-sm text-gray-500">{member.email}</p>
          </div>
          <div className="text-sm space-y-0.5 text-right">
            <p>
              <span className="text-gray-500">Plan: </span>
              <span className="font-medium text-gray-800">{member.plan}</span>
            </p>
            <p>
              <span className="text-gray-500">Status: </span>
              <span
                className={
                  member.status === "active"
                    ? "font-medium text-green-700"
                    : "font-medium text-red-600"
                }
              >
                {member.status}
              </span>
            </p>
            <p>
              <span className="text-gray-500">Joined: </span>
              {formatDate(member.joinedAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Export actions */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={handleCopy}
          className="text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          {copied ? "Copied!" : "Copy as text"}
        </button>
        <button
          onClick={handleExportCsv}
          className="text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Timeline table */}
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">No events recorded for this member yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                <th className="pb-2 pr-6 whitespace-nowrap">Timestamp</th>
                <th className="pb-2 pr-6">Event</th>
                <th className="pb-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-6 font-mono text-xs text-gray-400 whitespace-nowrap">
                    {formatDate(e.timestamp)}
                  </td>
                  <td className="py-2 pr-6 font-medium text-gray-900 whitespace-nowrap">
                    {e.label}
                  </td>
                  <td className="py-2 text-gray-600">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
