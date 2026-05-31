/**
 * Session Security Tests
 *
 * Tests for cookie-based session expiry and the 30-minute inactivity timeout.
 *
 * Tests 1-3 require a real member account. Provide credentials via env vars:
 *   TEST_USER_EMAIL=member@example.com
 *   TEST_USER_PASSWORD=yourpassword
 *
 * Test 4 needs no credentials — just a running dev server.
 *
 * Run:
 *   npx playwright test tests/session-security.spec.ts
 */

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? "";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? "";
const hasCredentials = !!(TEST_EMAIL && TEST_PASSWORD);

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  // On a fresh dev server, Next.js compiles JS bundles lazily on first request.
  // While bundles are loading React hydrates in multiple passes (Strict Mode
  // double-invocation + RSC bootstrap), causing elements to detach between each
  // pass. networkidle waits until ALL HTTP bundle requests finish — WebSocket
  // HMR connections do not count — so the DOM is stable before we interact.
  await page.waitForLoadState("networkidle", { timeout: 60_000 });
  await page.fill("#email", TEST_EMAIL);
  await page.fill("#password", TEST_PASSWORD);
  // Wait for the Supabase token response concurrently with the click so that
  // the session cookies are written to document.cookie before the browser
  // navigates. Without this, the middleware may call getUser() before setAll()
  // has run, find no cookies, and redirect back to /login.
  await Promise.all([
    page.waitForResponse(
      (resp) =>
        resp.url().includes("/auth/v1/token") && resp.status() === 200,
      { timeout: 15_000 }
    ),
    page.click('button[type="submit"]'),
  ]);
  // window.location.href triggers a full navigation; member portal fetches from
  // Supabase + Stripe so allow up to 30 s for the load to complete.
  await page.waitForURL("**/member-portal**", { timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// TEST 1 — Auth cookies are session cookies (no max-age / expires attribute)
// ---------------------------------------------------------------------------
// @supabase/ssr previously wrote cookies with maxAge, making them persistent
// across browser restarts. Our custom cookies adapter omits maxAge/expires so
// every auth cookie is a session cookie cleared by the browser on close.
// ---------------------------------------------------------------------------

test("auth cookies have no expiry (session cookies only)", async ({
  page,
  context,
}) => {
  test.skip(
    !hasCredentials,
    "Set TEST_USER_EMAIL and TEST_USER_PASSWORD to run this test"
  );

  await signIn(page);

  const cookies = await context.cookies();
  const authCookies = cookies.filter((c) => c.name.startsWith("sb-"));

  expect(
    authCookies.length,
    "At least one Supabase auth cookie (sb-*) must be present after sign-in"
  ).toBeGreaterThan(0);

  for (const cookie of authCookies) {
    // Playwright uses -1 for cookies with no expiry (session cookies).
    // Any positive value means the cookie persists after the browser closes.
    expect(
      cookie.expires,
      `Cookie "${cookie.name}" must be a session cookie — found expires=${cookie.expires}`
    ).toBe(-1);
  }
});

// ---------------------------------------------------------------------------
// TEST 2 — Session does not persist after the browser context is closed
// ---------------------------------------------------------------------------
// Closing a browser context destroys all session cookies. Opening a new
// context should require the user to sign in again.
// ---------------------------------------------------------------------------

test("session does not persist after browser close", async ({ browser }) => {
  test.skip(
    !hasCredentials,
    "Set TEST_USER_EMAIL and TEST_USER_PASSWORD to run this test"
  );

  // Context 1 — sign in and verify portal is accessible
  const ctx1 = await browser.newContext();
  const page1 = await ctx1.newPage();
  await signIn(page1);
  await expect(page1).toHaveURL(/\/member-portal/);
  await ctx1.close(); // simulates the user closing the browser

  // Context 2 — fresh context with no cookies; should be bounced to login
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto("/member-portal");
  await expect(page2).toHaveURL(/\/login/);
  await ctx2.close();
});

// ---------------------------------------------------------------------------
// TEST 3 — 30-minute inactivity timeout signs out and redirects
// ---------------------------------------------------------------------------
// PortalClient.tsx attaches activity listeners (mousemove, keydown, click,
// scroll). If none fire for 30 minutes the timer calls supabase.auth.signOut()
// then sets window.location.href = '/login?reason=timeout'.
//
// page.clock.install() patches setTimeout in the browser page and persists
// across navigations (Playwright installs it as an init script). fastForward
// advances the fake clock and fires any due timers.
// ---------------------------------------------------------------------------

test(
  "30-minute inactivity signs out and redirects to /login?reason=timeout",
  async ({ page }) => {
    test.skip(
      !hasCredentials,
      "Set TEST_USER_EMAIL and TEST_USER_PASSWORD to run this test"
    );

    // Install the fake clock before any navigation so the portal's useEffect
    // picks up patched setTimeout when the component mounts.
    await page.clock.install();

    await signIn(page);
    await expect(page).toHaveURL(/\/member-portal/);

    // React effects are scheduled via MessageChannel, which fires after paint
    // — asynchronously after waitForURL resolves at "load". page.clock.install()
    // patches setTimeout and requestAnimationFrame in the browser, so any
    // browser-side yield (rAF, setTimeout(0)) would be frozen by the fake clock.
    // page.waitForTimeout uses Playwright's Node.js timer, which is completely
    // outside the fake clock, giving React real time to run useEffect and register
    // the inactivity setTimeout before we advance the fake clock.
    await page.waitForTimeout(1_000);

    // No user activity — advance the clock past the 30-minute threshold.
    // fastForward fires all due timers synchronously; the inactivity callback
    // fire-and-forgets signOut() then sets window.location.href immediately.
    await page.clock.fastForward(31 * 60 * 1000);

    // Wait for the redirect that the timeout handler triggers.
    await page.waitForURL("**/login?reason=timeout", { timeout: 15_000 });
  }
);

// ---------------------------------------------------------------------------
// TEST 4 — Timeout banner visible at /login?reason=timeout (no credentials)
// ---------------------------------------------------------------------------

test("inactivity timeout banner is visible on /login?reason=timeout", async ({
  page,
}) => {
  await page.goto("/login?reason=timeout");

  await expect(
    page.getByText(
      "Your session expired due to inactivity. Please sign in again."
    )
  ).toBeVisible();
});
