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

  let headline: string;
  let blockedReason: string | null = null;

  if (canSign) {
    headline = `Signing: OPEN. Members can sign against "${currentVersionLabel}".`;
  } else if (!gateOpen && wordingIsPlaceholder) {
    headline = "Signing: CLOSED. Gate is closed and the wording is still a placeholder.";
  } else if (!gateOpen) {
    headline = "Signing: CLOSED. Gate is closed.";
  } else if (!hasCurrentVersion) {
    headline =
      "Signing: CLOSED. No resolution version is current. Opening the gate will not enable signing until one is.";
    blockedReason = "no resolution version is current";
  } else {
    headline =
      "Signing: CLOSED. The resolution wording is a placeholder. Opening the gate will not enable signing until a real version is current.";
    blockedReason = "the resolution wording is still a placeholder";
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
