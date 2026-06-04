import type { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase";
import { Container } from "@/components/Container";
import DocumentLibrary from "@/components/DocumentLibrary";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Document Library | CSL Member Portal",
  description: "CSL governance documents, meeting minutes, and research papers — available to all active members.",
};

export type MemberDocument = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  drive_url: string;
  file_type: string;
  published_at: string;
};

async function getDocuments(): Promise<MemberDocument[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, description, category, drive_url, file_type, published_at")
    .eq("members_only", true)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("[documents] Supabase fetch error:", error.message);
    return [];
  }
  return (data ?? []) as MemberDocument[];
}

export default async function DocumentLibraryPage() {
  const documents = await getDocuments();

  return (
    <main className="min-h-screen bg-csl-light">
      <Container className="py-8 md:py-12">
        <Link
          href="/member-portal"
          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm mb-6 transition-colors"
        >
          &#8592; Member Portal
        </Link>
        <DocumentLibrary documents={documents} />
      </Container>
    </main>
  );
}
