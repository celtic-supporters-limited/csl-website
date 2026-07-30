/**
 * The person a Celtic plc AGM proxy is appointed to - both the public-facing
 * label and the value the server stores on every appointment record.
 *
 * A proxy must be appointed to a named natural person. It cannot be appointed
 * to CSL as a company: the registrar rejects that, and the Celtic Trust had
 * proxies fail on exactly this basis in 2025. Celtic's own 2025 AGM Notice
 * tells members they are "encouraged to appoint the 'Chair of the Meeting'"
 * by default - the exact pattern this constant exists to avoid CSL repeating.
 *
 * Board decision now settled: Brian McLaughlin. One constant, used two ways:
 *
 *   Public copy   - "naming Brian McLaughlin as your proxy"
 *   Server storage - agm_proxies.appointee_name is set to this value directly
 *                    by the API route. It is never read from the request
 *                    body: if the client cannot supply it, it cannot be
 *                    substituted, and no validation is required to prevent a
 *                    code path that does not exist.
 *
 * Consumers: app/proxy/page.tsx, app/proxy/ProxyForm.tsx,
 * app/api/proxy/appointment/route.ts.
 */
export const APPOINTEE_LABEL = "Brian McLaughlin";
