import type { Metadata } from "next";
import { getSupabase } from "@/lib/supabase";
import { Container } from "@/components/Container";
import LibraryClient from "@/components/LibraryClient";
import Link from "next/link";
import type { PortalEvent } from "@/app/member-portal/PortalClient";
import type { MemberDocument } from "@/components/DocumentCard";

export const metadata: Metadata = {
  title: "Library | CSL Member Portal",
  description: "CSL members meetings, recordings, and governance documents.",
};

async function getEvents(): Promise<PortalEvent[]> {
  const { data } = await getSupabase()
    .from("events")
    .select("id, title, event_date, description, recording_url, slides_url, minutes_url, members_only")
    .eq("members_only", true)
    .order("event_date", { ascending: false });
  return (data ?? []) as PortalEvent[];
}

async function getDocuments(): Promise<MemberDocument[]> {
  const { data, error } = await getSupabase()
    .from("documents")
    .select("id, title, description, category, drive_url, file_type, published_at")
    .eq("members_only", true)
    .order("published_at", { ascending: false });
  if (error) {
    console.error("[library] documents fetch error:", error.message);
    return [];
  }
  return (data ?? []) as MemberDocument[];
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const tab = searchParams.tab === "documents" ? "documents" : "meetings";
  const [events, documents] = await Promise.all([getEvents(), getDocuments()]);

  return (
    <main className="min-h-screen bg-csl-light">
      <Container className="py-8 md:py-12">
        <Link
          href="/member-portal"
          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm mb-6 transition-colors"
        >
          &#8592; Member Portal
        </Link>
        <LibraryClient events={events} documents={documents} initialTab={tab} />
      </Container>
    </main>
  );
}
