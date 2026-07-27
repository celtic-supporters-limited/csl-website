export function PaymentFailedBanner({
  onOpenBilling,
  loading,
  error,
}: {
  onOpenBilling: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 shadow-sm mb-6">
      <div className="flex gap-3 items-start">
        <span className="flex-shrink-0 text-red-500 text-xl leading-none mt-0.5">&#9888;</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-800 mb-2">
            Your last payment failed. Please update your payment details to keep your membership active.
          </p>
          {error && <p className="text-xs text-red-700 mb-2">{error}</p>}
          <button
            onClick={onOpenBilling}
            disabled={loading}
            className="inline-flex items-center px-4 py-2.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60 min-h-[44px]"
          >
            {loading ? "Opening..." : "Update payment method"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CancelledStatusBanner() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 shadow-sm mb-6">
      <div className="flex gap-3 items-start">
        <span className="flex-shrink-0 text-amber-500 text-xl leading-none mt-0.5">&#9888;</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-800">
            This membership has ended.
          </p>
          <p className="text-xs text-amber-700 mt-1">
            You are seeing this because you have admin access. This member&rsquo;s own portal access has ended.
          </p>
        </div>
      </div>
    </div>
  );
}

export function MembershipStatusBanner({
  status,
  onOpenBilling,
  billingLoading,
  billingError,
}: {
  status: string | null;
  onOpenBilling: () => void;
  billingLoading: boolean;
  billingError: string | null;
}) {
  if (status === "payment_failed") {
    return <PaymentFailedBanner onOpenBilling={onOpenBilling} loading={billingLoading} error={billingError} />;
  }
  if (status === "cancelled") {
    return <CancelledStatusBanner />;
  }
  return null;
}
