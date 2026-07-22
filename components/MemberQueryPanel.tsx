"use client";

import { useState } from "react";
import Link from "next/link";

type MemberResult = {
  member: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    name: string | null;
    status: string;
    planName: string | null;
    membershipTier: string | null;
    amountPence: number | null;
    isLifetime: boolean;
    memberSince: string;
    paymentFailedAt: string | null;
    pendingEmail: string | null;
    stripeCustomerUrl: string | null;
    stripeSubscriptionUrl: string | null;
  } | null;
  stripe: {
    subscriptionStatus: string | null;
    nextPaymentDate: string | null;
    nextPaymentAmount: number | null;
    cardBrand: string | null;
    cardLast4: string | null;
    cardExpiry: string | null;
    currentPeriodEnd: string | null;
  };
  recentCharges: {
    date: string;
    amount: number;
    currency: string;
    status: string;
    description: string;
  }[];
};

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"         ? "bg-green-50 text-green-700 border-green-200" :
    status === "payment_failed" ? "bg-red-50 text-red-700 border-red-200"     :
    status === "cancelled"      ? "bg-gray-100 text-gray-600 border-gray-200"  :
                                  "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {status === "payment_failed" ? "Payment failed" : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function FieldRow({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  return (
    <div className="flex justify-between items-start text-xs py-1.5 border-b border-gray-100 last:border-0 gap-3">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-right text-gray-900 font-medium break-all">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-csl-dark underline underline-offset-2">
            {value}
          </a>
        ) : value}
      </span>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

function formatGbp(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

export default function MemberQueryPanel() {
  const [open, setOpen] = useState(false);
  const [query, setQuery]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [result, setResult] = useState<MemberResult | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const email = query.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setSearched(false);

    try {
      const res = await fetch(`/api/admin/member-lookup?email=${encodeURIComponent(email)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Lookup failed.");
      } else {
        setResult(json);
        setSearched(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const m = result?.member ?? null;
  const s = result?.stripe;
  const charges = result?.recentCharges ?? [];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Collapsed header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <span className="font-semibold text-gray-900 text-sm">Member Query</span>
          <span className="ml-2 text-[11px] text-gray-400">Quick lookup by email</span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {/* Search form */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="member@example.com"
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-csl-dark/30"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-csl-dark text-white text-sm font-medium rounded-lg hover:bg-csl-mid disabled:opacity-50 transition-colors"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {searched && !m && (
            <p className="text-xs text-gray-500 text-center py-4">No member found for that email address.</p>
          )}

          {m && (
            <div className="space-y-4">
              {/* Member summary header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : m.name ?? m.email}
                  </p>
                  <p className="text-xs text-gray-500">{m.email}</p>
                </div>
                <StatusBadge status={m.status} />
              </div>

              {/* Membership details */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Membership</p>
                <div className="bg-gray-50 rounded-lg px-3 py-1">
                  <FieldRow label="Plan"        value={m.planName ?? "-"} />
                  <FieldRow label="Tier"        value={m.membershipTier ?? "-"} />
                  <FieldRow label="Amount"      value={m.amountPence != null ? formatGbp(m.amountPence) : "-"} />
                  <FieldRow label="Member since" value={formatDate(m.memberSince)} />
                  {m.isLifetime && <FieldRow label="Lifetime member" value="Yes" />}
                  {m.paymentFailedAt && (
                    <FieldRow label="Payment failed at" value={formatDate(m.paymentFailedAt)} />
                  )}
                  {m.pendingEmail && (
                    <FieldRow label="Pending email change" value={m.pendingEmail} />
                  )}
                </div>
              </div>

              {/* Subscription */}
              {s && (s.subscriptionStatus || s.cardLast4) && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Subscription</p>
                  <div className="bg-gray-50 rounded-lg px-3 py-1">
                    {s.subscriptionStatus && <FieldRow label="Status"    value={s.subscriptionStatus} />}
                    {s.nextPaymentDate && (
                      <FieldRow label="Next payment" value={
                        `${formatDate(s.nextPaymentDate)}${s.nextPaymentAmount != null ? ` (${formatGbp(s.nextPaymentAmount)})` : ""}`
                      } />
                    )}
                    {s.cardBrand && s.cardLast4 && (
                      <FieldRow label="Card"
                        value={`${s.cardBrand.charAt(0).toUpperCase() + s.cardBrand.slice(1)} ending ${s.cardLast4}${s.cardExpiry ? `, exp ${s.cardExpiry}` : ""}`}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Recent charges */}
              {charges.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Recent charges</p>
                  <div className="bg-gray-50 rounded-lg px-3 py-1">
                    {charges.map((c, i) => (
                      <div key={i} className="flex justify-between items-center text-xs py-1.5 border-b border-gray-100 last:border-0 gap-2">
                        <span className="text-gray-500 shrink-0">{new Date(c.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                        <span className="text-gray-900 flex-1 truncate">{c.description || "-"}</span>
                        <span className={`font-medium shrink-0 ${c.status === "succeeded" ? "text-green-700" : "text-red-600"}`}>
                          {c.currency.toUpperCase()} {formatGbp(c.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stripe links */}
              {(m.stripeCustomerUrl || m.stripeSubscriptionUrl) && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Stripe Dashboard</p>
                  <div className="flex gap-2">
                    {m.stripeCustomerUrl && (
                      <a href={m.stripeCustomerUrl} target="_blank" rel="noreferrer"
                        className="text-xs text-csl-dark underline underline-offset-2">
                        View customer
                      </a>
                    )}
                    {m.stripeSubscriptionUrl && (
                      <a href={m.stripeSubscriptionUrl} target="_blank" rel="noreferrer"
                        className="text-xs text-csl-dark underline underline-offset-2">
                        View subscription
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Full timeline link */}
              <div className="pt-1 border-t border-gray-100">
                <Link
                  href={`/member-portal/admin/members?q=${encodeURIComponent(m.email)}`}
                  className="text-xs font-medium text-csl-dark underline underline-offset-2"
                >
                  View full timeline in Admin Members
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
