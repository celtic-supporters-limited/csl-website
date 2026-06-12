import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { logMemberEvent } from "@/lib/member-events";

export async function POST() {
  const authClient = createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  logMemberEvent({
    memberEmail: user.email,
    eventType: "password.changed",
    eventEmail: user.email,
  }).catch((err) =>
    console.error("[password-changed] Event log error:", err)
  );

  return NextResponse.json({ ok: true });
}
