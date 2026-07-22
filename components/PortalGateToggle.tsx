"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PortalGateToggle({
  currentValue,
}: {
  currentValue: string | null;
}) {
  const isOpen = currentValue === "true";
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
        body: JSON.stringify({ key: "portal_open", value: newValue }),
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
            isOpen
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-amber-50 border-amber-200 text-amber-700"
          }`}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              isOpen ? "bg-green-500" : "bg-amber-400"
            }`}
          />
          {isOpen ? "Open" : "Closed"}
        </span>

        {!confirming && (
          <button
            onClick={() => setConfirming(true)}
            className="text-xs text-csl-dark hover:underline font-medium"
          >
            {isOpen ? "Close portal" : "Open portal"}
          </button>
        )}
      </div>

      {confirming && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
          <span className="flex-1">
            {isOpen
              ? "This will redirect all non-admin members to the holding page. Confirm?"
              : "This will allow all active members to access the portal. Confirm?"}
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

      {error && (
        <p className="text-[11px] text-red-600">{error}</p>
      )}
    </div>
  );
}
