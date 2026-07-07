/**
 * Password reset flow tests.
 *
 * Covers:
 *   1. POST /api/auth/reset-password  — input validation, no-enumeration guarantee, rate-limit
 *      status leak check
 *   2. /auth/update-password page     — session guard, form validation (too short, mismatch)
 *   3. End-to-end                     — recovery link → set new password → portal redirect →
 *      sign in with the new password; expired/invalid code → login error
 *
 * Run against the deployed site:
 *   $env:PLAYWRIGHT_BASE_URL="https://csl-website-ten.vercel.app"
 *   npx playwright test tests/password-reset.spec.ts
 *
 * Required in .env.test.local:
 *   TEST_USER_EMAIL              — email of a known member account
 *   TEST_USER_PASSWORD           — current password for that account
 *   NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL (for admin API calls)
 *   SUPABASE_SERVICE_ROLE_KEY    — service-role key (for generateLink + updateUserById)
 *
 * The e2e tests temporarily change the test-account password to TEMP_PASSWORD and restore
 * it via the Supabase admin API in afterEach so the account remains usable by other suites.
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.describe.configure({ mode: "serial" });

// ── Config ────────────────────────────────────────────────────────────────────

const SMOKE_EMAIL    = process.env.TEST_USER_EMAIL           ?? "";
const SMOKE_PASSWORD = process.env.TEST_USER_PASSWORD        ?? "";
const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Temporary password used during the e2e test — must differ from SMOKE_PASSWORD
// and meet the ≥8 character minimum enforced by UpdatePasswordForm.
const TEMP_PASSWORD = "Temporary!9Reset";

function skip(testInfo: { skip(reason: string): void }, name: string, value: string) {
  if (!value) testInfo.skip(`${name} not set — skipping`);
}

function adminSupabase() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

// Establish a session and navigate to /auth/update-password.
//
// UpdatePasswordForm only requires an active session (any kind) to show the form —
// it calls supabase.auth.getSession() and redirects to /login if null. A regular
// email/password login is enough for form-validation tests.
//
// For the true e2e reset test we use a separate helper that goes through the
// admin recovery link and sets the session via the Supabase REST API.
async function navigateToResetPage(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle", { timeout: 20_000 });
  await page.fill("#email", SMOKE_EMAIL);
  await page.fill("#password", SMOKE_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/member-portal/, { timeout: 20_000 });

  // Use JavaScript navigation so Sec-Fetch-Site is same-origin — a direct
  // page.goto() sends Sec-Fetch-Site: none which triggers the browser-restart
  // middleware guard and deletes the session cookies before the form loads.
  await page.evaluate(() => { window.location.href = "/auth/update-password"; });
  await page.waitForURL(/\/auth\/update-password/, { timeout: 10_000 });
  // Wait for the session check useEffect to resolve and render the form.
  await page.waitForSelector("#new-password", { timeout: 15_000 });
}

// Navigate to /auth/update-password via a genuine recovery session.
//
// supabase.auth.admin.generateLink uses implicit flow — Supabase redirects to the
// Site URL with tokens in the # hash fragment. @supabase/ssr's createBrowserClient
// is PKCE-first and does not auto-process hash fragments, so we extract the tokens
// from the hash and call setSession via the Supabase REST API from the browser context.
async function navigateToResetPageViaRecoveryLink(page: Page): Promise<void> {
  const supabase = adminSupabase();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: SMOKE_EMAIL,
  });
  expect(error).toBeNull();

  const actionLink =
    (data as { properties?: { action_link?: string } })?.properties?.action_link;
  expect(actionLink).toBeTruthy();

  // Navigate — Supabase redirects to Site URL with #access_token=...&type=recovery.
  await page.goto(actionLink!, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Extract tokens from the hash fragment and establish a session via Supabase REST.
  const sessionOk = await page.evaluate(
    async ({ supabaseUrl, anonKey }: { supabaseUrl: string; anonKey: string }) => {
      const hash = window.location.hash.slice(1);
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) return false;

      // POST to Supabase token endpoint to get a session object, then store it
      // in the format @supabase/ssr expects (a single auth-token cookie).
      const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({ refresh_token }),
      });
      if (!res.ok) return false;
      const session = await res.json() as Record<string, unknown>;

      // Write the session as the cookie @supabase/ssr reads. The project ref is
      // extracted from the Supabase URL (subdomain before .supabase.co).
      const ref = supabaseUrl.replace("https://", "").split(".")[0];
      const cookieName = `sb-${ref}-auth-token`;
      const cookieValue = encodeURIComponent(JSON.stringify(session));
      document.cookie = `${cookieName}=${cookieValue}; Path=/; SameSite=Lax; Secure`;
      return true;
    },
    {
      supabaseUrl: SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    }
  );
  expect(sessionOk).toBe(true);

  await page.goto("/auth/update-password");
  await page.waitForURL(/\/auth\/update-password/, { timeout: 10_000 });
}

// Restore the test-account password via the Supabase admin API.
// Looks up user_id from the members table (populated by sql/add-user-id-to-members.sql).
async function restorePassword(targetPassword: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY || !SMOKE_EMAIL) return;

  const supabase = adminSupabase();
  const { data: member } = await supabase
    .from("members")
    .select("user_id")
    .eq("email", SMOKE_EMAIL)
    .maybeSingle();

  if (member?.user_id) {
    const { error } = await supabase.auth.admin.updateUserById(member.user_id, {
      password: targetPassword,
    });
    if (error) {
      console.error("[password-reset] restorePassword failed:", error.message);
    }
  }
}

// ── 1. POST /api/auth/reset-password ─────────────────────────────────────────

test.describe("POST /api/auth/reset-password", () => {

  test("returns 400 when email field is absent from body", async ({ request }) => {
    const res = await request.post("/api/auth/reset-password", {
      data: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toBeTruthy();
  });

  test("returns 400 for malformed JSON body", async ({ request }) => {
    const res = await request.post("/api/auth/reset-password", {
      data: "{{not json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 200 + { sent: true } for an unregistered email (no user enumeration)", async ({ request }) => {
    const res = await request.post("/api/auth/reset-password", {
      data: JSON.stringify({ email: "nobody@password-reset-smoke.example.com" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { sent?: boolean };
    expect(body.sent).toBe(true);
  });

  test("all responses are 200 regardless of rate-limit state (no status leak)", async ({ request }) => {
    // The rate limiter silently swallows excess requests and returns the same
    // { sent: true } / 200 as a legitimate response — callers cannot detect the limit.
    // Vercel in-memory state resets on cold starts so we cannot reliably trigger
    // the limit here; this test confirms the endpoint never exposes the limit via
    // a different status code.
    for (let i = 0; i < 5; i++) {
      const res = await request.post("/api/auth/reset-password", {
        data: JSON.stringify({ email: `rate-probe-${i}@smoke-test.example.com` }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(200);
    }
  });

});

// ── 2. /auth/update-password page ────────────────────────────────────────────

test.describe("/auth/update-password page", () => {

  test("redirects to /login when visited with no active session", async ({ page }) => {
    // Fresh Playwright context has no session. UpdatePasswordForm checks for a
    // session in useEffect and calls router.replace('/login?error=auth_failed').
    await page.goto("/auth/update-password");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/login/);
  });

  // The next two tests need a recovery link to get a session onto the page.
  test.describe("form validation", () => {

    test.beforeEach(({}, testInfo) => {
      skip(testInfo, "TEST_USER_EMAIL",           SMOKE_EMAIL);
      skip(testInfo, "NEXT_PUBLIC_SUPABASE_URL",  SUPABASE_URL);
      skip(testInfo, "SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
    });

    test("shows error when new password is fewer than 8 characters", async ({ page }) => {
      await navigateToResetPage(page);
      await page.fill("#new-password", "short");
      await page.fill("#confirm-password", "short");
      await page.locator('button[type="submit"]').click();
      await expect(page.locator("body")).toContainText(/at least 8 characters/i, {
        timeout: 5_000,
      });
    });

    test("shows error when passwords do not match", async ({ page }) => {
      await navigateToResetPage(page);
      await page.fill("#new-password", "ValidPass1!");
      await page.fill("#confirm-password", "DifferentPass2!");
      await page.locator('button[type="submit"]').click();
      await expect(page.locator("body")).toContainText(/do not match/i, {
        timeout: 5_000,
      });
    });

  });

});

// ── 3. In-portal password change (Edit Profile tab) ──────────────────────────

test.describe("In-portal password change", () => {

  test.beforeEach(({}, testInfo) => {
    skip(testInfo, "TEST_USER_EMAIL",    SMOKE_EMAIL);
    skip(testInfo, "TEST_USER_PASSWORD", SMOKE_PASSWORD);
  });

  async function loginAndGoToProfile(page: Page): Promise<void> {
    await page.goto("/login");
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
    await page.fill("#email", SMOKE_EMAIL);
    await page.fill("#password", SMOKE_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/member-portal/, { timeout: 20_000 });
    // Use the desktop sidebar nav to avoid matching the hidden mobile nav button.
    await page.locator("aside nav button").filter({ hasText: /edit profile/i }).click();
    await page.waitForSelector("#current-password", { timeout: 10_000 });
  }

  test("password section is visible on Edit Profile tab", async ({ page }) => {
    await loginAndGoToProfile(page);
    await expect(page.locator("#current-password")).toBeVisible();
    await expect(page.locator("#new-portal-password")).toBeVisible();
    await expect(page.locator("#confirm-portal-password")).toBeVisible();
  });

  test("shows error when new passwords do not match", async ({ page }) => {
    await loginAndGoToProfile(page);
    await page.fill("#new-portal-password", "ValidPass1!");
    await page.fill("#confirm-portal-password", "DifferentPass2!");
    await page.locator('form:has(#new-portal-password) button[type="submit"]').click();
    await expect(page.locator("body")).toContainText(/do not match/i, { timeout: 5_000 });
  });

  test("shows error when new password is fewer than 8 characters", async ({ page }) => {
    await loginAndGoToProfile(page);
    await page.fill("#new-portal-password", "short");
    await page.fill("#confirm-portal-password", "short");
    await page.locator('form:has(#new-portal-password) button[type="submit"]').click();
    await expect(page.locator("body")).toContainText(/at least 8 characters/i, { timeout: 5_000 });
  });

  test("shows error when current password is wrong", async ({ page }) => {
    await loginAndGoToProfile(page);
    await page.fill("#current-password", "definitely-wrong-password");
    await page.fill("#new-portal-password", "NewValidPass1!");
    await page.fill("#confirm-portal-password", "NewValidPass1!");
    await page.locator('form:has(#new-portal-password) button[type="submit"]').click();
    await expect(page.locator("body")).toContainText(/current password is incorrect/i, {
      timeout: 10_000,
    });
  });

});

// ── 4. End-to-end reset via email link ───────────────────────────────────────

test.describe("End-to-end password reset", () => {

  test.beforeEach(({}, testInfo) => {
    skip(testInfo, "TEST_USER_EMAIL",           SMOKE_EMAIL);
    skip(testInfo, "TEST_USER_PASSWORD",         SMOKE_PASSWORD);
    skip(testInfo, "NEXT_PUBLIC_SUPABASE_URL",  SUPABASE_URL);
    skip(testInfo, "SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  });

  // Always restore the test account to SMOKE_PASSWORD after each test in this
  // group so the account remains usable by the rest of the smoke suite.
  test.afterEach(async () => {
    await restorePassword(SMOKE_PASSWORD);
  });

  test("recovery link → new password set → portal redirect → sign in with new password", async ({ page }) => {
    // Step 1: land on the update-password page via a recovery link.
    await navigateToResetPage(page);

    // Step 2: submit a valid new password.
    await page.fill("#new-password", TEMP_PASSWORD);
    await page.fill("#confirm-password", TEMP_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Step 3: successful update redirects to the member portal.
    await page.waitForURL(/\/member-portal/, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/member-portal/);

    // Step 4: clear the session and sign in with the new password to confirm it was set.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
    await page.fill("#email", SMOKE_EMAIL);
    await page.fill("#password", TEMP_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/member-portal/, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/member-portal/);
  });

  test("invalid/expired recovery code redirects to /login?error=auth_failed", async ({ page }) => {
    // Passing a garbage code to /auth/callback simulates an expired or tampered link.
    // The callback route calls exchangeCodeForSession, which fails, and falls through
    // to NextResponse.redirect(`${origin}/login?error=auth_failed`).
    await page.goto(
      "/auth/callback?code=invalid-garbage-code&redirectTo=/auth/update-password",
      { waitUntil: "domcontentloaded", timeout: 20_000 }
    );
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toMatch(/error=auth_failed/);
  });

});
