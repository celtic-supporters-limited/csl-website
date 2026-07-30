"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ProxyMode = "closed" | "interest" | "appointment";

const MODES: { value: ProxyMode; label: string; dot: string }[] = [
  { value: "closed",      label: "Closed",      dot: "bg-amber-400" },
  { value: "interest",    label: "Interest",    dot: "bg-blue-400" },
  { value: "appointment", label: "Appointment", dot: "bg-green-500" },
];

const MODE_DESC: Record<ProxyMode, string> = {
  closed: "Closed: the page explains itself but captures nothing.",
  interest: "Interest: visitors can register intent to proxy on /proxy. Not an appointment - nothing is lodged.",
  appointment: "Appointment: visitors can complete a full proxy appointment naming the CSL appointee. Only turn this on once Celtic plc has issued the Notice of AGM.",
};

const CONFIRM_TEXT: Record<ProxyMode, string> = {
  closed: "This hides the proxy form entirely and rejects any submission. Confirm?",
  interest: "This opens expression-of-interest capture. It is not an appointment and lodges nothing. Confirm?",
  appointment: "This opens full proxy appointment capture. A proxy is specific to one meeting, so only do this once Celtic plc has issued the Notice of AGM. Confirm?",
};

/**
 * Three-way selector for the proxy flow, replacing the old open/closed
 * toggle. A proxy is specific to one meeting and can only be appointed after
 * Celtic issues the Notice of AGM - before that, the page can still usefully
 * capture intent, which is why this is three states rather than a boolean.
 */
export default function ProxyGateToggle({
  currentValue,
}: {
  currentValue: string | null;
}) {
  const current: ProxyMode =
    currentValue === "interest" || currentValue === "appointment" ? currentValue : "closed";
  const router = useRouter();
  const [pending, setPending] = useState<ProxyMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function setMode(mode: ProxyMode) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/site-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "proxy_mode", value: mode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        setLoading(false);
        setPending(null);
        return;
      }
      router.refresh();
      setLoading(false);
      setPending(null);
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setPending(m.value)}
            disabled={loading || m.value === current}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors disabled:cursor-default ${
              m.value === current
                ? "bg-csl-dark border-csl-dark text-white"
                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${m.value === current ? "bg-white" : m.dot}`} />
            {m.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-gray-500">{MODE_DESC[current]}</p>

      {pending && pending !== current && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
          <span className="flex-1">{CONFIRM_TEXT[pending]}</span>
          <button
            onClick={() => setMode(pending)}
            disabled={loading}
            className="font-semibold text-amber-900 hover:underline disabled:opacity-60 shrink-0"
          >
            {loading ? "Saving..." : "Yes, confirm"}
          </button>
          <button
            onClick={() => setPending(null)}
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
