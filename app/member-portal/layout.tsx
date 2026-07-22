import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function MemberPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = getSupabase();

  const { data: configRow } = await db
    .from("site_config")
    .select("value")
    .eq("key", "portal_open")
    .maybeSingle();

  // Treat a missing key as open — avoids locking everyone out in dev environments
  // where the migration hasn't been run.
  const portalOpen = !configRow || configRow.value === "true";

  // Hot path: portal is open — pass straight through to the page.
  // Middleware and page.tsx handle unauthenticated access.
  if (portalOpen) {
    return <>{children}</>;
  }

  // Portal is closed — allow admins through, redirect everyone else.
  const authClient = createServerSupabase();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/member-portal");
  }

  const { data: member } = await db
    .from("members")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member?.is_admin) {
    redirect("/portal-coming-soon");
  }

  return <>{children}</>;
}
