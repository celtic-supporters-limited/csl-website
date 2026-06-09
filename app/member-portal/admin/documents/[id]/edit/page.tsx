import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";
import AdminDocumentEditForm from "@/components/AdminDocumentEditForm";

export const metadata: Metadata = {
  title: "Edit Document | CSL Member Portal",
};

export default async function EditDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const authClient = createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) redirect("/login");

  const db = getSupabase();
  const { data: member } = await db
    .from("members")
    .select("first_name, last_name, name, membership_tier, plan_name, status, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member?.is_admin) redirect("/member-portal");

  const { data: doc } = await db
    .from("documents")
    .select("id, title, description, category, drive_url, published_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!doc) notFound();

  // published_at is stored as timestamptz; extract YYYY-MM-DD for the date input
  const publishedDate = doc.published_at.slice(0, 10);

  return (
    <PortalShell user={{ email: user.email, id: user.id }} member={member}>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Edit Document</h1>
        <p className="text-gray-500 text-sm mb-8">
          Update the document details below. The Google Drive file itself is not affected.
        </p>
        <AdminDocumentEditForm
          id={doc.id}
          initial={{
            title: doc.title,
            description: doc.description ?? "",
            category: doc.category,
            drive_url: doc.drive_url ?? "",
            published_at: publishedDate,
          }}
        />
      </div>
    </PortalShell>
  );
}
