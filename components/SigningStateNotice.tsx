import type { ResolutionSigningState } from "@/lib/agm-signing-state";

/**
 * One-line effective state for requisition signing.
 *
 * Presentational only. Renders whether signing is possible, and when it is not,
 * which lock is holding. Deliberately carries no version management: changing
 * the wording is Package 3.
 */
export function SigningStateNotice({ state }: { state: ResolutionSigningState }) {
  const open = state.canSign;

  return (
    <div
      className={`rounded-lg border px-3.5 py-2.5 ${
        open ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"
      }`}
    >
      <p
        className={`text-[0.82rem] font-semibold leading-snug ${
          open ? "text-green-800" : "text-amber-900"
        }`}
      >
        {state.headline}
      </p>
    </div>
  );
}
