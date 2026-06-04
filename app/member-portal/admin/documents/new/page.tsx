import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { Container } from "@/components/Container";
import Link from "next/link";
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
    .select("is_admin")
    .eq("email", user.email)
    .maybeSingle();

  if (!member?.is_admin) redirect("/member-portal");

  return (
    <main className="min-h-screen bg-csl-light">
      <Container className="py-8 md:py-12">
        <Link
          href="/member-portal"
          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm mb-6 transition-colors"
        >
          &#8592; Member Portal
        </Link>
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Add Document</h1>
          <p className="text-gray-500 text-sm mb-8">
            Upload the file to the CSL Google Drive folder first, then paste the shareable link below.
          </p>
          <AdminDocumentForm />
        </div>
      </Container>
    </main>
  );
}
