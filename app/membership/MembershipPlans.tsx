"use client";

import { useState, useRef } from "react";
import type { PlanType } from "@/lib/stripe";

interface SelectedPlan {
  type: PlanType;
  label: string;
  priceDisplay: string;
  amount?: number;
}

interface TierFeature {
  text: string;
}

const CHECK = (
  <span className="text-csl-dark font-bold flex-shrink-0" aria-hidden>
    ✓
  </span>
);

function FeatureList({ features }: { features: TierFeature[] }) {
  return (
    <ul className="flex flex-col gap-2 mb-5 flex-1">
      {features.map((f) => (
        <li key={f.text} className="flex gap-2 items-start text-[0.875rem] text-gray-600">
          {CHECK} {f.text}
        </li>
      ))}
    </ul>
  );
}

const STANDARD_FEATURES: TierFeature[] = [
  { text: "Full CSL membership" },
  { text: "Members-only meeting recordings" },
  { text: "Governance updates & briefings" },
  { text: "Cancel any time" },
];

const LIFETIME_FEATURES: TierFeature[] = [
  { text: "Full CSL membership for life" },
  { text: "All member events and recordings" },
  { text: "Governance updates & briefings" },
  { text: "Permanent record as CSL supporter" },
];

const CUSTOM_FEATURES: TierFeature[] = [
  { text: "Full CSL membership" },
  { text: "All standard member benefits" },
  { text: "Cancel any time" },
];

export default function MembershipPlans() {
  const [selected, setSelected] = useState<SelectedPlan | null>(null);
  const [customMonthly, setCustomMonthly] = useState("30");
  const [customAnnual, setCustomAnnual] = useState("300");
  const [customMonthlyError, setCustomMonthlyError] = useState("");
  const [customAnnualError, setCustomAnnualError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const summaryRef = useRef<HTMLDivElement>(null);

  function selectPlan(plan: SelectedPlan) {
    setSelected(plan);
    setCheckoutError("");
    setTimeout(
      () => summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50
    );
  }

  function handleCustomMonthly() {
    const val = parseInt(customMonthly, 10);
    if (!val || val < 30 || val % 5 !== 0) {
      setCustomMonthlyError("Please enter a valid amount (min £30, multiples of £5).");
      return;
    }
    setCustomMonthlyError("");
    selectPlan({
      type: "custom_monthly",
      label: `Custom Monthly — £${val}/month`,
      priceDisplay: `£${val} / month`,
      amount: val,
    });
  }

  function handleCustomAnnual() {
    const val = parseInt(customAnnual, 10);
    if (!val || val < 300 || val % 10 !== 0) {
      setCustomAnnualError("Please enter a valid amount (min £300, multiples of £10).");
      return;
    }
    setCustomAnnualError("");
    selectPlan({
      type: "custom_annual",
      label: `Custom Annual — £${val}/year`,
      priceDisplay: `£${val} / year`,
      amount: val,
    });
  }

  async function proceedToStripe() {
    if (!selected) return;
    setLoading(true);
    setCheckoutError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selected.type, amount: selected.amount }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setCheckoutError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setCheckoutError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  const cardBase =
    "relative flex flex-col bg-white rounded-xl border-[1.5px] border-gray-200 p-7 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5";
  const cardFeatured =
    "relative flex flex-col bg-white rounded-xl border-[1.5px] border-csl-dark shadow-lg -translate-y-1 p-7 transition-all duration-200";

  const btnOutline =
    "w-full flex justify-center items-center py-2.5 rounded-lg text-[0.88rem] font-semibold border-[1.5px] border-csl-dark text-csl-dark hover:bg-csl-light transition-colors duration-200 mt-auto";
  const btnPrimary =
    "w-full flex justify-center items-center py-2.5 rounded-lg text-[0.88rem] font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200 mt-auto";

  return (
    <>
      {/* ── Row 1: Standard | Accelerator | Lifetime ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">

        {/* Standard */}
        <div className={cardBase}>
          <p className="text-[0.8rem] font-bold uppercase tracking-widest text-gray-400 mb-2.5">
            Standard
          </p>
          <div className="text-[2.6rem] font-black text-csl-dark leading-none mb-1">
            <sup className="text-[1.2rem] align-super">£</sup>10
          </div>
          <p className="text-[0.84rem] text-gray-400 mb-1.5">Per Month</p>
          <hr className="border-gray-100 my-4" />
          <p className="text-[0.875rem] text-gray-600 leading-relaxed mb-5 flex-1">
            Help activate the supporter base and fund the work needed to trace
            shares, build membership and establish CSL as a credible shareholder
            organisation.
          </p>
          <FeatureList features={STANDARD_FEATURES} />
          <button
            className={btnOutline}
            onClick={() =>
              selectPlan({
                type: "standard",
                label: "Standard — £10/month",
                priceDisplay: "£10 / month",
              })
            }
          >
            Choose
          </button>
        </div>

        {/* Accelerator — featured */}
        <div className={cardFeatured}>
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-csl-dark text-white text-[0.72rem] font-bold uppercase tracking-widest px-3.5 py-1 rounded-full whitespace-nowrap">
            Most Chosen
          </div>
          <p className="text-[0.8rem] font-bold uppercase tracking-widest text-gray-400 mb-2.5">
            Accelerator
          </p>
          <div className="text-[2.6rem] font-black text-csl-dark leading-none mb-1">
            <sup className="text-[1.2rem] align-super">£</sup>25
          </div>
          <p className="text-[0.84rem] text-gray-400 mb-1.5">Per Month</p>
          <hr className="border-gray-100 my-4" />
          <p className="text-[0.875rem] text-gray-600 leading-relaxed mb-5 flex-1">
            Accelerate CSL&apos;s work. Your support helps fund share purchases,
            professional advice and the infrastructure needed to build real
            voting strength.
          </p>
          <FeatureList features={STANDARD_FEATURES} />
          <button
            className={btnPrimary}
            onClick={() =>
              selectPlan({
                type: "accelerator",
                label: "Accelerator — £25/month",
                priceDisplay: "£25 / month",
              })
            }
          >
            Choose
          </button>
        </div>

        {/* Lifetime */}
        <div className={`${cardBase} sm:col-span-2 lg:col-span-1`}>
          <p className="text-[0.8rem] font-bold uppercase tracking-widest text-gray-400 mb-2.5">
            Lifetime
          </p>
          <div className="text-[2rem] font-black text-csl-dark leading-none mb-1">
            <sup className="text-[1.1rem] align-super">£</sup>5,000
          </div>
          <p className="text-[0.84rem] text-gray-400 mb-1.5">
            One-off payment — no further charges
          </p>
          <hr className="border-gray-100 my-4" />
          <p className="text-[0.875rem] text-gray-600 leading-relaxed mb-5 flex-1">
            For supporters who want to contribute a one-time fee, reflecting
            their means and commitment for life.
          </p>
          <FeatureList features={LIFETIME_FEATURES} />
          <button
            className={btnOutline}
            onClick={() =>
              selectPlan({
                type: "lifetime",
                label: "Lifetime Membership",
                priceDisplay: "£5,000 — one-off payment",
                amount: 5000,
              })
            }
          >
            Choose
          </button>
        </div>
      </div>

      {/* ── Row 2: Custom Monthly | Custom Annual ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-[680px] mx-auto">

        {/* Custom Monthly */}
        <div className={cardBase}>
          <p className="text-[0.8rem] font-bold uppercase tracking-widest text-gray-400 mb-2.5">
            Custom Monthly
          </p>
          <div className="text-[1.5rem] font-black text-csl-dark leading-none mb-1">
            £30+
          </div>
          <p className="text-[0.84rem] text-gray-400 mb-1.5">
            Per Month — in £5 increments
          </p>
          <hr className="border-gray-100 my-4" />
          <p className="text-[0.875rem] text-gray-600 leading-relaxed mb-4 flex-1">
            For supporters who want to contribute more, in a way that reflects
            their means and commitment. Minimum £30/month.
          </p>
          <FeatureList features={CUSTOM_FEATURES} />

          <div className="mb-4">
            <div className="flex gap-2 items-center mb-1">
              <label htmlFor="custom-monthly" className="text-[0.875rem] font-semibold whitespace-nowrap">
                Amount:
              </label>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-csl-dark text-[0.95rem]">
                  £
                </span>
                <input
                  id="custom-monthly"
                  type="number"
                  min={30}
                  step={5}
                  value={customMonthly}
                  onChange={(e) => {
                    setCustomMonthly(e.target.value);
                    setCustomMonthlyError("");
                  }}
                  className="w-full pl-7 pr-3 py-2 border-[1.5px] border-gray-200 rounded-lg text-base font-bold text-csl-dark focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10"
                />
              </div>
              <span className="text-[0.875rem] text-gray-400">/month</span>
            </div>
            <p className="text-[0.75rem] text-gray-400">Minimum £30 — £5 increments</p>
            {customMonthlyError && (
              <p className="text-[0.75rem] text-red-600 mt-1">{customMonthlyError}</p>
            )}
          </div>

          <button className={btnOutline} onClick={handleCustomMonthly}>
            Choose
          </button>
        </div>

        {/* Custom Annual */}
        <div className={cardBase}>
          <p className="text-[0.8rem] font-bold uppercase tracking-widest text-gray-400 mb-2.5">
            Custom Annual
          </p>
          <div className="text-[1.5rem] font-black text-csl-dark leading-none mb-1">
            £300+
          </div>
          <p className="text-[0.84rem] text-gray-400 mb-1.5">
            Per Year — in £10 increments
          </p>
          <hr className="border-gray-100 my-4" />
          <p className="text-[0.875rem] text-gray-600 leading-relaxed mb-4 flex-1">
            For supporters who want to contribute more, in a way that reflects
            their means and commitment. Minimum £300/year.
          </p>
          <FeatureList features={[
            { text: "Full CSL membership" },
            { text: "All standard member benefits" },
            { text: "Annual commitment to the cause" },
          ]} />

          <div className="mb-4">
            <div className="flex gap-2 items-center mb-1">
              <label htmlFor="custom-annual" className="text-[0.875rem] font-semibold whitespace-nowrap">
                Amount:
              </label>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-csl-dark text-[0.95rem]">
                  £
                </span>
                <input
                  id="custom-annual"
                  type="number"
                  min={300}
                  step={10}
                  value={customAnnual}
                  onChange={(e) => {
                    setCustomAnnual(e.target.value);
                    setCustomAnnualError("");
                  }}
                  className="w-full pl-7 pr-3 py-2 border-[1.5px] border-gray-200 rounded-lg text-base font-bold text-csl-dark focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10"
                />
              </div>
              <span className="text-[0.875rem] text-gray-400">/year</span>
            </div>
            <p className="text-[0.75rem] text-gray-400">Minimum £300 — £10 increments</p>
            {customAnnualError && (
              <p className="text-[0.75rem] text-red-600 mt-1">{customAnnualError}</p>
            )}
          </div>

          <button className={btnOutline} onClick={handleCustomAnnual}>
            Choose
          </button>
        </div>
      </div>

      {/* ── Checkout summary panel ── */}
      {selected && (
        <div
          ref={summaryRef}
          className="mt-9 max-w-[560px] mx-auto bg-csl-light border border-csl-dark/20 rounded-2xl p-8 text-center scroll-mt-24"
        >
          <span className="inline-block bg-csl-dark/10 text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
            {selected.label}
          </span>
          <h3 className="text-[1.1rem] font-extrabold text-csl-dark mb-2">
            Complete Your Membership
          </h3>
          <div className="text-[2rem] font-black text-csl-dark mb-5">
            {selected.priceDisplay}
          </div>
          <p className="text-[0.9rem] text-gray-600 mb-6">
            Your payment is processed securely by Stripe. CSL never stores your
            card details.
          </p>

          {checkoutError && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-[0.88rem]">
              {checkoutError}
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={proceedToStripe}
              disabled={loading}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-[10px] text-base font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Redirecting..." : "🔒  Proceed to Stripe"}
            </button>
            <button
              onClick={() => {
                setSelected(null);
                setCheckoutError("");
              }}
              className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold border-[1.5px] border-csl-dark text-csl-dark hover:bg-white transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
          <p className="text-[0.8rem] text-gray-400 mt-4">
            🔒 Secured by Stripe &nbsp;&middot;&nbsp; Test mode: use card 4242 4242 4242 4242
          </p>
        </div>
      )}
    </>
  );
}
