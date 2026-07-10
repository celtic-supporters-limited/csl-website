import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const { token_hash, type } = body as { token_hash?: string; type?: string };

  if (!token_hash || !type) {
    return NextResponse.json({ ok: false, message: "Missing token_hash or type." }, { status: 400 });
  }

  if (type !== "recovery" && type !== "magiclink") {
    return NextResponse.json({ ok: false, message: "Invalid type." }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: type as "recovery" | "magiclink",
  });

  if (error) {
    console.error("[auth/verify] verifyOtp error:", error.message);
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
