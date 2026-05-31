import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client using the public anon key.
//
// @supabase/ssr stores session tokens in HTTP cookies, not localStorage/sessionStorage.
// By default those cookies include maxAge (set to the JWT expiry) which makes them
// persistent — they survive browser close.
//
// The custom getAll/setAll adapter below writes cookies WITHOUT maxAge or expires so
// they become session cookies, cleared automatically when the browser closes.
//
// NOTE: the older get/set/remove interface is deprecated in @supabase/ssr v0.10+
// and has known edge-case bugs — always use getAll/setAll instead.
//
// Import this in client components ("use client") only.
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          if (typeof document === "undefined") return [];
          return document.cookie
            .split("; ")
            .filter(Boolean)
            .map((item) => {
              const eqIdx = item.indexOf("=");
              return {
                name: item.slice(0, eqIdx),
                value: item.slice(eqIdx + 1),
              };
            });
        },
        setAll(cookiesToSet) {
          if (typeof document === "undefined") return;
          for (const { name, value, options } of cookiesToSet) {
            // Build session cookie — omit maxAge and expires so the browser
            // clears this token when the window is closed.
            let str = `${name}=${value}`;
            str += `; Path=${options?.path ?? "/"}`;
            if (options?.sameSite) str += `; SameSite=${String(options.sameSite)}`;
            if (options?.secure) str += `; Secure`;
            document.cookie = str;
          }
        },
      },
    }
  );
}
