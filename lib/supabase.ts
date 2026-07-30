import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Service-role client for API routes — bypasses RLS, never exposed to browser.
let _serviceClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_serviceClient) return _serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
  }

  _serviceClient = createClient(url, key, {
    auth: { persistSession: false },
    // Next.js's Data Cache caches GET fetches by default even on routes marked
    // force-dynamic (that flag only disables the Full Route Cache). Without
    // this, a page that reads-then-writes-then-reads in the same request tree
    // can be served a stale pre-write response - found via the Package 6
    // confirm-link idempotency test writing a duplicate change-log entry
    // because the second load's row read came back cached as unconfirmed.
    global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) },
  });
  return _serviceClient;
}

// Auth client for server components and route handlers.
// Reads the user session from request cookies — do not call from client components.
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server components cannot write cookies; middleware refreshes the session.
          }
        },
      },
    }
  );
}
