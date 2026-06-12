"use client";

import { useState } from "react";

export type TimelineEntry = {
  id: string;
  timestamp: string;
  type: string;
  label: string;
  detail: string;
  isTest?: boolean;
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
  defaultShowTest?: boolean;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
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
    const label = (e.isTest ? "[TEST] " : "") + e.label;
    const row = `${ts}  ${label.padEnd(32)}  ${e.detail}`.trimEnd();
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

export default function MemberTimeline({ member, entries, defaultShowTest }: Props) {
  const [copied, setCopied] = useState(false);
  const [showTest, setShowTest] = useState(defaultShowTest ?? false);

  const hasTestEvents = entries.some((e) => e.isTest);
  const visible = showTest ? entries : entries.filter((e) => !e.isTest);

  function handleCopy() {
    navigator.clipboard.writeText(toPlainText(member, visible)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleExportCsv() {
    const blob = new Blob([toCsv(visible)], { type: "text/csv" });
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

      {/* Export actions + test toggle */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
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
        {hasTestEvents && (
          <label className="ml-2 flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showTest}
              onChange={(e) => setShowTest(e.target.checked)}
              className="rounded border-gray-300 text-csl-dark focus:ring-csl-dark"
            />
            Show test events
          </label>
        )}
      </div>

      {/* Timeline table */}
      {visible.length === 0 ? (
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
              {visible.map((e) => (
                <tr
                  key={e.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${e.isTest ? "opacity-60" : ""}`}
                >
                  <td className="py-2 pr-6 font-mono text-xs text-gray-400 whitespace-nowrap">
                    {formatDate(e.timestamp)}
                  </td>
                  <td className="py-2 pr-6 font-medium text-gray-900 whitespace-nowrap">
                    {e.label}
                    {e.isTest && (
                      <span className="ml-2 text-xs font-normal bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        TEST
                      </span>
                    )}
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
