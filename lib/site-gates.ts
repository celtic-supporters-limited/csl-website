import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Uncached reads of site_config: the four launch gates, plus the option lists
 * and flags that must be changeable without a deploy.
 *
 * Single source of truth for every page and every API route that depends on a
 * gate. The realistic failure mode is not an attacker, it is a page and its
 * endpoint disagreeing about whether a flow is open, which produces either a
 * form that submits and then fails, or a hidden form whose endpoint still
 * accepts writes.
 *
 * Two things must both be true for a gate to work, and only one of them lives
 * in this file:
 *
 *   1. The read must not be cached. Handled here, see getGateClient().
 *   2. The consuming route must not be statically rendered. A page baked at
 *      build time serves whatever value was true at build. Every gated page
 *      therefore declares `export const dynamic = "force-dynamic"`. This was
 *      the cause of membership_open appearing to do nothing.
 */

export type SiteGateKey =
  | "membership_open"
  | "portal_open"
  | "resolution_open"
  | "proxy_open";

/**
 * Value used when the key is absent, the read errors, or Supabase is not
 * configured.
 *
 * Closed is the safe default for the three flows that accept public writes: a
 * wrongly rejected submission can be re-collected with an apology, whereas a
 * signature collected against unapproved wording cannot be un-collected.
 *
 * portal_open is deliberately the exception. It fails OPEN, preserving the
 * behaviour established in app/member-portal/layout.tsx, where a missing key
 * must not sign out every non-admin member. Failing that gate closed on a
 * transient read error would lock existing members out of the portal, which is
 * a worse outcome than briefly admitting someone during an outage.
 */
const GATE_DEFAULTS: Record<SiteGateKey, boolean> = {
  membership_open: false,
  resolution_open: false,
  proxy_open: false,
  portal_open: true,
};

/** Message returned by the AGM API routes when a flow is closed. */
export const AGM_GATE_CLOSED_ERROR: Record<"resolution_open" | "proxy_open", string> = {
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
 * one failure these gates exist to prevent.
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

/** Reads one gate. Falls back to GATE_DEFAULTS on a missing key or any failure. */
export async function isGateOpen(key: SiteGateKey): Promise<boolean> {
  try {
    const { data, error } = await getGateClient()
      .from("site_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      console.error(
        `[site-gates] read failed for ${key}, defaulting to ${GATE_DEFAULTS[key] ? "open" : "closed"}:`,
        error.message
      );
      return GATE_DEFAULTS[key];
    }

    // An absent key falls back to the documented default, not blindly to closed.
    if (!data) return GATE_DEFAULTS[key];

    return data.value === "true";
  } catch (err) {
    console.error(
      `[site-gates] unexpected error reading ${key}, defaulting to ${GATE_DEFAULTS[key] ? "open" : "closed"}:`,
      err
    );
    return GATE_DEFAULTS[key];
  }
}

/** Reads several gates in parallel. */
export async function getGates<K extends SiteGateKey>(
  ...keys: K[]
): Promise<Record<K, boolean>> {
  const values = await Promise.all(keys.map((k) => isGateOpen(k)));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Record<K, boolean>;
}

// ── General site_config reads ────────────────────────────────────────────────
// Same uncached client as the gates, so an option list or flag changed in
// site_config takes effect on the next request rather than the next deploy.

/** Raw value for a key, or null if absent or unreadable. */
export async function getConfigValue(key: string): Promise<string | null> {
  try {
    const { data, error } = await getGateClient()
      .from("site_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      console.error(`[site-gates] read failed for ${key}:`, error.message);
      return null;
    }
    return data?.value ?? null;
  } catch (err) {
    console.error(`[site-gates] unexpected error reading ${key}:`, err);
    return null;
  }
}

/**
 * JSON array of allowed values for a constrained dropdown.
 *
 * Returns [] when absent or malformed. Callers must treat an empty list as
 * "cannot validate" and reject, not as "anything goes", otherwise the
 * constraint is decorative.
 */
export async function getConfigList(key: string): Promise<string[]> {
  const raw = await getConfigValue(key);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error(`[site-gates] ${key} is not a JSON array`);
      return [];
    }
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    console.error(`[site-gates] ${key} is not valid JSON`);
    return [];
  }
}

/** Boolean flag outside the four gates. Defaults false on any failure. */
export async function isConfigFlagOn(key: string): Promise<boolean> {
  return (await getConfigValue(key)) === "true";
}

/** Convenience wrapper for the two AGM gates. */
export async function getAgmGates() {
  return getGates("resolution_open", "proxy_open");
}
