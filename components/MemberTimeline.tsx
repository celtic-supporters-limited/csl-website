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

export type LiveStripe = {
  subscriptionStatus: string | null;
  nextPaymentDate: string | null;
  nextPaymentAmount: number | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpiry: string | null;
  stripeCustomerUrl: string | null;
  stripeSubscriptionUrl: string | null;
  recentCharges: {
    date: string;
    amount: number;
    currency: string;
    status: string;
    description: string;
  }[];
};

type MemberSummary = {
  name: string;
  email: string;
  plan: string;
  status: string;
  joinedAt: string;
  isLifetime?: boolean;
  paymentFailedAt?: string | null;
  pendingEmail?: string | null;
};

type Props = {
  member: MemberSummary;
  entries: TimelineEntry[];
  defaultShowTest?: boolean;
  liveStripe?: LiveStripe | null;
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

function formatGbp(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function StatusPill({ status }: { status: string }) {
  const cfg =
    status === "active"         ? { cls: "bg-green-100 text-green-800 border-green-200", label: "Active" } :
    status === "payment_failed" ? { cls: "bg-red-100 text-red-800 border-red-200",       label: "Payment failed" } :
    status === "cancelled"      ? { cls: "bg-gray-100 text-gray-600 border-gray-200",    label: "Cancelled" } :
                                  { cls: "bg-gray-100 text-gray-600 border-gray-200",    label: status };
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function borderColor(status: string) {
  if (status === "active")         return "border-l-green-500";
  if (status === "payment_failed") return "border-l-red-500";
  return "border-l-gray-300";
}

export default function MemberTimeline({ member, entries, defaultShowTest, liveStripe }: Props) {
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

  const stripe = liveStripe ?? null;

  return (
    <div>
      {/* Member card */}
      <div className={`bg-white border border-gray-200 border-l-4 ${borderColor(member.status)} rounded-lg mb-4 overflow-hidden`}>
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900 text-base leading-tight">{member.name}</p>
            <p className="text-sm text-gray-500 mt-0.5">{member.email}</p>
          </div>
          <StatusPill status={member.status} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          {/* Left: membership */}
          <div className="px-4 py-3 space-y-1.5 text-xs">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Membership</p>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">Plan</span>
              <span className="font-medium text-gray-900 text-right">{member.plan}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">Joined</span>
              <span className="font-medium text-gray-900 text-right">{formatDate(member.joinedAt)}</span>
            </div>
            {member.isLifetime && (
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Lifetime member</span>
                <span className="font-medium text-gray-900">Yes</span>
              </div>
            )}
            {member.paymentFailedAt && (
              <div className="flex justify-between gap-2">
                <span className="text-red-500">Payment failed at</span>
                <span className="font-medium text-red-700 text-right">{formatDate(member.paymentFailedAt)}</span>
              </div>
            )}
            {member.pendingEmail && (
              <div className="flex justify-between gap-2">
                <span className="text-amber-600">Pending email change</span>
                <span className="font-medium text-amber-800 text-right break-all">{member.pendingEmail}</span>
              </div>
            )}
          </div>

          {/* Right: live Stripe billing */}
          <div className="px-4 py-3 space-y-1.5 text-xs">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Live billing</p>
            {!stripe ? (
              <p className="text-gray-400 italic">No Stripe customer record</p>
            ) : (
              <>
                {stripe.subscriptionStatus && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Subscription</span>
                    <span className="font-medium text-gray-900 capitalize">{stripe.subscriptionStatus}</span>
                  </div>
                )}
                {stripe.nextPaymentDate && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Next payment</span>
                    <span className="font-medium text-gray-900 text-right">
                      {formatDate(stripe.nextPaymentDate)}
                      {stripe.nextPaymentAmount != null && ` (${formatGbp(stripe.nextPaymentAmount)})`}
                    </span>
                  </div>
                )}
                {stripe.cardBrand && stripe.cardLast4 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Card</span>
                    <span className="font-medium text-gray-900 capitalize text-right">
                      {stripe.cardBrand} ending {stripe.cardLast4}
                      {stripe.cardExpiry && `, exp ${stripe.cardExpiry}`}
                    </span>
                  </div>
                )}
                {!stripe.subscriptionStatus && !stripe.cardLast4 && (
                  <p className="text-gray-400 italic">No active subscription</p>
                )}
                {(stripe.stripeCustomerUrl || stripe.stripeSubscriptionUrl) && (
                  <div className="flex gap-3 pt-0.5">
                    {stripe.stripeCustomerUrl && (
                      <a href={stripe.stripeCustomerUrl} target="_blank" rel="noreferrer"
                        className="text-csl-dark underline underline-offset-2">
                        Customer
                      </a>
                    )}
                    {stripe.stripeSubscriptionUrl && (
                      <a href={stripe.stripeSubscriptionUrl} target="_blank" rel="noreferrer"
                        className="text-csl-dark underline underline-offset-2">
                        Subscription
                      </a>
                    )}
                  </div>
                )}
                {stripe.recentCharges.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Recent charges</p>
                    <div className="space-y-1">
                      {stripe.recentCharges.map((c, i) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <span className="text-gray-400">{new Date(c.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                          <span className="text-gray-600 flex-1 truncate text-center">{c.description || "-"}</span>
                          <span className={`font-semibold shrink-0 ${c.status === "succeeded" ? "text-green-700" : "text-red-600"}`}>
                            {formatGbp(c.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
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
          <label className="ml-auto flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer select-none">
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
