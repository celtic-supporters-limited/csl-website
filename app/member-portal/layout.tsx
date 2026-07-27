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

  const authClient = createServerSupabase();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  // No session — nothing to gate on membership status. If the portal is open,
  // let middleware/page.tsx handle the login redirect (avoids a redundant
  // getUser()-driven redirect here). If closed, send straight to login.
  if (!user) {
    if (portalOpen) return <>{children}</>;
    redirect("/login?redirectTo=/member-portal");
  }

  // Single member lookup covers both the portal_open admin bypass and the
  // per-member status gate below — one query, not two.
  // Primary lookup by user_id
  let { data: member, error } = await db
    .from("members")
    .select("is_admin, status")
    .eq("user_id", user.id)
    .maybeSingle();

  // Fallback: user_id may be NULL for rows created before the backfill migration
  if (!member && !error && user.email) {
    ({ data: member, error } = await db
      .from("members")
      .select("is_admin, status")
      .eq("email", user.email)
      .maybeSingle());
  }

  if (error) {
    console.error("[portal-gate] members query error:", error.message, "| user_id:", user.id);
  }

  // Admin bypass — evaluated before every other gate, and before the
  // portal_open check. Admins always get through regardless of portal_open
  // or their own membership status; losing this bypass mid-lapse would lock
  // an admin out of the tools needed to fix the problem. They still see
  // their own status banner on member-facing views — this layout only
  // controls routing, not what page.tsx/PortalClient renders.
  if (member?.is_admin) {
    return <>{children}</>;
  }

  // Portal-wide gate (non-admin) — closed means signed out and redirected,
  // no trapped session.
  if (!portalOpen) {
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

  // Per-member status gate (non-admin, portal open) — session is retained
  // here, unlike the portal_open case above, because /membership-ended needs
  // to know who the member is for the rejoin flow.
  if (member?.status === "cancelled") {
    redirect("/membership-ended");
  }

  // payment_failed retains full access — page.tsx/PortalClient render the
  // amber warning banner and the card-update action; blocking access here
  // would remove the exact tool the member needs to fix the problem.
  return <>{children}</>;
}
