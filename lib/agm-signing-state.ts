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
 * The proxy gate has no equivalent second condition: proxy_open is the only
 * thing standing between the public and /proxy, so its toggle already tells the
 * whole truth.
 */

export type ResolutionSigningState = {
  /** Both conditions satisfied: the public can sign right now. */
  canSign: boolean;
  gateOpen: boolean;
  wordingIsPlaceholder: boolean;
  hasCurrentVersion: boolean;
  currentVersionLabel: string | null;
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
      .select("version_label, is_placeholder")
      .eq("is_current", true)
      .maybeSingle(),
  ]);

  const version = versionRes.data;
  const hasCurrentVersion = !!version;
  const wordingIsPlaceholder = !version || version.is_placeholder === true;
  const currentVersionLabel = version?.version_label ?? null;

  const canSign = gateOpen && hasCurrentVersion && !wordingIsPlaceholder;

  // "Shareholders", never "members" or "people": many signatories are not CSL
  // members, and the point of this line is who is actually signing. "Final",
  // never "placeholder": this headline is read by two volunteers who are not
  // technical, and neither word means anything to them that "final" does not
  // say more plainly.
  let headline: string;
  let blockedReason: string | null = null;

  if (canSign) {
    headline = `Signing: OPEN. Shareholders are signing "${currentVersionLabel}".`;
  } else if (!gateOpen && wordingIsPlaceholder) {
    headline = "Signing: CLOSED. Gate is closed and the wording has not been finalised.";
  } else if (!gateOpen) {
    headline = "Signing: CLOSED. Gate is closed.";
  } else if (!hasCurrentVersion) {
    headline =
      "Signing: CLOSED. No wording has been saved yet. Opening the gate will not enable signing until it is.";
    blockedReason = "no wording has been saved yet";
  } else {
    headline =
      "Signing: CLOSED. The wording has not been finalised. Opening the gate will not enable signing until it is marked final.";
    blockedReason = "the wording has not been finalised";
  }

  return {
    canSign,
    gateOpen,
    wordingIsPlaceholder,
    hasCurrentVersion,
    currentVersionLabel,
    headline,
    blockedReason,
  };
}
