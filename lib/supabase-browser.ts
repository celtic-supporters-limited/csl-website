import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client using the public anon key.
// Import this in client components ("use client") only.
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
