import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

export async function PATCH(req: NextRequest) {
  // Verify the requester is authenticated
  const authClient = createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : null;

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const { error: dbError } = await getSupabase()
    .from("members")
    .update({ name })
    .eq("user_id", user.id);

  if (dbError) {
    console.error("[member/settings] update error:", dbError.message);
    return NextResponse.json({ error: "Failed to save changes." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
