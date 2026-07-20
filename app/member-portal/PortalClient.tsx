"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import DocumentLibrary from "@/components/DocumentLibrary";
import type { MemberDocument } from "@/components/DocumentCard";

// ── Exported types (imported by page.tsx) ────────────────────────────────────

export type Member = {
  id: string;
  email: string;
  name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  membership_tier: string | null;
  plan_name: string | null;
  amount_pence: number | null;
  status: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  fan_status: string | null;
  contact_email: boolean | null;
  contact_sms: boolean | null;
  contact_telephone: boolean | null;
  is_admin: boolean | null;
  payment_failed_at: string | null;
  pending_email: string | null;
};

export type PortalDocument = {
  id: string;
  title: string;
  description: string | null;
  document_type: string;
  published_at: string;
  file_url: string;
  is_published: boolean;
};

export type GovernanceCriterion = {
  id: number;
  tier: number;
  demand: string;
  status: string;
  commentary: string | null;
  last_reviewed: string | null;
};

export type PortalCase = {
  id: string;
  contact_name: string | null;
  email: string | null;
  case_type: string | null;
  status: string | null;
  created_at: string;
};

export type PortalPayment = {
  id: string;
  stripe_payment_intent_id: string | null;
  amount_pence: number;
  plan_name: string | null;
  paid_at: string;
  status: string;
};

export type StripeSubData = {
  status: string;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  next_amount_pence: number | null;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
};

// ── Props ─────────────────────────────────────────────────────────────────────

const VALID_TABS = new Set<Tab>([
  "dashboard", "membership", "documents", "enquiries", "profile",
]);

type Props = {
  user: { email: string; id: string };
  member: Member | null;
  cases: PortalCase[];
  payments: PortalPayment[];
  documents: MemberDocument[];
  governanceCriteria: GovernanceCriterion[];
  stripeSub: StripeSubData | null;
  activeCount: number;
  agmDate: string | null;
  sharesRepresented: string;
  proxyCount: number;
  initialTab?: string;
  emailUpdated?: boolean;
};

type Tab =
  | "dashboard"
  | "membership"
  | "documents"
  | "enquiries"
  | "profile";

// ── Utility helpers ───────────────────────────────────────────────────────────

function planDisplay(member: Member): string {
  return member.plan_name ?? tierLabel(member.membership_tier);
}

function tierLabel(tier: string | null): string {
  if (tier === "monthly") return "Monthly Member";
  if (tier === "annual") return "Annual Member";
  if (tier === "lifetime") return "Lifetime Member";
  return "No active membership";
}

function displayName(member: Member | null, email: string): string {
  if (member?.first_name && member.last_name)
    return toTitleCase(`${member.first_name} ${member.last_name}`);
  if (member?.first_name) return toTitleCase(member.first_name);
  if (member?.name) return toTitleCase(member.name);
  return email.split("@")[0];
}

function formatDate(iso: string | null | number): string {
  if (!iso) return "-";
  const d = typeof iso === "number" ? new Date(iso * 1000) : new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatPence(p: number | null): string {
  if (p == null) return "-";
  return `£${(p / 100).toFixed(2).replace(/\.00$/, "")}`;
}

function toTitleCase(s: string): string {
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

const inputCls =
  "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-csl-dark focus:border-transparent disabled:opacity-60";

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-6 ${className}`}>
      {children}
    </div>
  );
}


function StatusPill({ status }: { status: string | null }) {
  if (status === "active" || status === "trialing")
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
        &#9679; Active
      </span>
    );
  if (status === "past_due" || status === "payment_failed")
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
        &#9679; Payment Failed
      </span>
    );
  if (status === "cancelled" || status === "canceled")
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
        &#9679; Cancelled
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
      No membership
    </span>
  );
}

function CaseStatusBadge({ status }: { status: string | null }) {
  const styleMap: Record<string, string> = {
    New: "bg-blue-50 text-blue-700 border-blue-200",
    "In Progress": "bg-amber-50 text-amber-700 border-amber-200",
    Resolved: "bg-green-50 text-green-700 border-green-200",
  };
  const labelMap: Record<string, string> = {
    New: "Received — we'll be in touch shortly",
    "In Progress": "Being reviewed",
    Resolved: "Closed",
  };
  const cls = styleMap[status ?? ""] ?? "bg-gray-100 text-gray-600 border-gray-200";
  const label = labelMap[status ?? ""] ?? (status ?? "Unknown");
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}
    >
      {label}
    </span>
  );
}

// ── Billing portal hook ──────────────────────────────────────────────────────

function useBillingPortal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing-portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setLoading(false);
        setError(data.error ?? "Could not open Stripe portal.");
      }
    } catch {
      setLoading(false);
      setError("Network error. Please try again.");
    }
  }

  return { loading, error, open };
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────

const TIER_LABEL: Record<number, string> = {
  1: "Tier 1 — Immediate Actions",
  2: "Tier 2 — Medium-term Actions",
  3: "Tier 3 — Structural Changes",
};

const GOV_STATUS: Record<string, { label: string; className: string }> = {
  green: { label: "Met",     className: "bg-green-100 text-green-800" },
  amber: { label: "Partial", className: "bg-amber-100 text-amber-800" },
  red:   { label: "Not Met", className: "bg-red-100 text-red-800"    },
};

const DOC_BADGE: Record<string, string> = {
  "Meeting Minutes":    "bg-blue-100 text-blue-800",
  "Research & Papers":  "bg-purple-100 text-purple-800",
  "AGM Documents":      "bg-amber-100 text-amber-800",
  "Governance":         "bg-green-100 text-green-800",
  "Guides & Templates": "bg-gray-100 text-gray-700",
  "Recordings":         "bg-teal-100 text-teal-800",
};

function DashboardTab({
  member,
  cases,
  documents,
  governanceCriteria,
  onTabChange,
  stripeSub,
  activeCount,
  agmDate,
  sharesRepresented,
}: {
  member: Member | null;
  cases: PortalCase[];
  documents: MemberDocument[];
  governanceCriteria: GovernanceCriterion[];
  onTabChange: (tab: Tab) => void;
  stripeSub: StripeSubData | null;
  activeCount: number;
  agmDate: string | null;
  sharesRepresented: string;
}) {
  const billingPortal = useBillingPortal();

  if (!member) {
    return (
      <Card className="shadow-sm">
        <div className="text-center py-8">
          <div className="text-4xl mb-3">&#9752;</div>
          <h3 className="font-bold text-gray-900 mb-2">No active membership found</h3>
          <p className="text-gray-500 text-sm mb-5">
            Your email is verified but no membership record was found. If you
            recently joined, it may take a few minutes to appear.
          </p>
          <Link
            href="/membership"
            className="inline-block bg-csl-dark text-white font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-csl-mid transition-colors"
          >
            Join CSL
          </Link>
        </div>
      </Card>
    );
  }

  const isLifetime = member.membership_tier === "Lifetime";
  const showNextRenewal =
    !isLifetime &&
    member.status === "active" &&
    stripeSub?.current_period_end != null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const agmDateObj = agmDate ? new Date(agmDate) : null;
  if (agmDateObj) agmDateObj.setHours(0, 0, 0, 0);
  const daysToGo = agmDateObj
    ? Math.round((agmDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const latestTracing = cases.find((c) => c.case_type === "Share Tracing") ?? null;

  const metCount     = governanceCriteria.filter((c) => c.status === "green").length;
  const partialCount = governanceCriteria.filter((c) => c.status === "amber").length;
  const notMetCount  = governanceCriteria.filter((c) => c.status === "red").length;
  const lastReviewed = governanceCriteria
    .map((c) => c.last_reviewed)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  const sharesNum = parseInt(sharesRepresented, 10) || 0;

  return (
    <div className="space-y-6">

      {/* Payment failed banner */}
      {member.status === "payment_failed" && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 shadow-sm">
          <div className="flex gap-3 items-start">
            <span className="flex-shrink-0 text-red-500 text-xl leading-none mt-0.5">&#9888;</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800 mb-2">
                Your last payment failed. Please update your payment details to keep your membership active.
              </p>
              {billingPortal.error && (
                <p className="text-xs text-red-700 mb-2">{billingPortal.error}</p>
              )}
              <button
                onClick={billingPortal.open}
                disabled={billingPortal.loading}
                className="inline-flex items-center px-4 py-2.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60 min-h-[44px]"
              >
                {billingPortal.loading ? "Opening..." : "Update payment method"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AGM banner — breaking news treatment, only rendered when date is set */}
      {agmDate && agmDateObj && (
        <div className="rounded-xl overflow-hidden shadow-md">
          <div className="bg-csl-gold px-5 py-2 flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-csl-dark animate-pulse flex-shrink-0" />
            <span className="text-[0.6rem] font-black uppercase tracking-[0.15em] text-csl-dark">
              {daysToGo != null && daysToGo >= 0 && daysToGo <= 60
                ? daysToGo === 0
                  ? "Celtic FC AGM — Today"
                  : `Celtic FC AGM — ${daysToGo} days to go`
                : "Celtic FC AGM"}
            </span>
          </div>
          <div className="bg-csl-dark text-white px-6 py-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold leading-tight">{formatDate(agmDate)}</p>
              {daysToGo != null && daysToGo > 0 && (
                <p className="text-white/70 text-sm mt-1.5 max-w-xs">
                  Assign your proxy vote before the deadline to ensure your voice is counted.
                </p>
              )}
              {daysToGo === 0 && (
                <p className="text-csl-gold font-bold text-sm mt-1.5">
                  The AGM is today — it&apos;s not too late to act.
                </p>
              )}
              {daysToGo != null && daysToGo < 0 && (
                <p className="text-white/60 text-sm mt-1.5">The AGM has taken place.</p>
              )}
            </div>
            <Link
              href="/proxy"
              className="flex-shrink-0 inline-flex items-center px-6 py-3 rounded-lg bg-csl-gold text-csl-dark font-bold text-sm hover:brightness-110 transition-all min-h-[44px]"
            >
              Assign your proxy vote &#8594;
            </Link>
          </div>
        </div>
      )}

      {/* Membership status bar — status · plan · renewal · one action */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3.5">
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <StatusPill status={member.status} />
          <span className="font-semibold text-sm text-gray-900">{planDisplay(member)}</span>
          {showNextRenewal && (
            <span className="text-sm text-gray-400 hidden sm:inline">
              Renews {formatDate(stripeSub!.current_period_end)}
            </span>
          )}
          {isLifetime && (
            <span className="text-sm text-gray-400">Lifetime membership</span>
          )}
          {!isLifetime && (
            <button
              onClick={billingPortal.open}
              disabled={billingPortal.loading}
              className="ml-auto text-sm font-semibold text-csl-dark hover:underline disabled:opacity-60 min-h-[44px]"
            >
              {billingPortal.loading ? "Opening..." : "Manage"}
            </button>
          )}
        </div>
        {billingPortal.error && member.status !== "payment_failed" && (
          <p className="text-xs text-red-600 mt-1.5">{billingPortal.error}</p>
        )}
      </div>

      {/* Three pillar action cards — hero of the dashboard */}
      <div>
        <p className="text-[0.65rem] font-black uppercase tracking-[0.15em] text-gray-400 mb-3">
          Your Actions
        </p>

        {/* Aggregate + Accumulate — 2-col on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">

          {/* Aggregate */}
          <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-csl-dark shadow-sm p-4 sm:p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-csl-light flex items-center justify-center text-csl-dark text-sm sm:text-base leading-none">
                &#128717;
              </div>
              <p className="text-[0.6rem] font-black uppercase tracking-[0.18em] text-csl-dark leading-none">
                Aggregate
              </p>
            </div>
            <div className="hidden sm:grid grid-cols-2 gap-2 mb-3">
              <div className="bg-csl-light rounded-lg px-3 py-2.5 text-center">
                <p className="text-xl font-black leading-none text-csl-dark">{activeCount.toLocaleString()}</p>
                <p className="text-[0.6rem] font-bold uppercase tracking-wider text-csl-dark/60 mt-1">Members</p>
              </div>
              <div className="bg-csl-light rounded-lg px-3 py-2.5 text-center">
                <p className="text-xl font-black leading-none text-csl-dark">{sharesNum > 0 ? sharesNum.toLocaleString() : "-"}</p>
                <p className="text-[0.6rem] font-bold uppercase tracking-wider text-csl-dark/60 mt-1">Shares Held</p>
              </div>
            </div>
            <h4 className="hidden sm:block font-bold text-gray-900 text-sm mb-1 leading-tight">
              Assign Your Proxy Vote
            </h4>
            <p className="hidden sm:block text-xs text-gray-500 flex-1 mb-3 leading-relaxed">
              Authorise CSL to vote on your behalf at Celtic FC general meetings. Every proxy
              strengthens our mandate at the boardroom table.
            </p>
            <Link
              href="/proxy"
              className="mt-auto inline-flex items-center justify-center px-3 py-2.5 rounded-lg text-xs font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors min-h-[44px]"
            >
              Assign proxy vote &#8594;
            </Link>
          </div>

          {/* Accumulate */}
          <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-csl-mid shadow-sm p-4 sm:p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-csl-light flex items-center justify-center text-csl-dark text-sm sm:text-base leading-none">
                &#128200;
              </div>
              <p className="text-[0.6rem] font-black uppercase tracking-[0.18em] text-csl-mid leading-none">
                Accumulate
              </p>
            </div>
            <h4 className="hidden sm:block font-bold text-gray-900 text-sm mb-1 leading-tight">
              Trace Your Celtic Shares
            </h4>
            <p className="hidden sm:block text-xs text-gray-500 flex-1 mb-3 leading-relaxed">
              Lost your Celtic share certificate? Our team will guide you through reconnecting with your shareholding. Register your interest and we&apos;ll be in touch.
            </p>
            {latestTracing && (
              <div className="hidden sm:block mb-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-400 mb-1.5">
                  Submitted {formatDate(latestTracing.created_at)}
                </p>
                <CaseStatusBadge status={latestTracing.status} />
              </div>
            )}
            <Link
              href="/share-tracing"
              className="mt-auto inline-flex items-center justify-center px-3 py-2.5 rounded-lg text-xs font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors min-h-[44px]"
            >
              Trace My Shares &#8594;
            </Link>
          </div>

        </div>

        {/* Activate — full-width governance scorecard */}
        <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-csl-gold shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-csl-light flex items-center justify-center text-csl-dark text-sm sm:text-base leading-none">
                &#128202;
              </div>
              <p className="text-[0.6rem] font-black uppercase tracking-[0.18em] text-csl-dark leading-none">
                Activate
              </p>
            </div>
            <h4 className="font-bold text-gray-900 text-sm mb-3 leading-tight">
              Celtic FC Accountability Score
            </h4>
            {governanceCriteria.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 text-green-800 text-sm font-semibold">
                  <span className="font-bold tabular-nums">{metCount}</span> Met
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-sm font-semibold">
                  <span className="font-bold tabular-nums">{partialCount}</span> Partial
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 text-red-800 text-sm font-semibold">
                  <span className="font-bold tabular-nums">{notMetCount}</span> Not Met
                </span>
                <span className="text-gray-400 text-sm">out of 12 demands</span>
                {lastReviewed && (
                  <span className="text-gray-400 text-xs ml-auto">
                    Last reviewed: {formatDate(lastReviewed)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Criteria by tier */}
          {governanceCriteria.length > 0 && (
            <div className="p-4 sm:p-5 space-y-5">
              {([1, 2, 3] as const).map((tier) => {
                const tierCriteria = governanceCriteria.filter((c) => c.tier === tier);
                if (tierCriteria.length === 0) return null;
                return (
                  <div key={tier}>
                    <p className="text-[0.7rem] font-bold uppercase tracking-wider text-csl-dark mb-2.5 pb-2 border-b border-gray-200">
                      {TIER_LABEL[tier]}
                    </p>
                    <div className="space-y-2.5">
                      {tierCriteria.map((criterion) => {
                        const s = GOV_STATUS[criterion.status] ?? { label: criterion.status, className: "bg-gray-100 text-gray-600" };
                        return (
                          <div key={criterion.id} className="flex items-start gap-2.5">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-csl-dark text-white text-[0.6rem] font-bold flex items-center justify-center mt-0.5">
                              {criterion.id}
                            </span>
                            <p className="text-xs text-gray-700 flex-1 leading-relaxed">{criterion.demand}</p>
                            <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${s.className}`}>
                              {s.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CTA */}
          <div className="px-4 sm:px-5 pb-4 sm:pb-5">
            <Link
              href="/governance"
              className="inline-flex items-center justify-center w-full px-3 py-2.5 rounded-lg text-xs font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors min-h-[44px]"
            >
              View full scorecard &#8594;
            </Link>
          </div>
        </div>
      </div>


      {/* Latest Documents */}
      {documents.length > 0 && (
        <Card className="shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Latest Documents</h3>
            <button
              onClick={() => onTabChange("documents")}
              className="text-csl-dark text-xs font-semibold hover:underline min-h-[44px] flex items-center"
            >
              View all
            </button>
          </div>
          <div className="space-y-0">
            {documents.slice(0, 3).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${DOC_BADGE[doc.category] ?? "bg-gray-100 text-gray-700"}`}>
                      {doc.category}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(doc.published_at)}</p>
                </div>
                <a
                  href={doc.drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-xs font-semibold text-csl-dark hover:text-csl-mid min-h-[44px] flex items-center"
                >
                  View
                </a>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── My Membership tab — redesigned ───────────────────────────────────────────
// Single-page layout: compact summary strip + accordion actions + payment history

type ChangePlanState = "idle" | "confirming" | "submitting" | "success" | "error";
type AnnualSwitchState = "idle" | "confirming" | "submitting" | "error";
type AccordionPanel = "change" | "annual" | "manage" | null;

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`w-4 h-4 text-gray-400 transition-transform duration-150 flex-shrink-0 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MyMembershipTab({
  member,
  stripeSub,
  payments,
}: {
  member: Member | null;
  stripeSub: StripeSubData | null;
  payments: PortalPayment[];
}) {
  const router = useRouter();
  const billingPortal = useBillingPortal();

  // Accordion
  const [openPanel, setOpenPanel] = useState<AccordionPanel>(null);

  // Change monthly amount
  const [planState, setPlanState] = useState<ChangePlanState>("idle");
  const [selected, setSelected] = useState<"standard" | "accelerator" | "custom">("standard");
  const [customAmt, setCustomAmt] = useState("");
  const [planError, setPlanError] = useState("");
  const [newPlanName, setNewPlanName] = useState("");

  // Switch to annual
  const [switchState, setSwitchState] = useState<AnnualSwitchState>("idle");
  const [annualAmt, setAnnualAmt] = useState("");
  const [annualError, setAnnualError] = useState("");

  function togglePanel(p: AccordionPanel) {
    setOpenPanel((prev) => {
      if (prev === p) {
        if (p === "change") { setPlanState("idle"); setPlanError(""); }
        if (p === "annual") { setSwitchState("idle"); setAnnualError(""); }
        return null;
      }
      return p;
    });
  }

  // ── Change plan logic ──────────────────────────────────────────────────────
  const currentAmountPence = member?.amount_pence ?? 0;

  function targetUnitAmount(): number {
    if (selected === "standard")    return 1000;
    if (selected === "accelerator") return 2500;
    const n = parseInt(customAmt, 10);
    return isNaN(n) ? 0 : n * 100;
  }

  function validatePlan(): string | null {
    const ua = targetUnitAmount();
    if (ua === currentAmountPence) return "You are already on this plan.";
    if (selected === "custom") {
      const n = parseInt(customAmt, 10);
      if (!n || n < 30) return "Custom monthly amount must be at least £30.";
      if (n % 5 !== 0)  return "Custom monthly amount must be in £5 increments.";
    }
    return null;
  }

  function handlePlanPreview() {
    const err = validatePlan();
    if (err) { setPlanError(err); setPlanState("error"); return; }
    setPlanError("");
    setPlanState("confirming");
  }

  async function handlePlanConfirm() {
    setPlanState("submitting");
    setPlanError("");
    const payload =
      selected === "custom"
        ? { plan: "custom_monthly", amount: parseInt(customAmt, 10) }
        : { plan: selected };
    try {
      const res = await fetch("/api/subscription/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { ok?: boolean; error?: string; newPlanName?: string };
      if (!res.ok) { setPlanError(data.error ?? "Something went wrong. Please try again."); setPlanState("error"); return; }
      setNewPlanName(data.newPlanName ?? "");
      setPlanState("success");
      router.refresh();
    } catch {
      setPlanError("Network error. Please check your connection and try again.");
      setPlanState("error");
    }
  }

  const targetLabel =
    selected === "standard"    ? "£10/month (Standard)"
    : selected === "accelerator" ? "£25/month (Accelerator)"
    : customAmt ? `£${customAmt}/month` : "custom amount";

  // ── Annual switch logic ────────────────────────────────────────────────────
  const currentMonthly = Math.round(currentAmountPence / 100);
  const annualEquivalent = currentMonthly * 12;
  const parsedAnnualAmt = parseInt(annualAmt, 10);
  const annualSaving = !isNaN(parsedAnnualAmt) && parsedAnnualAmt >= 300 && parsedAnnualAmt % 10 === 0
    ? annualEquivalent - parsedAnnualAmt
    : null;

  function validateAnnual(): string | null {
    const n = parseInt(annualAmt, 10);
    if (!n || n < 300) return "Annual amount must be at least £300.";
    if (n % 10 !== 0)  return "Annual amount must be in £10 increments.";
    return null;
  }

  function handleAnnualPreview() {
    const err = validateAnnual();
    if (err) { setAnnualError(err); setSwitchState("error"); return; }
    setAnnualError("");
    setSwitchState("confirming");
  }

  async function handleAnnualConfirm() {
    setSwitchState("submitting");
    setAnnualError("");
    try {
      const res = await fetch("/api/subscription/switch-to-annual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseInt(annualAmt, 10) }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) { setAnnualError(data.error ?? "Something went wrong. Please try again."); setSwitchState("error"); return; }
      window.location.href = data.url;
    } catch {
      setAnnualError("Network error. Please check your connection and try again.");
      setSwitchState("error");
    }
  }

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!member) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">No membership record found.</p>
          <Link href="/membership" className="mt-4 inline-block bg-csl-dark text-white font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-csl-mid transition-colors">
            Join CSL
          </Link>
        </div>
      </Card>
    );
  }

  const isLifetime = member.membership_tier === "Lifetime";
  const isMonthlyActive = !isLifetime && member.membership_tier === "monthly" && member.status === "active";
  const statusToShow = stripeSub?.status ?? member.status;
  const cardExpiry =
    stripeSub?.card_exp_month != null && stripeSub?.card_exp_year != null
      ? `${String(stripeSub.card_exp_month).padStart(2, "0")}/${String(stripeSub.card_exp_year).slice(-2)}`
      : null;

  // Shared button classes
  const btnPrimary = "inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors disabled:opacity-60";
  const btnGhost   = "inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50";

  return (
    <div className="space-y-3">

      {/* ── Summary strip ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 border-l-[3px] border-l-csl-dark rounded-r-xl px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusPill status={statusToShow} />
            <span className="text-sm font-semibold text-gray-900">{planDisplay(member)}</span>
            <span className="text-xs text-gray-400">Member since {formatDate(member.created_at)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
            {!isLifetime && stripeSub && (
              <span>
                Next{" "}
                <span className="font-semibold text-gray-800">{formatPence(stripeSub.next_amount_pence)}</span>
                {" on "}
                <span className="font-semibold text-gray-800">{formatDate(stripeSub.current_period_end)}</span>
              </span>
            )}
            {!isLifetime && stripeSub?.card_brand && stripeSub.card_last4 && (
              <span className="flex items-center gap-1.5">
                <span className="text-[0.6rem] font-bold uppercase bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-gray-500">
                  {stripeSub.card_brand.slice(0, 4)}
                </span>
                <span>&#8226;&#8226;&#8226;&#8226;&nbsp;{stripeSub.card_last4}</span>
                {cardExpiry && <span className="text-gray-400">· {cardExpiry}</span>}
              </span>
            )}
            {isLifetime && <span className="text-gray-400">No renewal required</span>}
          </div>
        </div>

        {/* Cancellation warning inline */}
        {!isLifetime && stripeSub?.cancel_at_period_end && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            Your subscription will cancel on {formatDate(stripeSub.current_period_end)}.
          </p>
        )}
      </div>

      {/* ── Two-column body ─────────────────────────────────────────────────── */}
      <div className={`grid gap-3 items-start ${isMonthlyActive ? "md:grid-cols-[3fr_2fr]" : ""}`}>

        {/* ── Subscription actions accordion (monthly active only) ─────────── */}
        {isMonthlyActive && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100">
              <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-gray-400">Subscription</span>
            </div>

            {/* Row 1: Change monthly amount */}
            <div className={`border-b border-gray-100 border-l-4 ${openPanel === "change" ? "border-l-csl-dark" : "border-l-transparent"}`}>
              <button
                className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 transition-colors"
                onClick={() => togglePanel("change")}
                aria-expanded={openPanel === "change"}
              >
                <span className="w-8 h-8 rounded-lg bg-csl-light flex items-center justify-center flex-shrink-0 text-csl-dark" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
                    <path d="M5 7h10M5 7l3-3M5 7l3 3M15 13H5m10 0l-3-3m3 3l-3 3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Change monthly amount</p>
                  <p className="text-xs text-gray-500 mt-0.5">Standard, Accelerator, or a custom amount</p>
                </div>
                <ChevronIcon open={openPanel === "change"} />
              </button>

              {openPanel === "change" && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {planState === "success" ? (
                    <div className="flex items-start gap-2 pt-3">
                      <span className="text-green-600 font-bold leading-none mt-0.5">&#10003;</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Plan updated to {newPlanName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">New amount applies from your next renewal date.</p>
                        <button
                          onClick={() => { setPlanState("idle"); setPlanError(""); setSelected("standard"); setCustomAmt(""); }}
                          className="mt-2 text-xs font-semibold text-csl-dark hover:underline"
                        >
                          Change again
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {planState !== "confirming" && (
                        <fieldset className="space-y-2 mt-3">
                          {(
                            [
                              { value: "standard",    label: "Standard",    desc: "£10/month", pence: 1000 },
                              { value: "accelerator", label: "Accelerator", desc: "£25/month", pence: 2500 },
                              { value: "custom",      label: "Custom",      desc: "£30+/month · £5 increments", pence: null },
                            ] as const
                          ).map((opt) => {
                            const isCurrent = opt.pence !== null && opt.pence === currentAmountPence;
                            return (
                              <label
                                key={opt.value}
                                className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                                  selected === opt.value ? "border-csl-dark bg-csl-light" : "border-gray-200 hover:border-gray-300"
                                } ${isCurrent ? "opacity-50 cursor-not-allowed" : ""}`}
                              >
                                <input
                                  type="radio"
                                  name="plan"
                                  value={opt.value}
                                  checked={selected === opt.value}
                                  disabled={isCurrent}
                                  onChange={() => { setSelected(opt.value); setPlanError(""); setPlanState("idle"); }}
                                  className="w-3.5 h-3.5 accent-csl-dark shrink-0"
                                />
                                <span className="text-sm font-medium text-gray-900 flex-1">{opt.label}</span>
                                {isCurrent && (
                                  <span className="text-[0.65rem] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Current</span>
                                )}
                                <span className="text-xs text-gray-400">{opt.desc}</span>
                              </label>
                            );
                          })}
                        </fieldset>
                      )}

                      {planState !== "confirming" && selected === "custom" && (
                        <div className="flex items-center gap-2 mt-2.5">
                          <span className="text-sm font-semibold text-gray-500">£</span>
                          <input
                            type="number"
                            min="30"
                            step="5"
                            value={customAmt}
                            onChange={(e) => { setCustomAmt(e.target.value); setPlanError(""); setPlanState("idle"); }}
                            placeholder="30"
                            className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10"
                          />
                          <span className="text-xs text-gray-400">per month</span>
                        </div>
                      )}

                      {planState === "confirming" && (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                          <p className="font-semibold mb-0.5">Confirm plan change</p>
                          <p>Your plan will change to <strong>{targetLabel}</strong>. New amount applies from your next renewal - no change to your current billing period.</p>
                        </div>
                      )}

                      {planError && (
                        <p className="mt-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{planError}</p>
                      )}

                      <div className="flex gap-2 mt-3">
                        {planState === "confirming" || planState === "submitting" ? (
                          <>
                            <button onClick={handlePlanConfirm} disabled={planState === "submitting"} className={btnPrimary}>
                              {planState === "submitting" ? "Updating..." : "Confirm change"}
                            </button>
                            <button onClick={() => { setPlanState("idle"); setPlanError(""); }} disabled={planState === "submitting"} className={btnGhost}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button onClick={handlePlanPreview} className={btnPrimary}>
                            Preview change
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Row 2: Switch to annual */}
            <div className={`border-b border-gray-100 border-l-4 ${openPanel === "annual" ? "border-l-csl-dark" : "border-l-transparent"}`}>
              <button
                className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 transition-colors"
                onClick={() => togglePanel("annual")}
                aria-expanded={openPanel === "annual"}
              >
                <span className="w-8 h-8 rounded-lg bg-csl-light flex items-center justify-center flex-shrink-0 text-csl-dark" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
                    <rect x="3" y="5" width="14" height="12" rx="2"/>
                    <path d="M7 3v4M13 3v4M3 9h14" strokeLinecap="round"/>
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Switch to annual billing</p>
                  <p className="text-xs text-gray-500 mt-0.5">Pay yearly from your next renewal · min £300</p>
                </div>
                <ChevronIcon open={openPanel === "annual"} />
              </button>

              {openPanel === "annual" && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {switchState !== "confirming" && (
                    <>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-sm font-semibold text-gray-500">£</span>
                        <input
                          type="number"
                          min="300"
                          step="10"
                          value={annualAmt}
                          onChange={(e) => { setAnnualAmt(e.target.value); setAnnualError(""); setSwitchState("idle"); }}
                          placeholder="300"
                          className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10"
                        />
                        <span className="text-xs text-gray-400">per year</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Minimum £300 · in £10 increments</p>
                      {annualSaving !== null && annualSaving > 0 && (
                        <p className="text-xs text-green-700 font-semibold mt-1">Saving £{annualSaving} vs your current monthly rate</p>
                      )}
                      {annualSaving !== null && annualSaving <= 0 && (
                        <p className="text-xs text-amber-700 mt-1">Equivalent to £{Math.round(parsedAnnualAmt / 12)} per month</p>
                      )}
                    </>
                  )}

                  {switchState === "confirming" && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      <p className="font-semibold mb-0.5">Confirm switch to annual</p>
                      <p>You will be taken to Stripe to pay <strong>£{annualAmt}/year</strong>. Your annual subscription starts at the end of your current monthly period. Your monthly subscription cancels automatically once confirmed.</p>
                    </div>
                  )}

                  {annualError && (
                    <p className="mt-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{annualError}</p>
                  )}

                  <div className="flex gap-2 mt-3">
                    {switchState === "confirming" || switchState === "submitting" ? (
                      <>
                        <button onClick={handleAnnualConfirm} disabled={switchState !== "confirming"} className={btnPrimary}>
                          {switchState === "submitting" ? "Redirecting..." : "Confirm and pay annually"}
                        </button>
                        <button onClick={() => { setSwitchState("idle"); setAnnualError(""); }} disabled={switchState !== "confirming"} className={btnGhost}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button onClick={handleAnnualPreview} disabled={!annualAmt} className={btnPrimary}>
                        Preview switch
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Row 3: Update card or cancel */}
            <div className={`border-l-4 ${openPanel === "manage" ? "border-l-csl-dark" : "border-l-transparent"}`}>
              <button
                className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 transition-colors"
                onClick={() => togglePanel("manage")}
                aria-expanded={openPanel === "manage"}
              >
                <span className="w-8 h-8 rounded-lg bg-csl-light flex items-center justify-center flex-shrink-0 text-csl-dark" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
                    <rect x="2" y="5" width="16" height="12" rx="2"/>
                    <path d="M2 9h16" strokeLinecap="round"/>
                    <path d="M6 13h2" strokeLinecap="round"/>
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Update card or cancel</p>
                  <p className="text-xs text-gray-500 mt-0.5">Manage payment method or end your subscription</p>
                </div>
                <ChevronIcon open={openPanel === "manage"} />
              </button>

              {openPanel === "manage" && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {billingPortal.error && (
                    <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{billingPortal.error}</p>
                  )}
                  <button onClick={billingPortal.open} disabled={billingPortal.loading} className={`${btnPrimary} mt-3`}>
                    {billingPortal.loading ? "Opening..." : "Open Stripe portal →"}
                  </button>
                  <p className="text-xs text-gray-400 mt-1.5">Update your card or cancel your subscription via Stripe&apos;s secure portal.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Payment history ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-gray-400">Payments</span>
          </div>
          {payments.length === 0 ? (
            <div className="text-center py-8 px-4">
              <p className="text-gray-400 text-sm">No payments recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontVariantNumeric: "tabular-nums" }}>
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-4 text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Date</th>
                    <th className="text-left py-2 px-2 text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wider">Plan</th>
                    <th className="text-right py-2 px-4 text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2.5 px-4 text-xs text-gray-600 whitespace-nowrap">{formatDate(p.paid_at)}</td>
                      <td className="py-2.5 px-2 text-xs text-gray-500">{p.plan_name ?? "-"}</td>
                      <td className="py-2.5 px-4 text-xs font-semibold text-gray-900 text-right whitespace-nowrap">{formatPence(p.amount_pence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Billing portal for non-monthly active members ───────────────── */}
        {!isMonthlyActive && !isLifetime && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100">
              <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-gray-400">Subscription</span>
            </div>
            <div className="p-4">
              {billingPortal.error && (
                <p className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{billingPortal.error}</p>
              )}
              <button onClick={billingPortal.open} disabled={billingPortal.loading} className={btnPrimary}>
                {billingPortal.loading ? "Opening..." : "Manage subscription"}
              </button>
              <p className="text-xs text-gray-400 mt-1.5">Update your card or cancel via Stripe.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Enquiries tab ─────────────────────────────────────────────────────────────

function EnquiriesTab({ cases }: { cases: PortalCase[] }) {
  return (
    <Card>
      <h3 className="font-bold text-gray-900 mb-1">My Enquiries</h3>
      <p className="text-sm text-gray-400 mb-5">
        Track the progress of any share tracing or proxy assignment enquiries you
        have submitted.
      </p>

      {cases.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center">
          <div className="text-3xl mb-3">&#128236;</div>
          <p className="font-semibold text-gray-900 mb-1">No active enquiries</p>
          <p className="text-sm text-gray-400 mb-5">
            Submit a share tracing or proxy enquiry to see it tracked here.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/share-tracing"
              className="inline-block bg-csl-dark text-white font-semibold px-5 py-2 rounded-lg text-sm hover:bg-csl-mid transition-colors"
            >
              Trace my shares
            </Link>
            <Link
              href="/proxy"
              className="inline-block border border-csl-dark text-csl-dark font-semibold px-5 py-2 rounded-lg text-sm hover:bg-csl-light transition-colors"
            >
              Assign proxy
            </Link>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {cases.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 py-4"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">{c.case_type}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Submitted {formatDate(c.created_at)}
                </p>
              </div>
              <CaseStatusBadge status={c.status} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Edit Profile tab ──────────────────────────────────────────────────────────

type PhoneCountry = { iso: string; name: string; dial: string };

// Shown first in the selector — ordered by expected frequency for CSL members.
const PHONE_PRIORITY: PhoneCountry[] = [
  { iso: "GB", name: "United Kingdom",  dial: "+44"  },
  { iso: "IE", name: "Ireland",          dial: "+353" },
  { iso: "US", name: "United States",   dial: "+1"   },
  { iso: "CA", name: "Canada",          dial: "+1"   },
  { iso: "AU", name: "Australia",       dial: "+61"  },
  { iso: "NZ", name: "New Zealand",     dial: "+64"  },
  { iso: "ZA", name: "South Africa",    dial: "+27"  },
];

// Full alphabetical list (includes the priority countries for searchability).
const PHONE_ALL: PhoneCountry[] = [
  { iso: "AR", name: "Argentina",             dial: "+54"  },
  { iso: "AU", name: "Australia",             dial: "+61"  },
  { iso: "AT", name: "Austria",              dial: "+43"  },
  { iso: "BE", name: "Belgium",              dial: "+32"  },
  { iso: "BR", name: "Brazil",               dial: "+55"  },
  { iso: "CA", name: "Canada",               dial: "+1"   },
  { iso: "CN", name: "China",                dial: "+86"  },
  { iso: "HR", name: "Croatia",              dial: "+385" },
  { iso: "CY", name: "Cyprus",               dial: "+357" },
  { iso: "CZ", name: "Czech Republic",       dial: "+420" },
  { iso: "DK", name: "Denmark",              dial: "+45"  },
  { iso: "EG", name: "Egypt",                dial: "+20"  },
  { iso: "FI", name: "Finland",              dial: "+358" },
  { iso: "FR", name: "France",               dial: "+33"  },
  { iso: "DE", name: "Germany",              dial: "+49"  },
  { iso: "GH", name: "Ghana",                dial: "+233" },
  { iso: "GR", name: "Greece",               dial: "+30"  },
  { iso: "HK", name: "Hong Kong",            dial: "+852" },
  { iso: "HU", name: "Hungary",              dial: "+36"  },
  { iso: "IN", name: "India",                dial: "+91"  },
  { iso: "ID", name: "Indonesia",            dial: "+62"  },
  { iso: "IE", name: "Ireland",              dial: "+353" },
  { iso: "IL", name: "Israel",               dial: "+972" },
  { iso: "IT", name: "Italy",                dial: "+39"  },
  { iso: "JP", name: "Japan",                dial: "+81"  },
  { iso: "KE", name: "Kenya",                dial: "+254" },
  { iso: "MY", name: "Malaysia",             dial: "+60"  },
  { iso: "MX", name: "Mexico",               dial: "+52"  },
  { iso: "MA", name: "Morocco",              dial: "+212" },
  { iso: "NL", name: "Netherlands",          dial: "+31"  },
  { iso: "NZ", name: "New Zealand",          dial: "+64"  },
  { iso: "NG", name: "Nigeria",              dial: "+234" },
  { iso: "NO", name: "Norway",               dial: "+47"  },
  { iso: "PK", name: "Pakistan",             dial: "+92"  },
  { iso: "PH", name: "Philippines",          dial: "+63"  },
  { iso: "PL", name: "Poland",               dial: "+48"  },
  { iso: "PT", name: "Portugal",             dial: "+351" },
  { iso: "RO", name: "Romania",              dial: "+40"  },
  { iso: "RU", name: "Russia",               dial: "+7"   },
  { iso: "SA", name: "Saudi Arabia",         dial: "+966" },
  { iso: "SG", name: "Singapore",            dial: "+65"  },
  { iso: "SK", name: "Slovakia",             dial: "+421" },
  { iso: "ZA", name: "South Africa",         dial: "+27"  },
  { iso: "KR", name: "South Korea",          dial: "+82"  },
  { iso: "ES", name: "Spain",                dial: "+34"  },
  { iso: "SE", name: "Sweden",               dial: "+46"  },
  { iso: "CH", name: "Switzerland",          dial: "+41"  },
  { iso: "TW", name: "Taiwan",               dial: "+886" },
  { iso: "TH", name: "Thailand",             dial: "+66"  },
  { iso: "TR", name: "Turkey",               dial: "+90"  },
  { iso: "AE", name: "United Arab Emirates", dial: "+971" },
  { iso: "GB", name: "United Kingdom",       dial: "+44"  },
  { iso: "US", name: "United States",        dial: "+1"   },
  { iso: "VN", name: "Vietnam",              dial: "+84"  },
  { iso: "ZW", name: "Zimbabwe",             dial: "+263" },
];

// Parse a stored E.164-ish number back into { iso, localNumber }.
// Searches longer dial codes first to avoid +1 matching +353, +971, etc.
// Prefers PHONE_PRIORITY order when two codes have the same length (US before CA for +1).
function parseStoredPhone(stored: string | null): { iso: string; local: string } {
  const s = (stored ?? "").trim();
  if (!s.startsWith("+")) return { iso: "GB", local: s };

  const priorityIsos = PHONE_PRIORITY.map((c) => c.iso);
  const sorted = [...PHONE_ALL].sort((a, b) => {
    if (b.dial.length !== a.dial.length) return b.dial.length - a.dial.length;
    const pa = priorityIsos.indexOf(a.iso);
    const pb = priorityIsos.indexOf(b.iso);
    if (pa !== -1 && pb !== -1) return pa - pb;
    if (pa !== -1) return -1;
    if (pb !== -1) return 1;
    return 0;
  });

  const match = sorted.find((c) => s.startsWith(c.dial));
  if (!match) return { iso: "GB", local: s };
  return { iso: match.iso, local: s.slice(match.dial.length).trim() };
}

const FAN_STATUS_OPTIONS = [
  "Season Ticket",
  "Away Member",
  "Home Only",
  "Supporter (no match)",
] as const;

function EditProfileTab({
  member,
  userEmail,
  emailUpdated,
}: {
  member: Member | null;
  userEmail: string;
  emailUpdated?: boolean;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(member?.first_name ?? "");
  const [lastName, setLastName] = useState(member?.last_name ?? "");
  const parsedPhone = parseStoredPhone(member?.phone ?? "");
  const [countryIso, setCountryIso] = useState(parsedPhone.iso);
  const [localPhone, setLocalPhone] = useState(parsedPhone.local);
  const [fanStatus, setFanStatus] = useState(member?.fan_status ?? "");
  const [contactEmail, setContactEmail] = useState(member?.contact_email ?? true);
  const [contactSms, setContactSms] = useState(member?.contact_sms ?? false);
  const [contactTelephone, setContactTelephone] = useState(member?.contact_telephone ?? false);
  const [newEmail, setNewEmail] = useState(userEmail);
  const [emailPending, setEmailPending] = useState<string | null>(null);
  const [emailSuccessBanner, setEmailSuccessBanner] = useState(emailUpdated ?? false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [cancellingPending, setCancellingPending] = useState(false);
  const [cancelError, setCancelError] = useState(false);

  // ── Password change state ────────────────────────────────────────────────
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving]   = useState(false);
  const [pwdError, setPwdError]     = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);

  useEffect(() => {
    if (emailSuccessBanner) {
      const t = setTimeout(() => setEmailSuccessBanner(false), 5000);
      return () => clearTimeout(t);
    }
  }, [emailSuccessBanner]);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess(false);

    if (newPwd.length < 8) {
      setPwdError("New password must be at least 8 characters.");
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError("Passwords do not match.");
      return;
    }

    setPwdSaving(true);
    const supabase = createBrowserSupabase();

    // If a current password was supplied, verify it before updating.
    // Members who signed in via a magic link and have never set a password
    // should leave this field blank.
    if (currentPwd) {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPwd,
      });
      if (verifyErr) {
        setPwdError("Current password is incorrect.");
        setPwdSaving(false);
        return;
      }
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password: newPwd });
    if (updateErr) {
      setPwdError(updateErr.message);
      setPwdSaving(false);
      return;
    }

    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
    setPwdSaving(false);
    setPwdSuccess(true);
    setTimeout(() => setPwdSuccess(false), 5000);

    // Pass the new access token in the Authorization header — updateUser issues
    // a fresh token that the SSR cookie does not yet reflect.
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch("/api/auth/password-changed", {
        method: "POST",
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      }).catch((err) =>
        console.error("[password-changed] log request failed:", err)
      );
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    setSavedMsg("");
    setEmailPending(null);

    const country = PHONE_ALL.find((c) => c.iso === countryIso) ?? PHONE_PRIORITY[0];
    const trimmedLocal = localPhone.trim();
    if (trimmedLocal && !/^[\d\s\-().]{4,20}$/.test(trimmedLocal)) {
      setErrorMsg("Please enter a valid local number using digits, spaces, or hyphens.");
      setSaving(false);
      return;
    }
    const combinedPhone = trimmedLocal ? `${country.dial} ${trimmedLocal}` : "";

    // Save profile fields immediately
    const profileRes = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: combinedPhone || null,
        fan_status: fanStatus || null,
        contact_email: contactEmail,
        contact_sms: contactSms,
        contact_telephone: contactTelephone,
      }),
    });

    if (!profileRes.ok) {
      const data = await profileRes.json();
      setErrorMsg(data.error ?? "Failed to save changes.");
      setSaving(false);
      return;
    }

    // Email change — separate confirmation flow
    const trimmedNewEmail = newEmail.trim().toLowerCase();
    if (trimmedNewEmail && trimmedNewEmail !== userEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedNewEmail)) {
        setErrorMsg("Please enter a valid email address.");
        setSaving(false);
        return;
      }

      const supabase = createBrowserSupabase();
      const { error: updateErr } = await supabase.auth.updateUser(
        { email: trimmedNewEmail },
        {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?type=email_change`,
        }
      );

      if (updateErr) {
        const alreadyInUse =
          updateErr.message.toLowerCase().includes("already registered") ||
          updateErr.message.toLowerCase().includes("already in use") ||
          updateErr.message.toLowerCase().includes("user_already_exists") ||
          updateErr.message.toLowerCase().includes("email address is already");
        setErrorMsg(
          alreadyInUse
            ? "That email address is already associated with a CSL account."
            : updateErr.message
        );
        setSaving(false);
        return;
      }

      // Store pending email so the auth callback can find this members row
      const pendingPatchRes = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending_email: trimmedNewEmail }),
      });

      if (!pendingPatchRes.ok) {
        setErrorMsg("Something went wrong saving your change. Please try again.");
        setSaving(false);
        return;
      }

      setEmailPending(trimmedNewEmail);
      setSaving(false);
      router.refresh();
      return;
    }

    setSavedMsg("Profile updated.");
    setSaving(false);
    router.refresh();
    setTimeout(() => setSavedMsg(""), 3000);
  }

  async function handleCancelPending() {
    setCancellingPending(true);
    setCancelError(false);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pending_email: null }),
    });
    if (!res.ok) {
      setCancelError(true);
      setCancellingPending(false);
      return;
    }
    setCancellingPending(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {emailSuccessBanner && (
        <div className="flex items-start justify-between gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <span>Your email address has been updated successfully.</span>
          <button
            type="button"
            onClick={() => setEmailSuccessBanner(false)}
            className="flex-shrink-0 text-green-600 hover:text-green-800 font-bold leading-none"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
      {member?.pending_email && !emailPending && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <div className="flex items-start justify-between gap-3">
            <span>
              <strong>Email change pending.</strong> A confirmation link was sent to{" "}
              <strong>{member.pending_email}</strong>. Check your inbox and click the link to
              complete the change. Your current email remains active until then.
            </span>
            <button
              type="button"
              onClick={handleCancelPending}
              disabled={cancellingPending}
              className="flex-shrink-0 text-amber-700 hover:text-amber-900 underline text-xs whitespace-nowrap disabled:opacity-50"
            >
              {cancellingPending ? "Cancelling..." : "Cancel pending change"}
            </button>
          </div>
          {cancelError && (
            <p className="mt-2 text-xs text-amber-900">Could not cancel — please try again.</p>
          )}
        </div>
      )}
      {emailPending && (
        <div className="flex items-start justify-between gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <span>
            Confirmation sent to <strong>{emailPending}</strong>. Your login email will update
            once you click the link in that email. Until then your current email remains active.
          </span>
          <button
            type="button"
            onClick={() => setEmailPending(null)}
            className="flex-shrink-0 text-blue-600 hover:text-blue-800 font-bold leading-none"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
      <Card>
        <h3 className="font-bold text-gray-900 mb-5">Edit Profile</h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="first-name"
                className="block text-sm font-semibold text-gray-700 mb-1.5"
              >
                First name
              </label>
              <input
                id="first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={saving}
                className={inputCls}
                placeholder="First name"
              />
            </div>
            <div>
              <label
                htmlFor="last-name"
                className="block text-sm font-semibold text-gray-700 mb-1.5"
              >
                Last name
              </label>
              <input
                id="last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={saving}
                className={inputCls}
                placeholder="Last name"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="email-address"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              Email address
            </label>
            <input
              id="email-address"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={saving}
              autoComplete="email"
              className={inputCls}
            />
            {newEmail.trim().toLowerCase() !== userEmail && newEmail.trim() !== "" && (
              <p className="text-xs text-amber-700 mt-1">
                Changing your email will send a confirmation link to the new address. Your
                current email remains active until you confirm.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="phone-local"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              Phone (optional)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                id="phone-country"
                value={countryIso}
                onChange={(e) => setCountryIso(e.target.value)}
                disabled={saving}
                aria-label="Country code"
                className="sm:w-56 shrink-0 border border-gray-300 rounded-lg px-3 py-2.5 text-[0.95rem] bg-white focus:outline-none focus:ring-2 focus:ring-csl-dark focus:border-transparent disabled:opacity-60"
              >
                <optgroup label="Common countries">
                  {PHONE_PRIORITY.map((c) => (
                    <option key={`p-${c.iso}`} value={c.iso}>
                      {c.name} ({c.dial})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="All countries">
                  {PHONE_ALL.map((c) => (
                    <option key={`a-${c.iso}`} value={c.iso}>
                      {c.name} ({c.dial})
                    </option>
                  ))}
                </optgroup>
              </select>
              <input
                id="phone-local"
                type="tel"
                value={localPhone}
                onChange={(e) => setLocalPhone(e.target.value)}
                disabled={saving}
                placeholder="7911 123456"
                autoComplete="tel-national"
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-4 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-csl-dark focus:border-transparent disabled:opacity-60"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Select your country then enter your number without the country code.
            </p>
          </div>

          <div>
            <label
              htmlFor="fan-status"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              Fan status
            </label>
            <select
              id="fan-status"
              value={fanStatus}
              onChange={(e) => setFanStatus(e.target.value)}
              disabled={saving}
              className={inputCls}
            >
              <option value="">Select...</option>
              {FAN_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">
              Contact preferences
            </p>
            <div className="space-y-2.5">
              {(
                [
                  { id: "contact-email",     label: "Email",     checked: contactEmail,     setter: setContactEmail,     locked: true  },
                  { id: "contact-sms",        label: "SMS",       checked: contactSms,        setter: setContactSms,        locked: false },
                  { id: "contact-telephone",  label: "Telephone", checked: contactTelephone,  setter: setContactTelephone,  locked: false },
                ] as { id: string; label: string; checked: boolean; setter: (v: boolean) => void; locked: boolean }[]
              ).map(({ id, label, checked, setter, locked }) => (
                <label
                  key={id}
                  htmlFor={id}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => !locked && setter(e.target.checked)}
                    disabled={saving || locked}
                    className="w-4 h-4 accent-csl-dark"
                  />
                  <span className="text-sm text-gray-700">
                    {label}
                    {locked && (
                      <span className="ml-1.5 text-xs text-gray-400">
                        (required for membership communications)
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {errorMsg && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              {errorMsg}
            </p>
          )}
          {savedMsg && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
              {savedMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="bg-csl-dark text-white font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-csl-mid transition-colors disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>
      </Card>

      <Card>
        <h3 className="font-bold text-gray-900 mb-1">Password</h3>
        <p className="text-sm text-gray-400 mb-5">
          Update your portal password. If you signed in via an email link and
          have not previously set a password, leave the current password field
          blank.
        </p>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label
              htmlFor="current-password"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              disabled={pwdSaving}
              autoComplete="current-password"
              placeholder="Leave blank if you have not yet set a password"
              className={inputCls}
            />
          </div>

          <div>
            <label
              htmlFor="new-portal-password"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              New password
            </label>
            <input
              id="new-portal-password"
              type="password"
              required
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              disabled={pwdSaving}
              autoComplete="new-password"
              className={inputCls}
            />
            <p className="text-xs text-gray-400 mt-1">Minimum 8 characters.</p>
          </div>

          <div>
            <label
              htmlFor="confirm-portal-password"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              Confirm new password
            </label>
            <input
              id="confirm-portal-password"
              type="password"
              required
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              disabled={pwdSaving}
              autoComplete="new-password"
              className={inputCls}
            />
          </div>

          {pwdError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              {pwdError}
            </p>
          )}
          {pwdSuccess && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
              Password updated successfully.
            </p>
          )}

          <button
            type="submit"
            disabled={pwdSaving}
            className="bg-csl-dark text-white font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-csl-mid transition-colors disabled:opacity-60"
          >
            {pwdSaving ? "Updating..." : "Update password"}
          </button>
        </form>
      </Card>
    </div>
  );
}

// ── Nav config ────────────────────────────────────────────────────────────────

type NavItem =
  | { kind: "tab"; tab: Tab; label: string; icon: string }
  | { kind: "link"; href: string; label: string; icon: string };

const NAV_ITEMS: NavItem[] = [
  { kind: "tab",  tab: "dashboard",  label: "Dashboard",     icon: "&#9776;"   },
  { kind: "tab",  tab: "membership", label: "My Membership", icon: "&#128179;" },
  { kind: "tab",  tab: "documents",  label: "Documents",     icon: "&#128218;" },
  { kind: "tab",  tab: "enquiries",  label: "My Enquiries",  icon: "&#128269;" },
  { kind: "tab",  tab: "profile",    label: "Edit Profile",  icon: "&#9998;"   },
];

// ── Main portal component ─────────────────────────────────────────────────────

const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes

export default function PortalClient({
  user,
  member,
  cases,
  payments,
  documents,
  governanceCriteria,
  stripeSub,
  activeCount,
  agmDate,
  sharesRepresented,
  initialTab,
  emailUpdated,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(
    VALID_TABS.has(initialTab as Tab) ? (initialTab as Tab) : "dashboard"
  );
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On bfcache restore (back/forward navigation), verify the session is still
  // valid with a live getUser() call — bfcache restores bypass React mount and
  // middleware, so we must check the Supabase session directly.
  useEffect(() => {
    const supabase = createBrowserSupabase();

    async function enforceSession() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        window.location.href = "/login";
      }
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) void enforceSession();
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // Sign the user out and redirect to /login if no activity for 30 minutes.
  useEffect(() => {
    const supabase = createBrowserSupabase();

    function resetTimer() {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(() => {
        void supabase.auth.signOut();
        sessionStorage.clear();
        window.location.href = "/login?reason=timeout";
      }, INACTIVITY_MS);
    }

    const activityEvents = ["mousemove", "keydown", "click", "scroll"] as const;
    activityEvents.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();

    return () => {
      activityEvents.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, []);

  const name = displayName(member, user.email);
  const tierDisplay = member?.plan_name ?? tierLabel(member?.membership_tier ?? null);

  async function handleSignOut() {
    setSigningOut(true);
    await createBrowserSupabase().auth.signOut();
    sessionStorage.clear();
    router.push("/");
    router.refresh();
  }

  return (
    <main>
      {/* Portal header */}
      <section className="bg-csl-dark text-white py-6">
        <div className="max-w-[1100px] mx-auto px-5 flex justify-between items-center gap-4">
          <div>
            <p className="text-csl-light/70 text-[0.75rem] font-semibold uppercase tracking-[0.12em]">
              Member Portal
            </p>
            <h1 className="text-xl font-extrabold mt-0.5">
              Welcome back, {name}
            </h1>
          </div>
          <StatusPill status={member?.status ?? null} />
        </div>
      </section>

      {/* Portal body */}
      <section className="bg-gray-50 min-h-[calc(100vh-200px)] py-8">
        <div className="max-w-[1100px] mx-auto px-5">
          <div className="grid grid-cols-1 lg:grid-cols-[220px,1fr] gap-6">

            {/* Sidebar */}
            <aside className="lg:sticky lg:top-6 lg:self-start">
              {/* Mobile: horizontal scroll nav */}
              <div className="lg:hidden overflow-x-auto mb-4">
                <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1.5 min-w-max">
                  {NAV_ITEMS.map((item) => {
                    const key = item.kind === "tab" ? item.tab : item.href;
                    const isActive = item.kind === "tab" ? activeTab === item.tab : pathname === item.href;
                    const cls = `px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      isActive ? "bg-csl-dark text-white" : "text-gray-600 hover:bg-gray-100"
                    }`;
                    return item.kind === "link" ? (
                      <Link key={key} href={item.href} className={cls}>{item.label}</Link>
                    ) : (
                      <button key={key} onClick={() => setActiveTab(item.tab)} className={cls}>
                        {item.label}
                      </button>
                    );
                  })}
                  {member?.is_admin && (
                    <>
                      {[
                        { href: "/member-portal/admin/members",       label: "Member Events" },
                        { href: "/member-portal/admin/cases",         label: "Cases"         },
                        { href: "/member-portal/admin/reporting",     label: "Reporting"     },
                        { href: "/member-portal/admin/operations",    label: "Operations"    },
                        { href: "/member-portal/admin/resolution",    label: "Resolution"    },
                        { href: "/member-portal/admin/documents/new", label: "Add Document"  },
                      ].map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                            pathname === item.href
                              ? "bg-csl-dark text-white"
                              : "text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Desktop sidebar card */}
              <div className="hidden lg:block bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-center mb-5 pb-5 border-b border-gray-100">
                  <div className="w-14 h-14 rounded-full bg-csl-light flex items-center justify-center text-2xl mx-auto mb-3">
                    &#9752;
                  </div>
                  <p className="font-bold text-gray-900 text-sm">{name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{tierDisplay}</p>
                  <p className="text-xs text-gray-400 mt-0.5 break-all">{user.email}</p>
                </div>

                <nav>
                  <ul className="space-y-0.5">
                    {NAV_ITEMS.map((item) => {
                      const key = item.kind === "tab" ? item.tab : item.href;
                      const isActive = item.kind === "tab" ? activeTab === item.tab : pathname === item.href;
                      const cls = `w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-csl-light text-csl-dark font-semibold"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`;
                      return (
                        <li key={key}>
                          {item.kind === "link" ? (
                            <Link href={item.href} className={cls}>
                              <span dangerouslySetInnerHTML={{ __html: item.icon }} />
                              &nbsp;{item.label}
                            </Link>
                          ) : (
                            <button
                              onClick={() => setActiveTab(item.tab)}
                              className={cls}
                              dangerouslySetInnerHTML={{ __html: `<span>${item.icon}</span>&nbsp;${item.label}` }}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </nav>

                {member?.is_admin && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-gray-400 px-3 mb-1">
                      Admin
                    </p>
                    <ul className="space-y-0.5">
                      {[
                        { href: "/member-portal/admin/members",       icon: "&#128203;", label: "Member Events" },
                        { href: "/member-portal/admin/cases",         icon: "&#128269;", label: "Cases"          },
                        { href: "/member-portal/admin/reporting",     icon: "&#128202;", label: "Reporting"      },
                        { href: "/member-portal/admin/operations",    icon: "&#9881;",   label: "Operations"     },
                        { href: "/member-portal/admin/resolution",    icon: "&#9998;",   label: "Resolution"     },
                        { href: "/member-portal/admin/documents/new", icon: "&#128196;", label: "Add Document"   },
                      ].map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                              pathname === item.href
                                ? "bg-csl-light text-csl-dark font-semibold"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            }`}
                          >
                            <span dangerouslySetInnerHTML={{ __html: item.icon }} />
                            &nbsp;{item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-5 pt-4 border-t border-gray-100 space-y-1">
                  <Link
                    href="/"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    &#8592; Back to website
                  </Link>
                  <button
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50"
                  >
                    {signingOut ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              </div>

              {/* Mobile sign-out */}
              <div className="lg:hidden flex justify-end">
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="text-xs text-red-500 hover:underline disabled:opacity-50"
                >
                  {signingOut ? "Signing out..." : "Sign out"}
                </button>
              </div>
            </aside>

            {/* Main content */}
            <div>
              {activeTab === "dashboard" && (
                <DashboardTab
                  member={member}
                  cases={cases}
                  documents={documents}
                  governanceCriteria={governanceCriteria}
                  onTabChange={setActiveTab}
                  stripeSub={stripeSub}
                  activeCount={activeCount}
                  agmDate={agmDate}
                  sharesRepresented={sharesRepresented}
                />
              )}
              {activeTab === "membership" && (
                <MyMembershipTab member={member} stripeSub={stripeSub} payments={payments} />
              )}
              {activeTab === "documents" && (() => {
                // A3 — grace period: payment_failed members retain access for 7 days
                const isPaymentFailed = member?.status === "payment_failed";
                const failedAt = member?.payment_failed_at
                  ? new Date(member.payment_failed_at).getTime()
                  : null;
                const gracePeriodExpired =
                  isPaymentFailed &&
                  failedAt !== null &&
                  Date.now() - failedAt > 7 * 24 * 60 * 60 * 1000;

                if (gracePeriodExpired) {
                  return (
                    <Card>
                      <div className="text-center py-10">
                        <div className="text-4xl mb-3">&#128274;</div>
                        <h3 className="font-bold text-gray-900 mb-2">Document access paused</h3>
                        <p className="text-gray-500 text-sm mb-5 max-w-sm mx-auto">
                          Your membership payment is overdue. Please update your payment details to restore document access.
                        </p>
                        <button
                          onClick={() => setActiveTab("membership")}
                          className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors"
                        >
                          Update payment details
                        </button>
                      </div>
                    </Card>
                  );
                }

                return (
                  <div className="space-y-4">
                    {member?.is_admin && (
                      <div className="flex justify-end">
                        <Link
                          href="/member-portal/admin/documents/new"
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors"
                        >
                          + Add Document
                        </Link>
                      </div>
                    )}
                    <DocumentLibrary documents={documents} isAdmin={member?.is_admin === true} />
                  </div>
                );
              })()}
              {activeTab === "enquiries" && (
                <EnquiriesTab cases={cases} />
              )}
              {activeTab === "profile" && (
                <EditProfileTab member={member} userEmail={user.email} emailUpdated={emailUpdated} />
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
