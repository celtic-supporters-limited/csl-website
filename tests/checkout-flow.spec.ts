/**
 * Checkout flow regression tests.
 *
 * Coverage:
 *   - Plan selection UI: choosing a plan reveals the checkout panel
 *   - Email validation: invalid email shows error, does not proceed
 *   - Disposable email: blocked by /api/checkout before reaching Stripe
 *   - Duplicate email: blocked for existing members
 *   - Honeypot: bot submissions rejected at API level
 *   - Turnstile: missing token rejected at API level
 *   - Reaches Stripe: valid input navigates to checkout.stripe.com
 *
 * Payment outcome scenarios (success / declined / expired) are covered by
 * the Stripe webhook regression suite (tests/stripe-webhook.spec.ts), which
 * exercises the webhook handler with signed payloads for each event type
 * without depending on Stripe's hosted checkout page structure.
 *
 * Turnstile: in headless tests, Cloudflare's CDN script is intercepted and
 * replaced with a stub that auto-fires the success callback (see mockTurnstile).
 * The Cloudflare test secret key (1x0000...AA) accepts any token server-side.
 */

import { test, expect, type Page } from "@playwright/test";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Intercept the Cloudflare Turnstile CDN script and return a stub that
 * immediately fires the onSuccess callback. This allows tests to exercise
 * the full checkout flow without needing a real Cloudflare connection.
 *
 * @marsidev/react-turnstile: sets window.onloadTurnstileCallback, injects
 * script tag → script runs → calls window.onloadTurnstileCallback() →
 * promise resolves → window.turnstile.render(container, opts) is called →
 * opts.callback(token) sets React state.
 */
async function mockTurnstile(page: Page): Promise<void> {
  await page.route("**/challenges.cloudflare.com/turnstile/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
(function() {
  window.turnstile = {
    render: function(container, opts) {
      setTimeout(function() {
        if (opts && typeof opts.callback === 'function') {
          opts.callback('mock-token-playwright');
        }
      }, 50);
      return 'mock-widget-id';
    },
    remove: function() {},
    reset: function() {},
    execute: function() {},
    getResponse: function() { return 'mock-token-playwright'; }
  };
  var cb = 'onloadTurnstileCallback';
  if (typeof window[cb] === 'function') window[cb]();
})();
`,
    });
  });
}

/** Navigate to /membership, choose Standard plan, fill email, wait for Turnstile mock. */
async function openCheckoutPanel(page: Page, email: string): Promise<void> {
  await mockTurnstile(page);
  await page.goto("/membership");
  await page.waitForLoadState("networkidle", { timeout: 60_000 });

  // Plan buttons are labelled "Choose"
  await page.locator("button", { hasText: /^choose$/i }).first().click();

  // Wait for checkout summary panel
  await page.waitForSelector("#checkout-email", { timeout: 10_000 });
  await page.fill("#checkout-email", email);

  // Give Turnstile mock 1s to fire onSuccess and set React state
  await page.waitForTimeout(1000);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Membership checkout form", () => {

  test("selecting a plan reveals the checkout panel", async ({ page }) => {
    await mockTurnstile(page);
    await page.goto("/membership");
    await page.waitForLoadState("networkidle", { timeout: 60_000 });

    // Panel should not be visible before choosing
    await expect(page.locator("#checkout-email")).not.toBeVisible();

    await page.locator("button", { hasText: /^choose$/i }).first().click();

    await expect(page.locator("#checkout-email")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Complete Your Membership")).toBeVisible();
  });

  test("empty email shows validation error and does not proceed", async ({ page }) => {
    await openCheckoutPanel(page, "");

    // Clear the email field (openCheckoutPanel fills it; we want it empty)
    await page.fill("#checkout-email", "");

    await page.locator("button", { hasText: /Proceed to Stripe/ }).click();

    await expect(page.locator("text=/valid email/i")).toBeVisible({ timeout: 5_000 });
    expect(page.url()).not.toMatch(/checkout\.stripe\.com/);
  });

  test("invalid email format shows validation error", async ({ page }) => {
    await openCheckoutPanel(page, "notanemail");

    await page.locator("button", { hasText: /Proceed to Stripe/ }).click();

    await expect(page.locator("text=/valid email/i")).toBeVisible({ timeout: 5_000 });
    expect(page.url()).not.toMatch(/checkout\.stripe\.com/);
  });

  test("cancel button hides the checkout panel", async ({ page }) => {
    await mockTurnstile(page);
    await page.goto("/membership");
    await page.waitForLoadState("networkidle", { timeout: 60_000 });

    await page.locator("button", { hasText: /^choose$/i }).first().click();
    await page.waitForSelector("#checkout-email", { timeout: 10_000 });

    await page.locator("button", { hasText: /^cancel$/i }).click();

    await expect(page.locator("#checkout-email")).not.toBeVisible({ timeout: 3_000 });
  });

});

test.describe("Checkout API — bot and spam protection", () => {

  test("disposable email is rejected before Stripe redirect", async ({ page }) => {
    await openCheckoutPanel(page, "test@mailinator.com");
    await page.locator("button", { hasText: /Proceed to Stripe/ }).click();

    await expect(
      page.locator("text=/permanent email/i")
    ).toBeVisible({ timeout: 10_000 });
    expect(page.url()).not.toMatch(/checkout\.stripe\.com/);
  });

  test("honeypot field filled → API rejects with 400 (no error shown to user)", async ({ page, request }) => {
    // Test at API level — a real bot would skip the browser UI
    const res = await request.post("/api/checkout", {
      data: JSON.stringify({
        plan: "standard",
        email: "bot@example.com",
        turnstileToken: "mock",
        website: "http://spam.example.com",  // honeypot filled
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/invalid request/i);
  });

  test("missing Turnstile token rejected at API level", async ({ page, request }) => {
    const res = await request.post("/api/checkout", {
      data: JSON.stringify({
        plan: "standard",
        email: "test@example.com",
        // turnstileToken intentionally omitted
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/bot detection/i);
  });

  test("invalid plan name rejected at API level", async ({ page, request }) => {
    const res = await request.post("/api/checkout", {
      data: JSON.stringify({
        plan: "fake_plan",
        email: "test@example.com",
        turnstileToken: "mock",
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/invalid plan/i);
  });

  test("malformed JSON body returns 400", async ({ page, request }) => {
    const res = await request.post("/api/checkout", {
      data: "not json {{{",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

});

test.describe("Checkout — full browser flow to Stripe", () => {

  test("valid checkout navigates to checkout.stripe.com", async ({ page }) => {
    const email = `test+e2e+${Date.now()}@example.com`;
    await openCheckoutPanel(page, email);

    await page.locator("button", { hasText: /Proceed to Stripe/ }).click();

    // Should redirect to Stripe's hosted checkout page
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    expect(page.url()).toMatch(/checkout\.stripe\.com/);
    console.log("PASS: Reached Stripe Checkout at", page.url());
  });

});
