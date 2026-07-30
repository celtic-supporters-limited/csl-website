import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import ResolutionAdminClient from "./ResolutionAdminClient";
import { getResolutionSigningState } from "@/lib/agm-signing-state";
import { getCurrentMeetingRef } from "@/lib/site-gates";

export const metadata: Metadata = { title: "AGM Resolution | CSL Admin" };
export const dynamic = "force-dynamic";

export default async function ResolutionAdminPage() {
  const authClient = await createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect("/login");

  const supabase = getSupabase();

  const { data: member } = await supabase
    .from("members")
    .select("first_name, last_name, name, membership_tier, plan_name, status, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member?.is_admin) redirect("/member-portal");

  const currentMeetingRef = await getCurrentMeetingRef();

  const [signaturesRes, configRes, supportersRes, currentWordingRes, signingState] = await Promise.all([
    // Scoped to the active meeting. With one meeting this excludes nothing;
    // next year it stops a second AGM's signatures inflating this tracker.
    supabase
      .from("agm_signatures")
      .select("*")
      .eq("meeting_ref", currentMeetingRef)
      .order("created_at", { ascending: false }),
    supabase
      .from("site_config")
      .select("key, value")
      .eq("key", "resolution_target"),
    supabase
      .from("agm_supporters")
      .select("id", { count: "exact", head: true })
      .eq("meeting_ref", currentMeetingRef),
    // Only the current wording is fetched. Superseded wordings still exist as
    // rows - the immutability trigger and FK are unchanged - but this page no
    // longer has an interface for reading them, so there is no reason to
    // fetch a history list here any more.
    supabase
      .from("agm_resolution_versions")
      .select("id, version_label, body, declaration_text, consent_text, supporting_statement, is_placeholder, is_current, created_at")
      .eq("meeting_ref", currentMeetingRef)
      .eq("is_current", true)
      .maybeSingle(),
    getResolutionSigningState(),
  ]);

  const signatures = signaturesRes.data ?? [];
  const configMap = Object.fromEntries(
    (configRes.data ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
  );
  const resolutionTarget = parseInt(configMap["resolution_target"] ?? "100", 10);

  // Labels for the CSV export only, not for anything rendered on this page.
  // The export is an audit trail that leaves the system, so it still needs
  // to say which wording each signature was bound to - fetched here as a
  // targeted lookup against exactly the ids these signatures reference,
  // rather than a full history list kept around for the UI to read.
  const referencedVersionIds = Array.from(
    new Set(signatures.map((s) => s.resolution_version_id).filter((id): id is string => !!id))
  );
  const versionLabels: Record<string, string> = {};
  if (referencedVersionIds.length > 0) {
    const { data: labelRows } = await supabase
      .from("agm_resolution_versions")
      .select("id, version_label")
      .in("id", referencedVersionIds);
    for (const row of labelRows ?? []) versionLabels[row.id] = row.version_label;
  }

  return (
    <PortalShell user={{ email: user.email!, id: user.id }} member={member}>
      <ResolutionAdminClient
        meetingRef={currentMeetingRef}
        signingState={signingState}
        signatures={signatures}
        supporterCount={supportersRes.count ?? 0}
        resolutionTarget={resolutionTarget}
        currentWording={currentWordingRes.data}
        versionLabels={versionLabels}
      />
    </PortalShell>
  );
}
