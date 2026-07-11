"use client";

import { useState } from "react";

type TableResult = { name: string; rows: number };

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; tables: TableResult[]; totalRows: number; timestamp: string }
  | { status: "error"; message: string };

export default function BackupButton() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function handleClick() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setState({ status: "error", message: json.error ?? "Backup failed" });
        return;
      }
      setState({
        status: "success",
        tables: json.tables,
        totalRows: json.totalRows,
        timestamp: json.timestamp,
      });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleClick}
        disabled={state.status === "loading"}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-csl-dark text-white text-sm font-medium hover:bg-csl-mid disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {state.status === "loading" ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Running backup...
          </>
        ) : (
          "Take backup now"
        )}
      </button>

      {state.status === "success" && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 space-y-1">
          <p className="font-medium">
            Backup complete — {state.totalRows.toLocaleString("en-GB")} rows exported and emailed to info@celticsupporters.net
          </p>
          <p className="text-xs text-green-700">{state.timestamp}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-green-700">
            {state.tables.map((t) => (
              <li key={t.name}>
                {t.name}: {t.rows.toLocaleString("en-GB")} rows
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">Backup failed</p>
          <p className="text-xs mt-0.5">{state.message}</p>
        </div>
      )}
    </div>
  );
}
