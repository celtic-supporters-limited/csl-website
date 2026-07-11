import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import ResolutionAdminClient from "./ResolutionAdminClient";

export const metadata: Metadata = { title: "Resolution Signatures | CSL Admin" };
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

  const [signaturesRes, configRes] = await Promise.all([
    supabase
      .from("agm_signatures")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("site_config")
      .select("key, value")
      .eq("key", "resolution_target"),
  ]);

  const signatures = signaturesRes.data ?? [];
  const configMap = Object.fromEntries(
    (configRes.data ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
  );
  const resolutionTarget = parseInt(configMap["resolution_target"] ?? "100", 10);

  return (
    <PortalShell user={{ email: user.email!, id: user.id }} member={member}>
      <ResolutionAdminClient
        signatures={signatures}
        resolutionTarget={resolutionTarget}
      />
    </PortalShell>
  );
}
