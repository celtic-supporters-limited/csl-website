import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import ProxyAdminClient from "./ProxyAdminClient";
import { getConfigValue, getCurrentMeetingRef, getProxyMode } from "@/lib/site-gates";

export const metadata: Metadata = { title: "AGM Proxy | CSL Admin" };
export const dynamic = "force-dynamic";

export default async function ProxyAdminPage() {
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

  const [mode, appointmentsRes, interestRes, declarationText] = await Promise.all([
    getProxyMode(),
    // Scoped to the active meeting - with one meeting this excludes nothing;
    // next year it stops a second AGM's appointments inflating this register.
    supabase
      .from("agm_proxies")
      .select("*")
      .eq("meeting_ref", currentMeetingRef)
      .order("created_at", { ascending: false }),
    // Registered interest lives in shareholder_cases, not agm_proxies - an
    // intention is not an appointment. Fetched here, not on the Cases page,
    // because the day Celtic issues the Notice of AGM this is the list CSL
    // actually works from for its first appointment-campaign email.
    supabase
      .from("shareholder_cases")
      .select("id, contact_name, email, phone, notes, enquiry_source, consent_given, privacy_policy_version, created_at")
      .eq("case_type", "Proxy Interest")
      .eq("meeting_ref", currentMeetingRef)
      .order("created_at", { ascending: false }),
    getConfigValue("proxy_declaration_text"),
  ]);

  return (
    <PortalShell user={{ email: user.email!, id: user.id }} member={member}>
      <ProxyAdminClient
        meetingRef={currentMeetingRef}
        mode={mode}
        appointments={appointmentsRes.data ?? []}
        registeredInterest={interestRes.data ?? []}
        declarationText={declarationText}
      />
    </PortalShell>
  );
}
