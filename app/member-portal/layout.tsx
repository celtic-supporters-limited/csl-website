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

  // Primary lookup by user_id
  let { data: member, error } = await db
    .from("members")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  // Fallback: user_id may be NULL for rows created before the backfill migration
  if (!member && !error && user.email) {
    ({ data: member, error } = await db
      .from("members")
      .select("is_admin")
      .eq("email", user.email)
      .maybeSingle());
  }

  if (error) {
    console.error("[portal-gate] members query error:", error.message, "| user_id:", user.id);
  }

  if (!member?.is_admin) {
    console.error(
      "[portal-gate] signing out and redirecting to /portal-coming-soon —",
      error   ? `query error: ${error.message}` :
      !member ? "no member row found" :
                "is_admin = false",
      "| user_id:", user.id,
      "| email:", user.email
    );
    await authClient.auth.signOut();
    redirect("/portal-coming-soon");
  }

  return <>{children}</>;
}
