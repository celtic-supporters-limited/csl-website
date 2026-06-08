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
  status: string;
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
  "dashboard", "subscription", "payments", "documents", "enquiries", "profile",
]);

type Props = {
  user: { email: string; id: string };
  member: Member | null;
  cases: PortalCase[];
  payments: PortalPayment[];
  documents: MemberDocument[];
  governanceCriteria: GovernanceCriterion[];
  stripeSub: StripeSubData | null;
  initialTab?: string;
};

type Tab =
  | "dashboard"
  | "subscription"
  | "payments"
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

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  const map: Record<string, string> = {
    New: "bg-blue-50 text-blue-700 border-blue-200",
    "In Progress": "bg-amber-50 text-amber-700 border-amber-200",
    Resolved: "bg-green-50 text-green-700 border-green-200",
  };
  const cls = map[status ?? ""] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}
    >
      {status ?? "Unknown"}
    </span>
  );
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────

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
}: {
  member: Member | null;
  cases: PortalCase[];
  documents: MemberDocument[];
  governanceCriteria: GovernanceCriterion[];
  onTabChange: (tab: Tab) => void;
}) {
  if (!member) {
    return (
      <Card>
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

  const metCount     = governanceCriteria.filter((c) => c.status === "Met").length;
  const partialCount = governanceCriteria.filter((c) => c.status === "Partial").length;
  const notMetCount  = governanceCriteria.filter((c) => c.status === "Not Met").length;
  const lastReviewed = governanceCriteria
    .map((c) => c.last_reviewed)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  return (
    <div className="space-y-5">
      {member.status === "payment_failed" && (
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
          <span className="flex-shrink-0">&#9888;&#65039;</span>
          <div>
            <strong>Payment failed.</strong> Your last payment could not be
            processed.{" "}
            <button
              onClick={() => onTabChange("subscription")}
              className="font-semibold underline hover:no-underline"
            >
              View subscription details.
            </button>
          </div>
        </div>
      )}

      <Card>
        <h3 className="font-bold text-gray-900 mb-4">Membership Overview</h3>
        <DetailRow label="Status">
          <StatusPill status={member.status} />
        </DetailRow>
        <DetailRow label="Plan">{planDisplay(member)}</DetailRow>
        <DetailRow label="Member since">{formatDate(member.created_at)}</DetailRow>
      </Card>

      {governanceCriteria.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900">Governance Scorecard</h3>
            <Link
              href="/governance"
              className="text-csl-dark text-xs font-semibold hover:underline"
            >
              View full scorecard
            </Link>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
              &#9679; {metCount} Met
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              &#9679; {partialCount} Partial
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
              &#9679; {notMetCount} Not Met
            </span>
            <span className="text-xs text-gray-400 self-center">
              out of {governanceCriteria.length}
            </span>
          </div>
          {lastReviewed && (
            <p className="text-xs text-gray-400">Last reviewed: {formatDate(lastReviewed)}</p>
          )}
        </Card>
      )}

      {documents.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Latest Documents</h3>
            <button
              onClick={() => onTabChange("documents")}
              className="text-csl-dark text-xs font-semibold hover:underline"
            >
              View all documents
            </button>
          </div>
          <div className="space-y-0">
            {documents.slice(0, 3).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0"
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
                  className="flex-shrink-0 text-xs font-semibold text-csl-dark hover:text-csl-mid"
                >
                  View
                </a>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-bold text-gray-900 mb-4">My Enquiries</h3>
        {cases.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-gray-400 text-sm mb-3">No enquiries submitted yet.</p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/share-tracing"
                className="text-xs font-semibold text-csl-dark hover:underline"
              >
                Trace my shares
              </Link>
              <span className="text-gray-300">|</span>
              <Link
                href="/proxy"
                className="text-xs font-semibold text-csl-dark hover:underline"
              >
                Assign proxy
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            {cases.slice(0, 3).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0 gap-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.case_type}</p>
                  <p className="text-xs text-gray-400">{formatDate(c.created_at)}</p>
                </div>
                <CaseStatusBadge status={c.status} />
              </div>
            ))}
            {cases.length > 3 && (
              <button
                onClick={() => onTabChange("enquiries")}
                className="mt-2 text-xs font-semibold text-csl-dark hover:underline"
              >
                View all {cases.length} enquiries
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Subscription tab ──────────────────────────────────────────────────────────

function SubscriptionTab({
  member,
  stripeSub,
}: {
  member: Member | null;
  stripeSub: StripeSubData | null;
}) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState("");

  async function openBillingPortal() {
    setPortalLoading(true);
    setPortalError("");
    try {
      const res = await fetch("/api/billing-portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setPortalLoading(false);
        setPortalError(data.error ?? "Could not open billing portal.");
      }
    } catch {
      setPortalLoading(false);
      setPortalError("Network error. Please try again.");
    }
  }

  async function openSubscriptionPortal() {
    setManageLoading(true);
    setManageError("");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setManageLoading(false);
        setManageError(data.error ?? "Could not open subscription portal.");
      }
    } catch {
      setManageLoading(false);
      setManageError("Network error. Please try again.");
    }
  }

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

  const isLifetime = member.membership_tier === "lifetime";
  const statusToShow = stripeSub?.status ?? member.status;

  // Format card expiry
  const cardExpiry =
    stripeSub?.card_exp_month != null && stripeSub?.card_exp_year != null
      ? `${String(stripeSub.card_exp_month).padStart(2, "0")}/${String(
          stripeSub.card_exp_year
        ).slice(-2)}`
      : null;

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-bold text-gray-900 mb-4">Current Subscription</h3>

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
              Payment details will appear after your next renewal.
            </span>
          </DetailRow>
        )}

        {isLifetime && (
          <DetailRow label="Renewal">No renewal (lifetime membership)</DetailRow>
        )}

        {!isLifetime && (
          <div className="pt-4 mt-2 border-t border-gray-100">
            {manageError && (
              <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                {manageError}
              </p>
            )}
            <button
              onClick={openSubscriptionPortal}
              disabled={manageLoading}
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors disabled:opacity-60"
            >
              {manageLoading ? "Opening..." : "Change or cancel subscription"}
            </button>
            <p className="text-xs text-gray-400 mt-2">
              Secured by Stripe. You will be taken to a Stripe-hosted page.
            </p>
          </div>
        )}
      </Card>

      {!isLifetime && stripeSub && (
        <Card>
          <h3 className="font-bold text-gray-900 mb-4">Payment Method</h3>

          {stripeSub.card_brand && stripeSub.card_last4 ? (
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-7 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-[0.65rem] font-bold text-gray-600 uppercase tracking-wide">
                {stripeSub.card_brand.slice(0, 4)}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {capitalise(stripeSub.card_brand)} &bull;&bull;&bull;&bull;{" "}
                  {stripeSub.card_last4}
                </p>
                {cardExpiry && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Expires {cardExpiry}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mb-5">No card on file.</p>
          )}

          {portalError && (
            <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              {portalError}
            </p>
          )}

          <button
            onClick={openBillingPortal}
            disabled={portalLoading}
            className="inline-block bg-csl-dark text-white font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-csl-mid transition-colors disabled:opacity-60"
          >
            {portalLoading ? "Opening..." : "Update payment method"}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Secured by Stripe. You will be taken to a Stripe-hosted page.
          </p>
        </Card>
      )}

      {!isLifetime && (
        <Card>
          <h3 className="font-bold text-gray-900 mb-2">Upgrade</h3>
          <p className="text-sm text-gray-500 mb-4">
            Upgrade to Lifetime membership for a single one-off payment of
            &pound;5,000.
          </p>
          <Link
            href="/membership"
            className="inline-block bg-csl-dark text-white font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-csl-mid transition-colors"
          >
            View membership options
          </Link>
        </Card>
      )}
    </div>
  );
}

// ── Payments tab ──────────────────────────────────────────────────────────────

function PaymentsTab({ payments }: { payments: PortalPayment[] }) {
  return (
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
                <th className="text-right py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Ref
                </th>
                <th className="text-left py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
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
                  <td className="py-3 pr-4 text-gray-900 font-semibold text-right whitespace-nowrap">
                    {formatPence(p.amount_pence)}
                  </td>
                  <td className="py-3 pr-4 text-gray-400 font-mono text-xs hidden sm:table-cell">
                    {p.stripe_payment_intent_id
                      ? `...${p.stripe_payment_intent_id.slice(-8)}`
                      : "-"}
                  </td>
                  <td className="py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                      {p.status === "completed" ? "Paid" : p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Enquiries tab ─────────────────────────────────────────────────────────────

function EnquiriesTab({ cases }: { cases: PortalCase[] }) {
  return (
    <Card>
      <h3 className="font-bold text-gray-900 mb-1">My Share Enquiries</h3>
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
}: {
  member: Member | null;
  userEmail: string;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(member?.first_name ?? "");
  const [lastName, setLastName] = useState(member?.last_name ?? "");
  const parsedPhone = parseStoredPhone(member?.phone ?? "");
  const [countryIso, setCountryIso] = useState(parsedPhone.iso);
  const [localPhone, setLocalPhone] = useState(parsedPhone.local);
  const [fanStatus, setFanStatus] = useState(member?.fan_status ?? "");
  const [contactEmail, setContactEmail] = useState(
    member?.contact_email ?? true
  );
  const [contactSms, setContactSms] = useState(member?.contact_sms ?? false);
  const [contactTelephone, setContactTelephone] = useState(
    member?.contact_telephone ?? false
  );
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    setSavedMsg("");

    const country = PHONE_ALL.find((c) => c.iso === countryIso) ?? PHONE_PRIORITY[0];
    const trimmedLocal = localPhone.trim();
    if (trimmedLocal && !/^[\d\s\-().]{4,20}$/.test(trimmedLocal)) {
      setErrorMsg("Please enter a valid local number using digits, spaces, or hyphens.");
      setSaving(false);
      return;
    }
    const combinedPhone = trimmedLocal ? `${country.dial} ${trimmedLocal}` : "";

    const res = await fetch("/api/profile", {
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

    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setErrorMsg(data.error ?? "Failed to save changes.");
      return;
    }

    setSavedMsg("Profile updated.");
    router.refresh();
    setTimeout(() => setSavedMsg(""), 3000);
  }

  return (
    <div className="space-y-5">
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
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Email address
            </label>
            <p className="text-[0.95rem] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
              {userEmail}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Email cannot be changed here. Contact{" "}
              <a
                href="mailto:membership@celticsupporters.net"
                className="text-csl-dark hover:underline"
              >
                membership@celticsupporters.net
              </a>{" "}
              if you need to update it.
            </p>
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
    </div>
  );
}

// ── Nav config ────────────────────────────────────────────────────────────────

type NavItem =
  | { kind: "tab"; tab: Tab; label: string; icon: string }
  | { kind: "link"; href: string; label: string; icon: string };

const NAV_ITEMS: NavItem[] = [
  { kind: "tab", tab: "dashboard",    label: "Dashboard",       icon: "&#9776;" },
  { kind: "tab", tab: "subscription", label: "Subscription",    icon: "&#128179;" },
  { kind: "tab", tab: "payments",     label: "Payments",        icon: "&#128196;" },
  { kind: "tab", tab: "documents",    label: "Documents",       icon: "&#128218;" },
  { kind: "tab", tab: "enquiries",    label: "My Enquiries",    icon: "&#128269;" },
  { kind: "tab", tab: "profile",      label: "Edit Profile",    icon: "&#9998;" },
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
  initialTab,
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
                />
              )}
              {activeTab === "subscription" && (
                <SubscriptionTab member={member} stripeSub={stripeSub} />
              )}
              {activeTab === "payments" && (
                <PaymentsTab payments={payments} />
              )}
              {activeTab === "documents" && (
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
              )}
              {activeTab === "enquiries" && (
                <EnquiriesTab cases={cases} />
              )}
              {activeTab === "profile" && (
                <EditProfileTab member={member} userEmail={user.email} />
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
