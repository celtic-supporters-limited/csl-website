import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalClient from "./PortalClient";
import type { Member, PortalEvent, PortalCase } from "./PortalClient";

export const metadata: Metadata = {
  title: "Member Portal | Celtic Supporters Limited",
  description: "Your CSL member dashboard - subscription, recordings, and enquiries.",
};

export default async function MemberPortalPage() {
  // Check Supabase is configured
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return (
      <main className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-csl-light px-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 max-w-md text-center">
          <div className="text-4xl mb-4">&#9888;&#65039;</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Supabase not configured
          </h1>
          <p className="text-gray-500 text-sm">
            Set <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in
            your environment to enable the member portal.
          </p>
        </div>
      </main>
    );
  }

  // Verify authentication (middleware also guards this route)
  const authClient = createServerSupabase();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user?.email) {
    redirect("/login?redirectTo=/member-portal");
  }

  // Fetch portal data using service role (server-side, trusted)
  let member: Member | null = null;
  let events: PortalEvent[] = [];
  let cases: PortalCase[] = [];

  try {
    const db = getSupabase();
    const [memberRes, eventsRes, casesRes] = await Promise.all([
      db.from("members").select("*").eq("email", user.email).maybeSingle(),
      db
        .from("events")
        .select("id, title, event_date, recording_url, slides_url, members_only")
        .order("event_date", { ascending: false }),
      db
        .from("shareholder_cases")
        .select("id, contact_name, email, case_type, status, created_at")
        .eq("email", user.email)
        .order("created_at", { ascending: false }),
    ]);
    member = memberRes.data ?? null;
    events = eventsRes.data ?? [];
    cases = casesRes.data ?? [];
  } catch {
    // Supabase service role env var missing — show data-unavailable state
  }

  return (
    <PortalClient
      user={{ email: user.email, id: user.id }}
      member={member}
      events={events}
      cases={cases}
    />
  );
}
