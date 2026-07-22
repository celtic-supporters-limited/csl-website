import { NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

// Called by /auth/callback after a successful PKCE code exchange to link the
// newly-authenticated auth.users.id back to the matching members row.
// Only updates rows where user_id IS NULL — safe to call on every login.
export async function POST() {
  const authClient = createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { error } = await getSupabase()
    .from("members")
    .update({ user_id: user.id })
    .eq("email", user.email)
    .is("user_id", null);

  if (error) {
    console.error("[link-member] Supabase update error:", error.message);
    return NextResponse.json({ error: "Failed to link member." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
