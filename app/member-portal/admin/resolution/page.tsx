import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import ResolutionAdminClient from "./ResolutionAdminClient";
import { getResolutionSigningState } from "@/lib/agm-signing-state";
import { SigningStateNotice } from "@/components/SigningStateNotice";
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

  const [signaturesRes, configRes, supportersRes, wordingsRes, signingState] = await Promise.all([
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
    // Every wording for this meeting, current and superseded alike. Split
    // into "current" and "history" client-side rather than two queries -
    // there is one row of the former and a handful of the latter.
    supabase
      .from("agm_resolution_versions")
      .select("id, version_label, body, declaration_text, consent_text, supporting_statement, is_placeholder, is_current, created_at")
      .eq("meeting_ref", currentMeetingRef)
      .order("created_at", { ascending: false }),
    getResolutionSigningState(),
  ]);

  const signatures = signaturesRes.data ?? [];
  const configMap = Object.fromEntries(
    (configRes.data ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
  );
  const resolutionTarget = parseInt(configMap["resolution_target"] ?? "100", 10);

  const wordings = wordingsRes.data ?? [];
  const currentWording = wordings.find((w) => w.is_current) ?? null;
  const wordingHistory = wordings.filter((w) => !w.is_current);

  return (
    <PortalShell user={{ email: user.email!, id: user.id }} member={member}>
      <div className="mb-5">
        <SigningStateNotice state={signingState} />
      </div>
      <ResolutionAdminClient
        signatures={signatures}
        supporterCount={supportersRes.count ?? 0}
        resolutionTarget={resolutionTarget}
        currentWording={currentWording}
        wordingHistory={wordingHistory}
      />
    </PortalShell>
  );
}
