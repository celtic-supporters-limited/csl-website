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

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0 gap-4">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{children}</span>
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

// ── My Membership tab ─────────────────────────────────────────────────────────

function MyMembershipTab({
  member,
  stripeSub,
  payments,
}: {
  member: Member | null;
  stripeSub: StripeSubData | null;
  payments: PortalPayment[];
}) {
  const billingPortal = useBillingPortal();

  if (!member) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">No membership record found.</p>
          <Link
            href="/membership"
            className="mt-4 inline-block bg-csl-dark text-white font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-csl-mid transition-colors"
          >
            Join CSL
          </Link>
        </div>
      </Card>
    );
  }

  const isLifetime = member.membership_tier === "Lifetime";
  const statusToShow = stripeSub?.status ?? member.status;

  const cardExpiry =
    stripeSub?.card_exp_month != null && stripeSub?.card_exp_year != null
      ? `${String(stripeSub.card_exp_month).padStart(2, "0")}/${String(
          stripeSub.card_exp_year
        ).slice(-2)}`
      : null;

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-bold text-gray-900 mb-4">My Membership</h3>

        <DetailRow label="Plan">{planDisplay(member)}</DetailRow>
        <DetailRow label="Status">
          <StatusPill status={statusToShow} />
        </DetailRow>
        <DetailRow label="Member since">{formatDate(member.created_at)}</DetailRow>

        {!isLifetime && stripeSub && (
          <>
            <DetailRow label="Next payment">
              {formatPence(stripeSub.next_amount_pence)} on{" "}
              {formatDate(stripeSub.current_period_end)}
            </DetailRow>
            {stripeSub.cancel_at_period_end && (
              <DetailRow label="Cancellation">
                <span className="text-amber-600 font-semibold">
                  Cancels {formatDate(stripeSub.current_period_end)}
                </span>
              </DetailRow>
            )}
          </>
        )}

        {!isLifetime && !stripeSub && (
          <DetailRow label="Payment details">
            <span className="text-gray-400 font-normal">
              Will appear after your next renewal.
            </span>
          </DetailRow>
        )}

        {isLifetime && (
          <DetailRow label="Renewal">No renewal required</DetailRow>
        )}

        {!isLifetime && stripeSub && (
          <DetailRow label="Card on file">
            {stripeSub.card_brand && stripeSub.card_last4 ? (
              <span className="inline-flex items-center gap-2">
                <span className="text-[0.65rem] font-bold uppercase bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-gray-600">
                  {stripeSub.card_brand.slice(0, 4)}
                </span>
                &bull;&bull;&bull;&bull;&nbsp;{stripeSub.card_last4}
                {cardExpiry && (
                  <span className="text-gray-400 text-xs">&nbsp;· {cardExpiry}</span>
                )}
              </span>
            ) : (
              <span className="text-gray-400 font-normal">No card on file</span>
            )}
          </DetailRow>
        )}

        {!isLifetime && (
          <div className="pt-4 mt-2 border-t border-gray-100">
            {billingPortal.error && (
              <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                {billingPortal.error}
              </p>
            )}
            <button
              onClick={billingPortal.open}
              disabled={billingPortal.loading}
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors disabled:opacity-60"
            >
              {billingPortal.loading ? "Opening..." : "Manage subscription"}
            </button>
            <p className="text-xs text-gray-400 mt-2">
              Update your card, change plan, or cancel — all via Stripe.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-bold text-gray-900 mb-1">Payment History</h3>
        <p className="text-sm text-gray-400 mb-5">
          All charges recorded against your membership.
        </p>

        {payments.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-3xl mb-3">&#128196;</div>
            <p className="text-gray-500 text-sm">No payments recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="text-right py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">
                      {formatDate(p.paid_at)}
                    </td>
                    <td className="py-3 pr-4 text-gray-700">
                      {p.plan_name ?? "-"}
                    </td>
                    <td className="py-3 text-gray-900 font-semibold text-right whitespace-nowrap">
                      {formatPence(p.amount_pence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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

  // sessionStorage is cleared on browser close and is never restored by bfcache
  // or Chrome's "Continue where you left off". If the flag is absent the user
  // returned without actively signing in — enforce re-login.
  // The pageshow handler catches bfcache restores (event.persisted === true),
  // which bypass the initial mount check entirely.
  useEffect(() => {
    const supabase = createBrowserSupabase();

    function enforceSession() {
      if (!sessionStorage.getItem("csl-auth-alive")) {
        void supabase.auth.signOut();
        window.location.href = "/login";
      }
    }

    enforceSession();

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) enforceSession();
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
