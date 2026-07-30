import { getSupabase } from "@/lib/supabase";
import { isGateOpen } from "@/lib/site-gates";

/**
 * Whether the requisition can actually be signed, and why not when it cannot.
 *
 * Signing needs two independent conditions, and an admin looking at the gate
 * toggle can only see one of them. Opening the gate while the current
 * resolution version is still a placeholder changes nothing, which reads as a
 * broken toggle rather than a second safeguard doing its job.
 *
 * The headline leads with the effective state, because that is the question
 * being asked. The state of either individual lock is the explanation, not the
 * answer.
 *
 * Exactly three closed messages, deliberately not more: gate not open, no
 * wording saved at all, and wording saved but not finalised. Gate-closed is
 * reported as one state regardless of the wording underneath it - "closed and
 * also not finalised" is not a fourth thing a volunteer needs to act on
 * differently, it is the same action (open the gate) with an extra clause that
 * used to make the message longer without making it more actionable.
 *
 * The document label never appears here. It is an auto-generated timestamp in
 * the data, not something a reader can use - the wording itself is shown in
 * full on the same page, which is what "shown below" refers to.
 *
 * The proxy flow has no equivalent second condition of its own: proxy_mode
 * (see lib/site-gates.ts) is a single three-value control with no separate
 * "is the wording ready" lock behind it, so its own value already tells the
 * whole truth and needs no notice like this one.
 */

export type ResolutionSigningState = {
  /** Both conditions satisfied: the public can sign right now. */
  canSign: boolean;
  gateOpen: boolean;
  wordingIsPlaceholder: boolean;
  hasCurrentVersion: boolean;
  /** One line, leading with the effective state. */
  headline: string;
  /** Set when the gate is open but signing still is not possible. */
  blockedReason: string | null;
};

export async function getResolutionSigningState(): Promise<ResolutionSigningState> {
  const [gateOpen, versionRes] = await Promise.all([
    isGateOpen("resolution_open"),
    getSupabase()
      .from("agm_resolution_versions")
      .select("is_placeholder")
      .eq("is_current", true)
      .maybeSingle(),
  ]);

  const version = versionRes.data;
  const hasCurrentVersion = !!version;
  const wordingIsPlaceholder = !version || version.is_placeholder === true;

  const canSign = gateOpen && hasCurrentVersion && !wordingIsPlaceholder;

  let headline: string;
  let blockedReason: string | null = null;

  if (canSign) {
    headline = "Signing is open. Shareholders can sign the requisition below.";
  } else if (!gateOpen) {
    headline = "Signing is closed. The gate has not been opened yet.";
    blockedReason = "the gate has not been opened yet";
  } else if (!hasCurrentVersion) {
    headline = "Signing is closed. No wording has been saved yet.";
    blockedReason = "no wording has been saved yet";
  } else {
    headline = "Signing is closed. The wording has not been finalised.";
    blockedReason = "the wording has not been finalised";
  }

  return {
    canSign,
    gateOpen,
    wordingIsPlaceholder,
    hasCurrentVersion,
    headline,
    blockedReason,
  };
}
