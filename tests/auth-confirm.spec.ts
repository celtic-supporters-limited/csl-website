/**
 * Tests for the /auth/confirm page and /api/auth/verify route.
 *
 * These cover the SafeLinks-safe auth flow introduced in PR #72:
 *   password reset  → /auth/confirm?token_hash=...&type=recovery   → button click → /auth/update-password
 *   magic link      → /auth/confirm?token_hash=...&type=magiclink  → button click → /member-portal
 *
 * The flow uses a GET redirect from /api/auth/verify — no client-side fetch.
 * This ensures the session cookie is committed by the browser before the
 * follow-up request fires (Set-Cookie on a redirect response is always applied
 * before the browser makes the redirected request, avoiding cookie race conditions).
 *
 * The e2e tests use admin.generateLink to obtain a real hashed_token without
 * sending any email — the token is passed directly to the confirm page URL.
 *
 * Required in .env.test.local:
 *   TEST_USER_EMAIL              — email of a known member account
 *   TEST_USER_PASSWORD           — current password (restored in afterEach)
 *   NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY    — service-role key (for admin.generateLink)
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const EMAIL    = process.env.TEST_USER_EMAIL           ?? "";
const PASSWORD = process.env.TEST_USER_PASSWORD        ?? "";
const SB_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const SB_ANON  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SB_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const TEMP_PASSWORD = "TempReset!99";

function skip(testInfo: { skip(reason: string): void }, name: string, value: string) {
  if (!value) testInfo.skip(`${name} not set — skipping`);
}

function admin() {
  return createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
}

async function getHashedToken(type: "recovery" | "magiclink"): Promise<string> {
  const { data, error } = await admin().auth.admin.generateLink({ type, email: EMAIL });
  if (error) throw new Error(`generateLink failed: ${error.message}`);
  const token = (data as { properties?: { hashed_token?: string } })?.properties?.hashed_token;
  if (!token) throw new Error("hashed_token was null — check Supabase version");
  return token;
}

async function restorePassword(): Promise<void> {
  if (!SB_URL || !SB_KEY || !EMAIL) return;
  const { data: member } = await admin()
    .from("members")
    .select("user_id")
    .eq("email", EMAIL)
    .maybeSingle();
  if (member?.user_id) {
    await admin().auth.admin.updateUserById(member.user_id, { password: PASSWORD });
  }
}

// ── 1. /auth/confirm page — rendering ────────────────────────────────────────

test.describe("/auth/confirm page", () => {

  test("shows error card when token_hash or type is missing", async ({ page }) => {
    await page.goto("/auth/confirm");
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
    await expect(page.locator("body")).toContainText(/invalid or has expired/i, { timeout: 10_000 });
    await expect(page.locator("main a[href='/login']")).toBeVisible();
  });

  test("shows password-reset button when type=recovery", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=fake-token&type=recovery");
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
    await expect(
      page.locator("button", { hasText: /continue to password reset/i })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("body")).toContainText(/reset your password/i);
  });

  test("shows sign-in button when type=magiclink", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=fake-token&type=magiclink");
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
    await expect(
      page.locator("button", { hasText: /continue to your account/i })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("body")).toContainText(/sign in to csl/i);
  });

  test("shows expired-link card when ?error=expired is present", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=used-token&type=recovery&error=expired");
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
    await expect(page.locator("body")).toContainText(/link expired/i, { timeout: 10_000 });
    await expect(page.locator("body")).toContainText(/request a new link/i);
    // No action button in the card — only the error message and a back-to-sign-in link.
    await expect(page.locator("main button")).toHaveCount(0);
  });

});

// ── 2. POST /api/auth/verify — input validation ───────────────────────────────

test.describe("POST /api/auth/verify", () => {

  test("returns 400 when token_hash is missing", async ({ request }) => {
    const res = await request.post("/api/auth/verify", {
      data: JSON.stringify({ type: "recovery" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { ok: boolean; message?: string };
    expect(body.ok).toBe(false);
  });

  test("returns 400 when type is missing", async ({ request }) => {
    const res = await request.post("/api/auth/verify", {
      data: JSON.stringify({ token_hash: "something" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  test("returns 400 when type is not recovery or magiclink", async ({ request }) => {
    const res = await request.post("/api/auth/verify", {
      data: JSON.stringify({ token_hash: "something", type: "signup" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  test("returns 400 for malformed JSON body", async ({ request }) => {
    const res = await request.post("/api/auth/verify", {
      data: "{{not json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 400 for an invalid or expired token_hash", async ({ request }) => {
    const res = await request.post("/api/auth/verify", {
      data: JSON.stringify({ token_hash: "totally-invalid-token", type: "recovery" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });

});

// ── 3. GET /api/auth/verify — redirect behaviour ──────────────────────────────

test.describe("GET /api/auth/verify", () => {

  test("redirects to /login for missing token_hash or invalid type", async ({ request }) => {
    const res = await request.get("/api/auth/verify", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/\/login/);
  });

  test("redirects to /auth/confirm?error=expired for a bad token_hash", async ({ request }) => {
    const res = await request.get(
      "/api/auth/verify?token_hash=invalid-garbage&type=recovery",
      { maxRedirects: 0 }
    );
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/error=expired/);
  });

});

// ── 4. End-to-end: password reset via confirm page ────────────────────────────
//
// These tests run serially to avoid race conditions consuming the same token.

test.describe("E2E: password reset via /auth/confirm", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    skip(testInfo, "TEST_USER_EMAIL",           EMAIL);
    skip(testInfo, "TEST_USER_PASSWORD",         PASSWORD);
    skip(testInfo, "NEXT_PUBLIC_SUPABASE_URL",  SB_URL);
    skip(testInfo, "SUPABASE_SERVICE_ROLE_KEY", SB_KEY);
  });

  test("recovery token → confirm page button → lands on /auth/update-password with form visible", async ({ page }) => {
    const tokenHash = await getHashedToken("recovery");

    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=recovery`);
    await page.waitForLoadState("networkidle", { timeout: 20_000 });

    const btn = page.locator("button", { hasText: /continue to password reset/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();

    await page.waitForURL(/\/auth\/update-password/, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/auth\/update-password/);

    // The update-password form must render — confirms the session was written to
    // cookies correctly and the UpdatePasswordForm's session guard passed.
    await expect(page.locator("#new-password")).toBeVisible({ timeout: 15_000 });
  });

  test("same recovery token cannot be used twice (one-time use)", async ({ request }) => {
    const tokenHash = await getHashedToken("recovery");

    // First use via GET — should redirect to /auth/update-password.
    const first = await request.get(
      `/api/auth/verify?token_hash=${tokenHash}&type=recovery`,
      { maxRedirects: 0 }
    );
    expect(first.status()).toBe(307);
    expect(first.headers()["location"]).toMatch(/\/auth\/update-password/);

    // Second use via GET — should redirect to confirm with expired error.
    const second = await request.get(
      `/api/auth/verify?token_hash=${tokenHash}&type=recovery`,
      { maxRedirects: 0 }
    );
    expect(second.status()).toBe(307);
    expect(second.headers()["location"]).toMatch(/error=expired/);
  });

});

// ── 5. End-to-end: magic link via confirm page ────────────────────────────────

test.describe("E2E: magic link via /auth/confirm", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    skip(testInfo, "TEST_USER_EMAIL",           EMAIL);
    skip(testInfo, "NEXT_PUBLIC_SUPABASE_URL",  SB_URL);
    skip(testInfo, "SUPABASE_SERVICE_ROLE_KEY", SB_KEY);
  });

  test("magiclink token → confirm page button → lands on /member-portal", async ({ page }) => {
    const tokenHash = await getHashedToken("magiclink");

    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=magiclink`);
    await page.waitForLoadState("networkidle", { timeout: 20_000 });

    const btn = page.locator("button", { hasText: /continue to your account/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();

    await page.waitForURL(/\/member-portal/, { timeout: 30_000 });
    expect(page.url()).toMatch(/\/member-portal/);
  });

  test("member portal is accessible after magic link sign-in", async ({ page }) => {
    const tokenHash = await getHashedToken("magiclink");

    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=magiclink`);
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
    await page.locator("button", { hasText: /continue to your account/i }).click();
    await page.waitForURL(/\/member-portal/, { timeout: 30_000 });

    // Simulate a same-session navigation to another portal tab — must not redirect to login.
    await page.evaluate(() => {
      sessionStorage.setItem("csl-auth-alive", "1");
      window.location.href = "/member-portal?tab=subscription";
    });
    await page.waitForURL(/\/member-portal/, { timeout: 15_000 });
    expect(page.url()).not.toMatch(/\/login/);
  });

});
