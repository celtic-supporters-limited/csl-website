import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import CasesAdmin from "@/components/CasesAdmin";
import type { Case } from "@/components/CasesAdmin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cases | CSL Admin",
};

export default async function AdminCasesPage() {
  const serverSupabase = createServerSupabase();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();

  if (!user) redirect("/login");

  const supabase = getSupabase();

  const { data: member } = await supabase
    .from("members")
    .select("id, email, name, first_name, last_name, membership_tier, plan_name, status, is_admin, user_id")
    .eq("user_id", user.id)
    .single();

  if (!member?.is_admin) redirect("/member-portal");

  const { data: cases, error } = await supabase
    .from("shareholder_cases")
    .select("id, contact_name, email, phone, case_type, enquiry_source, notes, status, assigned_to, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/cases] fetch error:", error.message);
  }

  return (
    <PortalShell user={{ email: user.email ?? "", id: user.id }} member={member}>
      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Cases</h1>
          <p className="text-sm text-gray-400 mt-1">
            Proxy assignment and share tracing enquiries. Update status inline; the member sees it in My Enquiries.
          </p>
        </div>

        <CasesAdmin initialCases={(cases ?? []) as Case[]} />
      </div>
    </PortalShell>
  );
}
