import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import ResolutionAdminClient from "./ResolutionAdminClient";
import { getResolutionSigningState } from "@/lib/agm-signing-state";
import { SigningStateNotice } from "@/components/SigningStateNotice";
import { getCurrentMeetingRef } from "@/lib/site-gates";

export const metadata: Metadata = { title: "AGM Resolution Progress | CSL Admin" };
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

  const [signaturesRes, configRes, supportersRes, versionsRes, signingState] = await Promise.all([
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
    supabase
      .from("agm_resolution_versions")
      .select("id, version_label"),
    getResolutionSigningState(),
  ]);

  const signatures = signaturesRes.data ?? [];
  const configMap = Object.fromEntries(
    (configRes.data ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
  );
  const resolutionTarget = parseInt(configMap["resolution_target"] ?? "100", 10);

  // Resolved here rather than in the client so the CSV can state which wording
  // each person signed, not just an opaque id.
  const versionLabels = Object.fromEntries(
    ((versionsRes.data ?? []) as { id: string; version_label: string }[])
      .map((v) => [v.id, v.version_label])
  );

  return (
    <PortalShell user={{ email: user.email!, id: user.id }} member={member}>
      <div className="mb-5">
        <SigningStateNotice state={signingState} />
      </div>
      <ResolutionAdminClient
        signatures={signatures}
        supporterCount={supportersRes.count ?? 0}
        resolutionTarget={resolutionTarget}
        versionLabels={versionLabels}
      />
    </PortalShell>
  );
}
