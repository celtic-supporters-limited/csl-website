import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import PortalShell from "@/components/PortalShell";

export const dynamic = "force-dynamic";
import UploadForm from "./UploadForm";

export const metadata: Metadata = { title: "Upload WordPress Export | CSL Admin" };

export default async function UploadPage() {
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

  return (
    <PortalShell user={{ email: user.email, id: user.id }} member={member}>
      <div className="max-w-2xl">
        <div className="mb-6">
          <Link
            href="/member-portal/admin/reporting"
            className="text-sm text-csl-dark hover:underline"
          >
            &larr; Back to reporting
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-1">
            Upload WordPress export
          </h1>
          <p className="text-gray-500 text-sm">
            Upload a fresh members CSV from WordPress to update the legacy membership counts on the reporting dashboard.
            The CSV is processed in memory and only aggregate counts are saved - no individual member records from WordPress are stored in Supabase.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <UploadForm />
        </div>

        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
          <p className="font-semibold mb-0.5">One export, two uses</p>
          The same CSV file used here is the same format required for the migration seed script in csl-migration.
          Use the most recent export for both - they should share the same &ldquo;as of&rdquo; date.
        </div>
      </div>
    </PortalShell>
  );
}
