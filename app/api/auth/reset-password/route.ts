import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  try {
    const supabase = createServerSupabase();
    await supabase.auth.resetPasswordForEmail(email, {
      // Route through the existing callback so the code is exchanged for a session,
      // then redirect to the update-password page.
      redirectTo: `${origin}/auth/callback?redirectTo=/auth/update-password`,
    });
  } catch (err) {
    console.error("[reset-password] Error:", err);
  }

  // Always return 200 — never reveal whether the email is registered.
  return NextResponse.json({ sent: true });
}
