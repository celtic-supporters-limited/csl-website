/**
 * Public-facing label for the person a Celtic plc AGM proxy is appointed to.
 *
 * A proxy must be appointed to a named natural person. It cannot be appointed
 * to CSL as a company: the registrar rejects that, and the Celtic Trust had
 * proxies fail on exactly this basis in 2025.
 *
 * The director's name is a board decision and is added in Package 5, not here.
 * Every public sentence that references the appointee is written so that
 * replacing the value below with a bare name reads correctly with no
 * restructuring, for example:
 *
 *   "naming a CSL director as your proxy"
 *   "naming Brian McLaughlin as your proxy"
 *
 * Changing this one constant updates every public reference. Consumers:
 *   app/proxy/page.tsx
 *   app/proxy/ProxyForm.tsx
 */
export const APPOINTEE_LABEL = "a CSL director";
