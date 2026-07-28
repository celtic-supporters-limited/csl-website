import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import { getResolutionSigningState } from "@/lib/agm-signing-state";
import { SigningStateNotice } from "@/components/SigningStateNotice";
import ResolutionVersionsClient, { type VersionRow } from "./ResolutionVersionsClient";

export const metadata: Metadata = { title: "AGM Resolution Versions | CSL Admin" };
export const dynamic = "force-dynamic";

export default async function ResolutionVersionsPage() {
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

  const [versionsRes, signatureRefsRes, signingState] = await Promise.all([
    supabase
      .from("agm_resolution_versions")
      .select("id, version_label, body, declaration_text, consent_text, supporting_statement, is_placeholder, is_current, created_at, created_by, meeting_ref")
      .order("created_at", { ascending: false }),
    supabase
      .from("agm_signatures")
      .select("resolution_version_id"),
    getResolutionSigningState(),
  ]);

  // Signature count per version, computed here rather than a GROUP BY query:
  // there is no bulk-data volume in this campaign to justify the extra
  // round-trip a dedicated aggregate query would need.
  const countsByVersion = new Map<string, number>();
  for (const row of signatureRefsRes.data ?? []) {
    if (!row.resolution_version_id) continue;
    countsByVersion.set(
      row.resolution_version_id,
      (countsByVersion.get(row.resolution_version_id) ?? 0) + 1
    );
  }

  const versions: VersionRow[] = (versionsRes.data ?? []).map((v) => ({
    ...v,
    signatureCount: countsByVersion.get(v.id) ?? 0,
  }));

  return (
    <PortalShell user={{ email: user.email!, id: user.id }} member={member}>
      <div className="mb-5">
        <SigningStateNotice state={signingState} />
      </div>
      <ResolutionVersionsClient versions={versions} />
    </PortalShell>
  );
}
