import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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

  // Block top-level navigations with no referrer page (Sec-Fetch-Site: none +
  // Sec-Fetch-Mode: navigate) even when a session cookie exists. This covers
  // browser restarts and session restores where Chrome may have revived the
  // auth cookies but sessionStorage (and therefore csl-auth-alive) is gone.
  // Navigations that originate inside the app carry Sec-Fetch-Site: same-origin
  // and are unaffected.
  if (
    request.nextUrl.pathname.startsWith("/member-portal") &&
    user &&
    request.headers.get("sec-fetch-site") === "none" &&
    request.headers.get("sec-fetch-mode") === "navigate"
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    const response = NextResponse.redirect(loginUrl);
    // Delete the auth cookies so the next middleware invocation does not see a
    // valid session and loop back to the portal.
    request.cookies
      .getAll()
      .filter((c) => c.name.startsWith("sb-"))
      .forEach((c) => response.cookies.delete(c.name));
    return response;
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/member-portal/:path*", "/auth/callback"],
};
