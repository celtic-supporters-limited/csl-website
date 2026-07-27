import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Launch controls for the two AGM instruments.
 *
 * Single source of truth for both the pages and their API routes. The realistic
 * failure mode is not an attacker, it is a page and its endpoint disagreeing
 * about whether a flow is open, which produces either a form that submits and
 * then fails, or a hidden form whose endpoint still accepts writes.
 *
 * Every read fails closed. A wrongly rejected signature can be re-collected
 * with an apology. A signature collected against wording the solicitor has not
 * approved cannot be un-collected.
 */

export type AgmGateKey = "resolution_open" | "proxy_open";

/** Message returned by the API routes when a flow is closed. */
export const AGM_GATE_CLOSED_ERROR: Record<AgmGateKey, string> = {
  resolution_open:
    "Signing is not open yet. The resolution wording is with our solicitor and this page will open for signature once it is confirmed.",
  proxy_open:
    "Proxy appointment is not open yet. It opens once Celtic plc issues the formal Notice of the Annual General Meeting.",
};

let gateClient: SupabaseClient | null = null;

/**
 * Dedicated service-role client for gate reads.
 *
 * Two deliberate differences from the shared getSupabase() client.
 *
 * Service role, not anon: the anon role has no SELECT policy on site_config, so
 * a browser-side read would always come back empty and therefore always read as
 * closed.
 *
 * cache: "no-store" on every request: Next.js patches global fetch and caches
 * GET requests in its Data Cache. Marking a route "force-dynamic" opts the route
 * out of the full route cache but does not reliably opt individual fetches out
 * of the Data Cache, and supabase-js issues ordinary fetches. Without this, a
 * gate read returns whatever the value was the first time the server saw it:
 * closing a flow would leave the open form being served from cache, which is the
 * one failure this gate exists to prevent.
 */
function getGateClient(): SupabaseClient {
  if (gateClient) return gateClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase environment variables are not configured");
  }

  gateClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });

  return gateClient;
}

/**
 * Reads one gate. Returns false on a missing key, a database error, or a
 * missing service-role configuration.
 */
export async function isAgmGateOpen(key: AgmGateKey): Promise<boolean> {
  try {
    const { data, error } = await getGateClient()
      .from("site_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      console.error(`[agm-gates] read failed for ${key}, failing closed:`, error.message);
      return false;
    }

    return data?.value === "true";
  } catch (err) {
    console.error(`[agm-gates] unexpected error reading ${key}, failing closed:`, err);
    return false;
  }
}

/** Reads both gates in parallel. */
export async function getAgmGates(): Promise<Record<AgmGateKey, boolean>> {
  const [resolutionOpen, proxyOpen] = await Promise.all([
    isAgmGateOpen("resolution_open"),
    isAgmGateOpen("proxy_open"),
  ]);

  return { resolution_open: resolutionOpen, proxy_open: proxyOpen };
}
