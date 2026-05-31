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

  return supabaseResponse;
}

export const config = {
  matcher: ["/member-portal/:path*", "/auth/callback"],
};
