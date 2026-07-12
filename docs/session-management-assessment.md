# CSL Website — Session Management Assessment

**Date:** 12 July 2026
**Scope:** Session behaviour as implemented in `develop` at the time of writing
**Purpose:** Pre-go-live assessment — assessment only, no code changes

---

## 1. Supabase Client Session Configuration

Three distinct Supabase clients exist in the codebase. Their session handling differs significantly.

### 1a. Service-role client (`lib/supabase.ts` — `getSupabase()`)

Created with `createClient(..., { auth: { persistSession: false } })`. This client is used exclusively in API route handlers for database operations that require bypassing RLS. It never touches the browser and never stores session tokens. **No issue here.**

### 1b. Server auth client (`lib/supabase.ts` — `createServerSupabase()`)

Created with `createServerClient` from `@supabase/ssr`. Uses Next.js `cookies()` to read and write session tokens via HTTP cookies. Cookie options (including `maxAge` and `expires`) are passed through as Supabase sets them — no override is applied here. However, because this client runs server-side, it reads whatever cookies the browser sends; it does not write cookies directly. The middleware controls what gets written back.

**No explicit `maxAge` or cookie lifetime is configured in this client.** It inherits whatever Supabase defaults to, which is derived from the JWT expiry configured in the Supabase dashboard.

### 1c. Browser client (`lib/supabase-browser.ts` — `createBrowserSupabase()`)

Created with `createBrowserClient` from `@supabase/ssr`. This is where deliberate session behaviour is implemented. The `setAll` cookie adapter explicitly strips `maxAge` and `expires` from every cookie it writes:

```typescript
const { maxAge: _m, expires: _e, ...sessionOptions } = (options ?? {});
// result: session cookie — no expiry attribute written to document.cookie
```

This means cookies written by the browser client are **session cookies** — the browser treats them as ephemeral and clears them when the browser (not the tab) is closed.

### 1d. Middleware client (`middleware.ts`)

Created inline with `createServerClient`. The `setAll` implementation applies the same strip — `maxAge` and `expires` are removed before the refreshed token is written to the response:

```typescript
const { maxAge: _m, expires: _e, ...sessionOptions } = (options ?? {});
supabaseResponse.cookies.set(name, value, sessionOptions);
```

This is important: the middleware runs on every request and refreshes the session token. Because it also strips `maxAge`, even a refreshed token remains a session cookie — it does not convert to a persistent cookie during refresh.

**Summary:** Cookie lifetime is correctly configured at both the browser and middleware layers. No `maxAge` or `expires` is written. Session cookies are used throughout.

---

## 2. The `csl-auth-alive` SessionStorage Flag

### What it is

`sessionStorage.setItem("csl-auth-alive", "1")` is called at the end of every successful authentication path:

| Location | Auth path |
|----------|-----------|
| `app/login/LoginForm.tsx:55` | Password login |
| `app/auth/callback/page.tsx:44, 75, 93` | Magic link, email change, PKCE flows |
| `app/auth/update-password/UpdatePasswordForm.tsx:55` | Password reset completion |
| `app/auth/confirm/page.tsx:90` | Admin-generated recovery links |
| `app/auth/session-init/page.tsx:16` | Intermediate bounce page for server-side auth |
| `app/signup/SignupForm.tsx:65` | New member account creation |

### What it is protecting against

`PortalShell.tsx` (lines 86-100) checks for this flag on mount and on `pageshow` with `event.persisted = true`. If the flag is absent, `supabase.auth.signOut()` is called and the user is redirected to `/login`.

The `pageshow` + `persisted` check specifically targets **bfcache restoration**: when a user navigates back using the browser's back button, the browser may restore a cached page from memory without re-running the JavaScript. Without this check, a user who logged out and then pressed Back could find themselves looking at a cached portal page without a valid session.

The `event.persisted` path is also where **Chrome's session restore** is handled. When Chrome restores a previous browser session on restart, it restores HTTP cookies (which are now cleared on browser close) but also restores sessionStorage alongside the restored tab. This means `csl-auth-alive` would be present in a restored tab even though the auth cookies were cleared. The `pageshow` handler addresses this — but only partially, because Chrome's session restore fires `pageshow` with `event.persisted = false` on normal page load, not `true`. The `enforceSession()` call on mount (line 94) catches this case regardless of whether `event.persisted` is true.

### Tab-scope limitation

sessionStorage is scoped to a **single tab**. A member who:

1. Logs in on Tab A (flag is set in Tab A's sessionStorage)
2. Opens the member portal URL in a new Tab B

will find that Tab B has no `csl-auth-alive` flag. On mount, `PortalShell` calls `enforceSession()`, finds the flag absent, calls `signOut()`, and redirects to `/login` — **even though the member legitimately authenticated 30 seconds ago in Tab A**.

This is a known usability problem. The current workaround is that the portal is typically reached by clicking through from Tab A rather than opening fresh, so the flag propagation through `window.location.href` navigation keeps the tab the same. But typing the URL directly or opening a link in a new tab will silently log the member out.

The flag also does **not** survive a page reload within the same tab — sessionStorage persists across reloads within the same tab session, so this is not a problem in practice.

### Does it achieve its goal?

Partially. It successfully blocks bfcache-restored pages from presenting stale portal content. It does not reliably protect against Chrome session restore (sessionStorage is also restored by Chrome alongside tabs). Its main functional gap is the multi-tab scenario described above.

---

## 3. Logout Implementation

### `handleSignOut` in `PortalShell.tsx` (line 123-128)

```typescript
async function handleSignOut() {
  setSigningOut(true);
  await createBrowserSupabase().auth.signOut();
  router.push("/");
  router.refresh();
}
```

`auth.signOut()` instructs Supabase to invalidate the refresh token server-side and clears the auth cookies from the browser. **sessionStorage is not explicitly cleared here.** This means `csl-auth-alive` remains in sessionStorage after logout. If the user then presses Back and lands on a bfcache-restored portal page, `enforceSession()` would check for `csl-auth-alive`, find it present, and not sign out — but the subsequent API calls would fail with auth errors since the cookies are gone.

In practice the `router.push("/")` navigation clears the page, and the next visit to the portal would have valid middleware protection because the cookies are gone. But the flag remaining in sessionStorage after logout is technically incorrect.

**Gap:** `sessionStorage.removeItem("csl-auth-alive")` is missing from `handleSignOut`.

### Inactivity-triggered signOut in `PortalShell.tsx` (line 102-118)

```typescript
void supabase.auth.signOut();
window.location.href = "/login?reason=timeout";
```

This calls `signOut()` fire-and-forget and immediately navigates away. It does **not** clear sessionStorage before navigating. Same gap as above.

### Bfcache / browser-restore enforced signOut (line 89-92)

```typescript
void supabase.auth.signOut();
window.location.href = "/login";
```

Same pattern — fire-and-forget signOut, immediate redirect, sessionStorage not cleared.

### Summary of logout completeness

| Logout path | `signOut()` called | Cookies cleared | sessionStorage cleared | Redirect |
|-------------|-------------------|-----------------|----------------------|---------|
| Manual logout button | Yes (awaited) | Yes (by signOut) | **No** | Yes — `/` |
| Inactivity timeout | Yes (fire-and-forget) | Yes (by signOut) | **No** | Yes — `/login?reason=timeout` |
| Missing flag / bfcache | Yes (fire-and-forget) | Yes (by signOut) | **No** | Yes — `/login` |

All three paths call `signOut()` (which clears the auth cookies) and redirect away from the portal. The missing `sessionStorage.removeItem("csl-auth-alive")` is a minor inconsistency — it does not create a security bypass because the middleware will block any subsequent portal request without a valid cookie regardless of what is in sessionStorage.

---

## 4. Inactivity Timeout

**An inactivity timeout is implemented.** `PortalShell.tsx` (lines 102-118) sets a 30-minute timer (`INACTIVITY_MS = 30 * 60 * 1000`) that resets on `mousemove`, `keydown`, `click`, or `scroll`. When the timer fires, `supabase.auth.signOut()` is called and the member is redirected to `/login?reason=timeout`.

This is a reasonable implementation for a members site. The 30-minute window is standard.

**Limitation:** The timer is React-managed, not browser-native. It is destroyed when the component unmounts. If the member navigates to a non-portal page (e.g. the home page) and leaves it open, the timer stops. This is acceptable — only the portal exposes member data, and the middleware will still gate re-entry.

**Limitation:** The inactivity timer is only present in `PortalShell`. The `/member-portal/documents` standalone route and any other portal sub-routes that do not render `PortalShell` would not have this timer. This should be verified as the portal grows.

---

## 5. Supabase Dashboard Settings to Verify

The following settings in the Supabase Dashboard (Authentication > Configuration) interact with the session implementation and should be checked before go-live:

| Setting | Where | Recommended value | Reason |
|---------|-------|-------------------|--------|
| **JWT expiry** | Authentication > JWT Settings | 3600 seconds (1 hour) | Controls how long an access token is valid before needing a refresh. Default is 3600. Longer values mean a stolen token is valid for longer. |
| **Refresh token reuse interval** | Authentication > JWT Settings | 10 seconds | Prevents refresh token replay attacks. If a stolen refresh token is used, the legitimate token becomes invalid and both parties get signed out. |
| **Refresh token expiry** | Authentication > JWT Settings | 604800 seconds (7 days) | The window in which a refresh token can be used to get a new access token. Since auth cookies are session cookies (cleared on browser close), this only matters for very long open sessions. 7 days is the Supabase default. |
| **Confirm email** | Authentication > Email | OFF | Members verify intent via Stripe payment. This was set OFF intentionally and should remain OFF. |
| **Site URL** | Authentication > URL Configuration | `https://celticsupporters.net` (after cutover) | Auth redirect URLs are validated against this. Must match the production domain. |
| **Redirect URLs allowlist** | Authentication > URL Configuration | `https://celticsupporters.net/**` | Must include the production domain. Currently also includes `https://csl-website-ten.vercel.app/**` — remove the Vercel URL after cutover and links have expired. |

**Key point:** The JWT expiry in the Supabase dashboard is the source of truth for how long a session can stay alive without user interaction when the middleware is not running. The middleware refreshes the token on every request, so in practice a member actively using the portal will have their session extended continuously regardless of the JWT expiry. The 30-minute inactivity timeout in `PortalShell` is the operative limit.

---

## 6. Why Sessions Currently Persist Across Browser Close

Sessions do **not** currently persist across browser close in the standard case. The session-cookie approach implemented in `lib/supabase-browser.ts` and `middleware.ts` is correct — auth cookies have no `maxAge` or `expires` attribute, so the browser's default behaviour is to discard them on close.

The one exception is **Chrome's session restore**. Chrome has a built-in feature (enabled by default in Settings > On startup > Continue where you left off) that reopens all tabs from the previous session. When Chrome does this:

1. It restores the tab's URL and page from disk cache
2. It restores the tab's sessionStorage alongside the restored tab
3. It restores HTTP session cookies from an in-memory snapshot it maintains during normal operation

This means a member who closes Chrome (not just the tab) with the portal open may find — on the next Chrome launch — that the portal page loads with `csl-auth-alive` in sessionStorage and a valid auth cookie (because Chrome restored it). The middleware's `getUser()` call succeeds, the member is authenticated, and the portal renders as if they never left.

This is not a bug in the CSL implementation — it is intentional Chrome behaviour that cannot be prevented by web applications. The only defence against it is for the member to explicitly log out before closing the browser.

For CSL's risk profile (unattended shared device), this is the primary residual session risk.

---

## Best Practice Recommendation for CSL's Profile

CSL is a members site with ~500 members growing to 5,000. The portal exposes:
- Name, email, phone number
- Membership status and payment history
- Fan status and contact preferences

The primary risk is an **unattended shared or borrowed device** (family computer, library computer, shared work machine) where a member logs in and closes the browser without explicitly logging out.

The secondary risk is a **stolen or borrowed device** where an attacker has physical access and can open the browser to find an active session.

The current implementation is **broadly correct** for this profile:

- Session cookies (no `maxAge`) are the right choice — they clear on browser close in all browsers except Chrome's session-restore behaviour
- 30-minute inactivity timeout is appropriate
- `signOut()` is called on all logout paths
- The middleware gate means the server always validates the session, not just the client

The gaps are minor and the residual risk (Chrome session restore, multi-tab signOut, missing sessionStorage clear on logout) is low. No critical changes are required before go-live.

---

## Specific Recommended Changes

### A. Clear `csl-auth-alive` on all logout paths

**Effort: Low**
**Priority: Low — not a security bypass, but corrects a logical inconsistency**

Add `sessionStorage.removeItem("csl-auth-alive")` before or alongside `signOut()` in all three logout paths in `PortalShell.tsx`:
- `handleSignOut` (manual logout)
- The inactivity timeout callback
- The missing-flag enforced signOut

### B. Fix multi-tab signOut caused by `csl-auth-alive`

**Effort: Low**
**Priority: Medium — causes genuine user-facing confusion**

The current implementation silently signs out a member who opens the portal URL in a new tab, because sessionStorage is tab-scoped. Two options:

1. **Use a BroadcastChannel to propagate the flag across tabs.** When `csl-auth-alive` is set, broadcast a `"session-alive"` message. `PortalShell` listens on the same channel and sets the flag on receipt. This means a new tab opened within the same browser session will receive the flag from the existing tab without requiring a full re-login. No backend changes needed.

2. **Remove the `csl-auth-alive` mechanism entirely and rely on the middleware.** The middleware validates the Supabase session on every request. If the cookie is valid, the portal renders; if not, the middleware redirects to `/login`. The bfcache case that `csl-auth-alive` guards against could instead be handled by calling `supabase.auth.getUser()` on `pageshow` with `event.persisted = true` and redirecting if the user is null — no sessionStorage required. This is a simpler and more correct approach.

**Option 2 is recommended.** The sessionStorage flag was a reasonable workaround for the Chrome restart problem, but that problem cannot be reliably solved this way, and the multi-tab regression it introduces is a worse trade-off than the residual Chrome session-restore risk.

### C. Add a "Log out on all devices" option

**Effort: Low**
**Priority: Low — nice-to-have for members concerned about shared devices**

Supabase supports `supabase.auth.signOut({ scope: "global" })` which invalidates all refresh tokens for the user across all sessions, not just the current browser. Adding a secondary "Sign out everywhere" option on the Edit Profile tab would allow a member who suspects their account is open on another device to force a full sign-out. The current `signOut()` without a scope parameter defaults to local (current device only).

### D. Verify Supabase dashboard JWT settings

**Effort: Low**
**Priority: Medium — should be confirmed before go-live**

Verify in Supabase Dashboard > Authentication > JWT Settings:
- JWT expiry: confirm 3600 seconds (1 hour) — do not increase this
- Refresh token reuse interval: confirm this is set (default is 10 seconds) — prevents token replay

### E. Add an explicit login page message for timeout redirects

**Effort: Low**
**Priority: Low — UX improvement**

`/login?reason=timeout` is passed in the URL when the inactivity timer fires, but the login page does not currently display a message for this reason. Adding "Your session expired due to inactivity. Please log in again." would reduce member confusion.

### F. Consider `Secure` attribute enforcement in staging

**Effort: Low**
**Priority: Low — already correct in production**

The browser client's `setAll` passes `options?.secure` through if Supabase sets it, which it does for HTTPS origins. In production (HTTPS), the `Secure` attribute will be set automatically. In local development (HTTP), it will not — which is correct. No change needed, but worth confirming in a browser inspector on the production domain post-go-live.

---

## Summary Table

| Area | Current state | Gap | Recommended action | Effort |
|------|--------------|-----|-------------------|--------|
| Cookie persistence | Session cookies (no maxAge) — correct | Chrome session restore is unavoidable | No code change; member education | — |
| `csl-auth-alive` mechanism | Set on all auth paths; checked on portal mount and bfcache | Multi-tab sign-out; sessionStorage not cleared on logout | Replace with BroadcastChannel or remove in favour of `getUser()` on pageshow | Low |
| Logout completeness | `signOut()` called on all paths; cookies cleared | sessionStorage not cleared after logout | Add `removeItem("csl-auth-alive")` to all logout paths | Low |
| Inactivity timeout | 30 minutes in `PortalShell`; resets on activity | Not present on portal sub-routes outside `PortalShell` | Verify all portal routes use `PortalShell` | Low |
| Supabase dashboard | Not directly inspectable from code | JWT expiry and reuse interval unverified | Check dashboard settings before go-live | Low |
| Multi-device signout | Local scope only | Cannot force sign-out on other devices | Add "Sign out everywhere" using `scope: "global"` | Low |
