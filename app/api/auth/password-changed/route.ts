import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logMemberEvent } from "@/lib/member-events";

export async function POST(req: NextRequest) {
  // After updateUser({ password }), Supabase issues a new access token to the
  // browser client but does not update the SSR cookie — the old cookie token
  // is stale. The client therefore passes the new token in the Authorization
  // header and we verify it directly rather than reading from cookies.
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: { user }, error: authError } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  ).auth.getUser(token);

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
