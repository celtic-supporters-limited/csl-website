"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Opens and closes public signing of the AGM requisition.
 *
 * Mirrors MembershipGateToggle and PortalGateToggle deliberately: whoever
 * operates this on AGM week should find it behaving identically to the toggles
 * they already know.
 */
export default function ResolutionGateToggle({
  currentValue,
  blockedReason,
}: {
  currentValue: string | null;
  /**
   * Set when the gate is open but signing is still not possible, for example
   * because the current resolution version is a placeholder. The toggle must
   * not read as plainly "Open" in that case: that is the false belief this
   * whole notice exists to prevent.
   */
  blockedReason?: string | null;
}) {
  const isOpen = currentValue === "true";
  const openButBlocked = isOpen && !!blockedReason;
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setLoading(true);
    setError("");
    const newValue = isOpen ? "false" : "true";
    try {
      const res = await fetch("/api/admin/site-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "resolution_open", value: newValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        setLoading(false);
        setConfirming(false);
        return;
      }
      router.refresh();
      setLoading(false);
      setConfirming(false);
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
            isOpen && !openButBlocked
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-amber-50 border-amber-200 text-amber-700"
          }`}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              isOpen && !openButBlocked ? "bg-green-500" : "bg-amber-400"
            }`}
          />
          {openButBlocked ? "Open, not signing" : isOpen ? "Open" : "Closed"}
        </span>

        {!confirming && (
          <button
            onClick={() => setConfirming(true)}
            className="text-xs text-csl-dark hover:underline font-medium"
          >
            {isOpen ? "Close signing" : "Open signing"}
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-500">
        {openButBlocked
          ? `Gate is open, but signing is still blocked because ${blockedReason}. Nothing can be signed.`
          : isOpen
          ? "Open: any visitor can sign the requisition."
          : "Closed: the form is hidden and submissions are rejected."}
      </p>

      {confirming && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
          <span className="flex-1">
            {isOpen
              ? "This will stop the public signing the requisition. Confirm?"
              : "This publishes the requisition for signature. Only do this once the solicitor has confirmed the resolution wording. Confirm?"}
          </span>
          <button
            onClick={toggle}
            disabled={loading}
            className="font-semibold text-amber-900 hover:underline disabled:opacity-60 shrink-0"
          >
            {loading ? "Saving..." : "Yes, confirm"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="text-amber-600 hover:underline disabled:opacity-60 shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
