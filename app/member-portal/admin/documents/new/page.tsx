import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import AdminDocumentForm from "@/components/AdminDocumentForm";

export const metadata: Metadata = {
  title: "Add Document | CSL Member Portal",
};

export default async function AdminNewDocumentPage() {
  const authClient = createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) redirect("/login");

  const { data: member } = await getSupabase()
    .from("members")
    .select("first_name, last_name, name, membership_tier, plan_name, status, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member?.is_admin) redirect("/member-portal");

  return (
    <PortalShell user={{ email: user.email, id: user.id }} member={member}>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Add Document</h1>
        <p className="text-gray-500 text-sm mb-8">
          Upload the file to the CSL Google Drive folder first, then paste the shareable link below.
        </p>
        <AdminDocumentForm />
      </div>
    </PortalShell>
  );
}
