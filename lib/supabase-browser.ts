import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client using the public anon key.
//
// @supabase/ssr stores session tokens in HTTP cookies, not localStorage/sessionStorage.
// By default it writes cookies with a maxAge (e.g. 3600 s) which makes them persistent —
// they survive browser close. The custom cookies adapter below omits maxAge and expires
// so every auth cookie is a session cookie, cleared automatically when the browser closes.
//
// Import this in client components ("use client") only.
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          if (typeof document === "undefined") return undefined;
          const match = document.cookie
            .split("; ")
            .find((row) => row.startsWith(name + "="));
          return match
            ? decodeURIComponent(match.slice(name.length + 1))
            : undefined;
        },
        set(name: string, value: string, options) {
          if (typeof document === "undefined") return;
          // Build cookie string without maxAge or expires — session cookie only.
          let str = `${name}=${encodeURIComponent(value)}`;
          str += `; Path=${options?.path ?? "/"}`;
          if (options?.sameSite) str += `; SameSite=${String(options.sameSite)}`;
          if (options?.secure) str += `; Secure`;
          document.cookie = str;
        },
        remove(name: string, options) {
          if (typeof document === "undefined") return;
          document.cookie = `${name}=; Path=${options?.path ?? "/"}; Max-Age=0`;
        },
      },
    }
  );
}
