/**
 * Spam Protection Tests
 *
 * Covers the four-layer spam protection applied to the proxy and share-tracing
 * forms: honeypot, Turnstile token presence, disposable email blocking, and
 * IP-based rate limiting.
 *
 * API tests use the `request` fixture to POST directly to the API routes,
 * bypassing the UI entirely. Rate-limit tests spoof x-forwarded-for with a
 * dedicated test IP so they never interfere with other tests or each other.
 *
 * Honeypot tests navigate to the page and set the hidden input via
 * page.evaluate — real users cannot see or fill it, bots often do.
 *
 * Run:
 *   npx playwright test tests/spam-protection.spec.ts
 */

import { test, expect } from "@playwright/test";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function postProxy(
  request: Parameters<Parameters<typeof test>[1]>[0]["request"],
  data: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  return request.post("/api/proxy", { data, headers });
}

async function postShareTracing(
  request: Parameters<Parameters<typeof test>[1]>[0]["request"],
  data: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  return request.post("/api/share-tracing", { data, headers });
}

// ── Proxy form ────────────────────────────────────────────────────────────────

test.describe("Proxy form — spam protection", () => {

  test("honeypot: shows success without calling API when hidden field is filled", async ({ page }) => {
    await page.goto("/proxy");
    await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 60_000 });

    let apiCalled = false;
    await page.route("**/api/proxy", async (route) => {
      apiCalled = true;
      await route.continue();
    });

    // Set the hidden honeypot input value directly — real users never see it
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[name="website"]');
      if (input) input.value = "filled-by-bot";
    });

    await page.fill('[name="name"]', "Test Bot");
    await page.fill('[name="email"]', "bot@example.com");
    await page.check('input[type="checkbox"]');
    await page.click('button[type="submit"]');

    await expect(page.getByText("Proxy Intent Registered")).toBeVisible({ timeout: 5_000 });
    expect(apiCalled).toBe(false);
  });

  test("Turnstile token missing: API returns 400", async ({ request }) => {
    const res = await postProxy(request, {
      name: "Test User",
      email: "test@example.com",
      // intentionally omitting turnstileToken
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/bot detection token missing/i);
  });

  test("disposable email: API returns 400", async ({ request }) => {
    const res = await postProxy(request, {
      name: "Test User",
      email: "test@mailinator.com",
      turnstileToken: "test-token",
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/permanent email/i);
  });

  test("rate limiting: 429 after 5 requests from same IP", async ({ request }) => {
    // Suffix with timestamp so each test run gets a fresh Map entry even if
    // the dev server hot-reloads the route module between runs.
    const ip = `10.99.2.1-${Date.now()}`;
    const payload = {
      name: "Test User",
      email: "test@example.com",
      // No turnstileToken — each request returns 400 after the rate check passes,
      // so the rate counter increments without inserting anything into the database.
    };

    for (let i = 0; i < 5; i++) {
      await postProxy(request, payload, { "x-forwarded-for": ip });
    }

    const res = await postProxy(request, payload, { "x-forwarded-for": ip });
    expect(res.status()).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
  });

});

// ── Share tracing form ────────────────────────────────────────────────────────

test.describe("Share tracing form — spam protection", () => {

  test("honeypot: shows success without calling API when hidden field is filled", async ({ page }) => {
    await page.goto("/share-tracing");
    await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 60_000 });

    let apiCalled = false;
    await page.route("**/api/share-tracing", async (route) => {
      apiCalled = true;
      await route.continue();
    });

    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[name="website"]');
      if (input) input.value = "filled-by-bot";
    });

    await page.fill('[name="name"]', "Test Bot");
    await page.fill('[name="email"]', "bot@example.com");
    await page.selectOption('[name="enquiryType"]', "I have lost my share certificate");
    await page.check('input[type="checkbox"]');
    await page.click('button[type="submit"]');

    await expect(page.getByText("Enquiry Received")).toBeVisible({ timeout: 5_000 });
    expect(apiCalled).toBe(false);
  });

  test("Turnstile token missing: API returns 400", async ({ request }) => {
    const res = await postShareTracing(request, {
      name: "Test User",
      email: "test@example.com",
      enquiryType: "I have lost my share certificate",
      // intentionally omitting turnstileToken
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/bot detection token missing/i);
  });

  test("disposable email: API returns 400", async ({ request }) => {
    const res = await postShareTracing(request, {
      name: "Test User",
      email: "test@guerrillamail.com",
      enquiryType: "I have lost my share certificate",
      turnstileToken: "test-token",
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/permanent email/i);
  });

  test("rate limiting: 429 after 5 requests from same IP", async ({ request }) => {
    const ip = `10.99.2.2-${Date.now()}`;
    const payload = {
      name: "Test User",
      email: "test@example.com",
      enquiryType: "I have lost my share certificate",
    };

    for (let i = 0; i < 5; i++) {
      await postShareTracing(request, payload, { "x-forwarded-for": ip });
    }

    const res = await postShareTracing(request, payload, { "x-forwarded-for": ip });
    expect(res.status()).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
  });

});
