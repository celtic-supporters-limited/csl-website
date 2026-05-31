import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client using the public anon key.
// - persistSession: keeps the token alive across navigations within the same tab
// - storage: sessionStorage so the token is cleared when the tab or window is closed
// - autoRefreshToken: silently renews the JWT before it expires (no manual refresh needed)
// - detectSessionInUrl: handles PKCE callbacks after magic link / password reset clicks
// Import this in client components ("use client") only.
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
}
