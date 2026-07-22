import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// GET /api/auth/verify?token_hash=...&type=recovery|magiclink
//
// Kept for redirect-behaviour tests (bad/expired token → ?error=expired).
// The /auth/confirm page now uses POST + browser-side setSession() instead.
// This approach had a limitation: server-side cookie writes from verifyOtp
// were not accepted by middleware's getUser() in all environments.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (!token_hash || !type || (type !== "recovery" && type !== "magiclink")) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", url.origin));
  }

  const destination = type === "recovery" ? "/auth/update-password" : "/member-portal";
  const successResponse = NextResponse.redirect(new URL(destination, url.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { maxAge: _m, expires: _e, ...sessionOptions } =
              (options ?? {}) as { maxAge?: unknown; expires?: unknown; [k: string]: unknown };
            successResponse.cookies.set(
              name,
              value,
              sessionOptions as Parameters<typeof successResponse.cookies.set>[2]
            );
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: type as "recovery" | "magiclink",
  });

  if (error) {
    console.error("[auth/verify] OTP verification failed (GET):", error.message, { type });
    // Redirect back to the confirm page showing an expired-link error.
    return NextResponse.redirect(
      new URL(`/auth/confirm?token_hash=${encodeURIComponent(token_hash)}&type=${type}&error=expired`, url.origin)
    );
  }

  return successResponse;
}

// POST /api/auth/verify
//
// Redeems the OTP token server-side and returns the raw session tokens so the
// browser can call setSession() directly. Using browser-side setSession() mirrors
// the working pattern in /auth/callback (hash flow) and avoids cookie-format
// issues that arise when writing Supabase session cookies in a Route Handler.
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

  // Plain anon client — no cookie adapter needed since we return tokens in JSON.
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await anonClient.auth.verifyOtp({
    token_hash,
    type: type as "recovery" | "magiclink",
  });

  if (error || !data?.session) {
    console.error("[auth/verify] OTP verification failed (POST):", error?.message ?? "no session", { type });
    return NextResponse.json(
      { ok: false, message: error?.message ?? "Token invalid or expired." },
      { status: 400 }
    );
  }

  const destination = type === "recovery" ? "/auth/update-password" : "/member-portal";

  return NextResponse.json({
    ok: true,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    destination,
  });
}
