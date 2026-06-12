/**
 * Pre-go-live smoke test suite.
 *
 * Verifies live-site behaviours that local tests cannot exercise: real auth
 * flows, portal access with a known account, API security checks against the
 * deployed build, and Stripe webhook signature validation.
 *
 * Run against the live site:
 *   $env:PLAYWRIGHT_BASE_URL="https://csl-website-ten.vercel.app"
 *   npx playwright test tests/smoke.spec.ts
 *
 * Requires in .env.test.local:
 *   TEST_USER_EMAIL         — email of a known member account (is_admin = true)
 *   TEST_USER_PASSWORD      — password for that account
 *   STRIPE_WEBHOOK_SECRET   — webhook signing secret (live or test, must match Vercel)
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — for admin API calls
 *
 * Email-dependent auth flows (password reset, magic link) bypass the inbox by
 * calling the Supabase admin API to generate tokens directly.
 *
 * Turnstile note: checkout API-level tests work against live because the
 * honeypot and missing-token rejections happen before Turnstile verification.
 * The full checkout UI → Stripe redirect is covered by checkout-flow.spec.ts
 * which runs against the local dev server with Cloudflare dummy keys.
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

test.describe.configure({ mode: "serial" });

// ── Config ────────────────────────────────────────────────────────────────────

const SMOKE_EMAIL    = process.env.TEST_USER_EMAIL    ?? "";
const SMOKE_PASSWORD = process.env.TEST_USER_PASSWORD ?? "";
const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

function skip(testInfo: { skip(reason: string): void }, name: string, value: string) {
  if (!value) testInfo.skip(`${name} not set — skipping`);
}

function adminSupabase() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/member-portal/, { timeout: 20_000 });
}

function signWebhook(payload: object, secret: string): { body: string; sig: string } {
  const body      = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const hmac      = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return { body, sig: `t=${timestamp},v1=${hmac}` };
}

// ── 1. Public pages ───────────────────────────────────────────────────────────

test.describe("Public pages", () => {

  const pages: Array<[string, RegExp]> = [
    ["/",               /Celtic Supporters/i],
    ["/membership",     /Standard/i],
    ["/share-tracing",  /share tracing/i],
    ["/proxy",          /proxy/i],
    ["/governance",     /accountability/i],
    ["/our-team",       /director/i],
    ["/celtic-paradox", /celtic paradox/i],
    ["/faq",            /faq|frequently/i],
    ["/privacy",        /privacy/i],
    ["/terms",          /terms/i],
  ];

  for (const [path, text] of pages) {
    test(`${path} responds 200 and renders`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
      expect(res?.status()).toBeLessThan(400);
      await expect(page.locator("body")).toContainText(text, { timeout: 10_000 });
    });
  }

});

// ── 2. Auth guard ─────────────────────────────────────────────────────────────

test.describe("Auth guard — unauthenticated access", () => {

  const protectedRoutes = [
    "/member-portal",
    "/member-portal/documents",
    "/member-portal/admin/members",
  ];

  for (const path of protectedRoutes) {
    test(`${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL(/\/login/, { timeout: 10_000 });
      expect(page.url()).toMatch(/\/login/);
    });
  }

});

// ── 3. Login and portal ───────────────────────────────────────────────────────

test.describe("Login and member portal", () => {

  test.beforeEach(({}, testInfo) => {
    skip(testInfo, "TEST_USER_EMAIL",    SMOKE_EMAIL);
    skip(testInfo, "TEST_USER_PASSWORD", SMOKE_PASSWORD);
  });

  test("email + password login reaches portal", async ({ page }) => {
    await login(page, SMOKE_EMAIL, SMOKE_PASSWORD);
    expect(page.url()).toMatch(/\/member-portal/);
    await expect(page.locator("body")).toContainText(/dashboard/i, { timeout: 10_000 });
  });

  test("My Membership tab renders", async ({ page }) => {
    await login(page, SMOKE_EMAIL, SMOKE_PASSWORD);
    await page.locator("button", { hasText: /my membership/i }).first().click();
    await expect(page.locator("body")).toContainText(/subscription|monthly|annual|lifetime|no active/i, { timeout: 10_000 });
  });

  test("Payments tab renders", async ({ page }) => {
    await login(page, SMOKE_EMAIL, SMOKE_PASSWORD);
    await page.locator("button", { hasText: /payments/i }).first().click();
    // Either payment rows or an empty-state message
    await expect(page.locator("body")).toContainText(/payment|amount|no payment/i, { timeout: 10_000 });
  });

  test("Edit Profile tab shows first name field", async ({ page }) => {
    await login(page, SMOKE_EMAIL, SMOKE_PASSWORD);
    await page.locator("button", { hasText: /edit profile/i }).first().click();
    await expect(page.locator("#first-name")).toBeVisible({ timeout: 10_000 });
  });

  test("Documents page loads for authenticated member", async ({ page }) => {
    await login(page, SMOKE_EMAIL, SMOKE_PASSWORD);
    await page.goto("/member-portal/documents");
    await expect(page.locator("body")).toContainText(/document|library|no document/i, { timeout: 15_000 });
  });

  test("admin page loads for admin member", async ({ page }) => {
    await login(page, SMOKE_EMAIL, SMOKE_PASSWORD);
    await page.goto("/member-portal/admin/members");
    // Admin search form should be visible
    await expect(page.locator("body")).toContainText(/search|member lookup/i, { timeout: 10_000 });
  });

});

// ── 4. Password reset via Supabase admin API ──────────────────────────────────

test.describe("Password reset flow", () => {

  test.beforeEach(({}, testInfo) => {
    skip(testInfo, "TEST_USER_EMAIL",          SMOKE_EMAIL);
    skip(testInfo, "NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    skip(testInfo, "SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  });

  test("reset token redirects to /auth/update-password", async ({ page }) => {
    const supabase = adminSupabase();

    // Generate a recovery link without sending an email.
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: SMOKE_EMAIL,
    });

    expect(error).toBeNull();
    const actionLink = (data as { properties?: { action_link?: string } })?.properties?.action_link;
    expect(actionLink).toBeTruthy();

    // Supabase verifies the token, then redirects to /auth/callback,
    // which exchanges the code and redirects to /auth/update-password.
    // A working NEXT_PUBLIC_SITE_URL is required for this redirect to reach our app.
    await page.goto(actionLink!, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForURL(/\/auth\/update-password/, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/auth\/update-password/);
  });

  test("POST /api/auth/reset-password returns 200 for unregistered email (no enumeration)", async ({ request }) => {
    const res = await request.post("/api/auth/reset-password", {
      data: JSON.stringify({ email: "nobody-registered@smoke-test.example.com" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { sent?: boolean };
    expect(body.sent).toBe(true);
  });

  test("POST /api/auth/reset-password returns 400 for malformed body", async ({ request }) => {
    const res = await request.post("/api/auth/reset-password", {
      data: "{{not json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

});

// ── 5. Checkout API security ──────────────────────────────────────────────────

test.describe("Checkout API security", () => {

  test("honeypot field filled returns 400", async ({ request }) => {
    const res = await request.post("/api/checkout", {
      data: JSON.stringify({
        plan: "standard",
        email: "bot@example.com",
        turnstileToken: "anything",
        website: "http://spam.example.com",
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/invalid request/i);
  });

  test("missing Turnstile token returns 400", async ({ request }) => {
    const res = await request.post("/api/checkout", {
      data: JSON.stringify({ plan: "standard", email: "test@example.com" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/bot detection/i);
  });

  test("invalid plan name returns 400", async ({ request }) => {
    const res = await request.post("/api/checkout", {
      data: JSON.stringify({ plan: "not_a_real_plan", email: "test@example.com", turnstileToken: "x" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/invalid plan/i);
  });

  test("malformed JSON body returns 400", async ({ request }) => {
    const res = await request.post("/api/checkout", {
      data: "not json {{{",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

});

// ── 6. Stripe webhook endpoint ────────────────────────────────────────────────

test.describe("Stripe webhook endpoint", () => {

  test.beforeEach(({}, testInfo) => {
    skip(testInfo, "STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  });

  test("unsigned request rejected with 400", async ({ request }) => {
    const res = await request.post("/api/webhooks/stripe", {
      data: JSON.stringify({ type: "ping" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("correctly signed unknown event returns 200", async ({ request }) => {
    const payload = {
      id:       `evt_smoke_${Date.now()}`,
      object:   "event",
      type:     "smoke.test.noop",
      livemode: false,
      data:     { object: {} },
    };
    const { body, sig } = signWebhook(payload, WEBHOOK_SECRET);
    const res = await request.post("/api/webhooks/stripe", {
      data: body,
      headers: { "content-type": "application/json", "stripe-signature": sig },
    });
    expect(res.status()).toBe(200);
  });

  test("tampered payload rejected with 400", async ({ request }) => {
    const payload = {
      id:       `evt_smoke_tamper_${Date.now()}`,
      object:   "event",
      type:     "smoke.test.tamper",
      livemode: false,
      data:     { object: {} },
    };
    const { body, sig } = signWebhook(payload, WEBHOOK_SECRET);
    // Send a different body than what was signed
    const tamperedBody = body.replace("smoke.test.tamper", "malicious.event");
    const res = await request.post("/api/webhooks/stripe", {
      data: tamperedBody,
      headers: { "content-type": "application/json", "stripe-signature": sig },
    });
    expect(res.status()).toBe(400);
  });

});
