import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Supabase PKCE sends auth codes to {siteURL}?code=... when redirectTo is
  // rejected by its allowlist (e.g. nested query params). Intercept the code
  // here and forward to /auth/callback, which handles all PKCE exchanges.
  if (
    request.nextUrl.pathname === "/" &&
    request.nextUrl.searchParams.has("code")
  ) {
    const callbackUrl = new URL("/auth/callback", request.nextUrl.origin);
    callbackUrl.searchParams.set("code", request.nextUrl.searchParams.get("code")!);
    const type = request.nextUrl.searchParams.get("type");
    if (type) callbackUrl.searchParams.set("type", type);
    return NextResponse.redirect(callbackUrl);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            // Strip maxAge and expires so refreshed tokens are written as session
            // cookies — cleared when the browser closes, not persisted on disk.
            const { maxAge: _m, expires: _e, ...sessionOptions } = (options ?? {}) as {
              maxAge?: unknown;
              expires?: unknown;
              [key: string]: unknown;
            };
            supabaseResponse.cookies.set(
              name,
              value,
              sessionOptions as Parameters<typeof supabaseResponse.cookies.set>[2]
            );
          });
        },
      },
    }
  );

  // Refresh session tokens — must call getUser() not getSession()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Block top-level navigations with no referrer (Sec-Fetch-Site: none +
  // Sec-Fetch-Mode: navigate) when a session cookie exists. This fires on
  // browser restarts and tab restores where Chrome revives auth cookies —
  // and, crucially, also restores sessionStorage, making client-side alive
  // markers unreliable. The server-side Sec-Fetch-Site header is the only
  // trustworthy browser-restart signal we have.
  //
  // For /member-portal: redirect to login + delete cookies.
  // For all other pages: delete cookies and let the page render; the Nav
  // sees no session on INITIAL_SESSION and shows "Member Login".
  if (
    user &&
    request.headers.get("sec-fetch-site") === "none" &&
    request.headers.get("sec-fetch-mode") === "navigate"
  ) {
    const sbCookies = request.cookies
      .getAll()
      .filter((c) => c.name.startsWith("sb-"));

    if (request.nextUrl.pathname.startsWith("/member-portal")) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      const response = NextResponse.redirect(loginUrl);
      sbCookies.forEach((c) => response.cookies.delete(c.name));
      return response;
    }

    // Non-portal page — clear cookies, continue rendering.
    const response = NextResponse.next({ request });
    sbCookies.forEach((c) => response.cookies.delete(c.name));
    return response;
  }

  // Redirect unauthenticated visitors away from the member portal
  if (
    request.nextUrl.pathname.startsWith("/member-portal") &&
    !user
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon\\.ico|images/).*)",
  ],
};
