"use client";

import { useState } from "react";
import MemberTimeline from "@/components/MemberTimeline";
import type { TimelineEntry, LiveStripe } from "@/components/MemberTimeline";

type MultipleResult = { id: string; name: string; email: string; plan: string; status: string };

type SingleResult = {
  member: {
    name: string; email: string; plan: string; status: string; joinedAt: string;
    isLifetime: boolean; paymentFailedAt: string | null; pendingEmail: string | null;
  };
  entries: TimelineEntry[];
  liveStripe: LiveStripe | null;
  isTestMode: boolean;
};

type SearchState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "none" }
  | { phase: "multiple"; results: MultipleResult[] }
  | { phase: "single"; data: SingleResult };

type Props = { defaultShowTest: boolean };

export default function MemberSearchSection({ defaultShowTest }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [state, setState] = useState<SearchState>({ phase: "idle" });

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = inputValue.trim();
    if (!query) return;

    setState({ phase: "loading" });

    try {
      const res = await fetch("/api/admin/member-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Search failed");
      }

      const json = await res.json() as
        | { type: "none" }
        | { type: "multiple"; results: MultipleResult[] }
        | { type: "single" } & SingleResult;

      if (json.type === "none") {
        setState({ phase: "none" });
      } else if (json.type === "multiple") {
        setState({ phase: "multiple", results: json.results });
      } else {
        setState({
          phase: "single",
          data: {
            member:     json.member,
            entries:    json.entries,
            liveStripe: json.liveStripe,
            isTestMode: json.isTestMode,
          },
        });
      }
    } catch (err) {
      setState({ phase: "none" });
      console.error("[MemberSearchSection]", err);
    }
  }

  async function handleSelectFromList(email: string) {
    setInputValue(email);
    setState({ phase: "loading" });

    try {
      const res = await fetch("/api/admin/member-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: email }),
      });
      const json = await res.json() as { type: string } & Partial<SingleResult>;
      if (json.type === "single" && json.member) {
        setState({
          phase: "single",
          data: {
            member:     json.member,
            entries:    json.entries ?? [],
            liveStripe: json.liveStripe ?? null,
            isTestMode: json.isTestMode ?? false,
          },
        });
      }
    } catch (err) {
      console.error("[MemberSearchSection] select:", err);
    }
  }

  function handleClear() {
    setInputValue("");
    setState({ phase: "idle" });
  }

  const hasResult = state.phase === "single" || state.phase === "multiple" || state.phase === "none";
  const target    = state.phase === "single" ? state.data.member : null;

  return (
    <div>
      {/* Context-aware header */}
      <div className="mb-5">
        {target ? (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Member Support</p>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{target.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{target.plan}</span>
              <span className="text-gray-300">·</span>
              <span className={
                target.status === "active"         ? "text-green-700 font-medium" :
                target.status === "payment_failed" ? "text-red-600 font-medium"   :
                "text-gray-500"
              }>
                {target.status === "payment_failed" ? "Payment failed" : target.status}
              </span>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Member Support</h1>
            <p className="text-gray-500 text-sm">
              Search by email or name to see a member&apos;s full timeline.
            </p>
          </>
        )}
      </div>

      {/* Search form — POST via fetch, no URL params */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-5">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search email or name for full member timeline..."
          autoComplete="off"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-csl-dark"
        />
        <button
          type="submit"
          disabled={state.phase === "loading"}
          className="bg-csl-dark text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-csl-mid disabled:opacity-50 transition-colors"
        >
          {state.phase === "loading" ? "Searching…" : "Search"}
        </button>
        {hasResult && (
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {/* Results */}
      {state.phase === "none" && (
        <p className="text-sm text-gray-500 mb-6">No member found for &ldquo;{inputValue}&rdquo;.</p>
      )}

      {state.phase === "multiple" && (
        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-2">
            {state.results.length} members matched — select one to view their timeline:
          </p>
          <ul className="divide-y border border-gray-200 rounded-lg overflow-hidden">
            {state.results.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => handleSelectFromList(m.email)}
                  className="w-full flex flex-wrap items-center justify-between gap-x-6 px-4 py-3 hover:bg-gray-50 text-sm text-left"
                >
                  <span className="font-medium text-gray-900">{m.name}</span>
                  <span className="text-gray-400 text-xs">{m.plan}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.phase === "single" && (
        <MemberTimeline
          member={state.data.member}
          entries={state.data.entries}
          defaultShowTest={state.data.isTestMode || defaultShowTest}
          liveStripe={state.data.liveStripe}
        />
      )}

      {/* Divider between search results and events log */}
      {hasResult && state.phase !== "none" && (
        <div className="mt-8 mb-2 border-t border-gray-100" />
      )}
    </div>
  );
}
