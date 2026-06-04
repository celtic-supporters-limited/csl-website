"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DocumentLibrary from "@/components/DocumentLibrary";
import type { PortalEvent } from "@/app/member-portal/PortalClient";
import type { MemberDocument } from "@/components/DocumentCard";

// ── Meetings panel ────────────────────────────────────────────────────────────

const STUB_TOOLTIP = "Coming soon. This document will be available shortly.";

function isStub(url: string | null): boolean {
  return !!url && url.includes("STUB_");
}

function LibraryLinkButton({
  href,
  label,
  outline,
}: {
  href: string | null;
  label: string;
  outline?: boolean;
}) {
  if (!href) return null;
  const stub = isStub(href);
  const base = "inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors";
  const active = outline
    ? "border border-csl-dark text-csl-dark hover:bg-csl-light"
    : "bg-csl-dark text-white hover:bg-csl-mid";
  const disabled = "bg-gray-100 text-gray-400 cursor-not-allowed";
  return (
    <a
      href={stub ? undefined : href}
      target={stub ? undefined : "_blank"}
      rel="noopener noreferrer"
      title={stub ? STUB_TOOLTIP : undefined}
      onClick={stub ? (e) => e.preventDefault() : undefined}
      className={`${base} ${stub ? disabled : active}`}
    >
      {label}
      {stub && <span className="ml-1 text-[0.65rem]">&#9679; Soon</span>}
    </a>
  );
}

function formatEventDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function MeetingsPanel({ events }: { events: PortalEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <div className="text-3xl mb-3">&#128196;</div>
        <p className="text-gray-500 text-sm">No meetings recorded yet.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {events.map((ev) => (
        <div key={ev.id} className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex flex-col gap-3">
            <div>
              <h4 className="font-bold text-gray-900">{ev.title ?? "Untitled"}</h4>
              <p className="text-xs text-gray-400 mt-0.5">{formatEventDate(ev.event_date)}</p>
            </div>
            {ev.description && (
              <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">
                {ev.description}
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              <LibraryLinkButton href={ev.minutes_url} label="Minutes" />
              <LibraryLinkButton href={ev.recording_url} label="Recording" />
              <LibraryLinkButton href={ev.slides_url} label="Slides" outline />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── LibraryClient ─────────────────────────────────────────────────────────────

type Props = {
  events: PortalEvent[];
  documents: MemberDocument[];
  initialTab: "meetings" | "documents";
};

export default function LibraryClient({ events, documents, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<"meetings" | "documents">(initialTab);
  const router = useRouter();

  function switchTab(tab: "meetings" | "documents") {
    setActiveTab(tab);
    router.replace(`/member-portal/library?tab=${tab}`, { scroll: false });
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Library</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Members meetings, recordings, and documents.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1.5 w-fit mb-6">
        {(["meetings", "documents"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => switchTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === tab
                ? "bg-csl-dark text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "meetings" && <MeetingsPanel events={events} />}
      {activeTab === "documents" && <DocumentLibrary documents={documents} />}
    </div>
  );
}
