/**
 * Proxy Assignment — Full Workflow Tests
 *
 * Covers the complete proxy assignment flow end-to-end:
 *   - Page structure and content
 *   - Form validation (client-side and server-side)
 *   - Successful submission and success state
 *   - Spam protection (honeypot, Turnstile, disposable email, rate limit)
 *   - API contract (field presence, response shapes)
 *
 * NOTE: waitUntil "networkidle" is intentionally NOT used for the /proxy page —
 * the Cloudflare Turnstile widget holds open long-poll connections that prevent
 * networkidle from ever firing. Use "domcontentloaded" + explicit element waits.
 *
 * NOTE: Each API test group uses a distinct X-Forwarded-For header so tests
 * don't share the in-memory rate-limit bucket.
 *
 * Run:
 *   npx playwright test tests/proxy-workflow.spec.ts
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Launch gate
//
// /proxy and POST /api/proxy are gated by the `proxy_open` key in site_config
// (lib/site-gates.ts) and default closed. The pre-existing suite below exercises
// the open path, so the gate is opened for the file and closed again after.
// This doubles as the "open must not wrongly block" assertion: if the gate
// regressed, every submission test in this file would fail.
//
// Gate state is global. This file must not run in parallel with anything else
// touching `proxy_open`.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminDb() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run the proxy gate tests"
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

async function setProxyGate(open: boolean) {
  const { error } = await adminDb()
    .from("site_config")
    .upsert(
      { key: "proxy_open", value: open ? "true" : "false", updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) throw new Error(`Failed to set proxy_open=${open}: ${error.message}`);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await setProxyGate(true);
});

test.afterAll(async () => {
  // Always leave the gate closed, whatever happened above.
  await setProxyGate(false);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Unique IP prefix per test group to isolate in-memory rate limit buckets.
// The rate limiter keys on req.headers.get("x-forwarded-for") ?? "unknown".
const IP = {
  structure: "10.0.1.1",
  clientValidation: "10.0.2.1",
  submission: "10.0.3.1",
  apiValidation: "10.0.4.1",
  rateLimitTest: "10.0.5.1",
  honeypot: "10.0.6.1",
} as const;

const VALID_PAYLOAD = {
  name: "James McPherson",
  email: "james.mcpherson@example.com",
  numShares: "500",
  yearPurchased: "1995",
  source: "Word of mouth",
  turnstileToken: "test-token",
};

async function postProxy(
  request: APIRequestContext,
  body: Record<string, unknown>,
  ip = IP.apiValidation
) {
  return request.post("/api/proxy", {
    data: body,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
  });
}

async function gotoProxy(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
  // domcontentloaded avoids waiting for Turnstile long-poll connections
  await page.goto("/proxy", { waitUntil: "domcontentloaded" });
  // Wait for form hydration — name input is rendered by the client component
  await page.waitForSelector("#name", { timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// 1. Page structure
// ---------------------------------------------------------------------------

test.describe("Proxy Assignment page — structure", () => {
  test("page loads with 200 and renders key headings", async ({ page }) => {
    const res = await page.goto("/proxy", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).toContainText(/proxy/i);
  });

  test("registration form is present with all fields", async ({ page }) => {
    await gotoProxy(page);
    await expect(page.locator("form")).toBeVisible();
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#numShares")).toBeVisible();
    await expect(page.locator("#yearPurchased")).toBeVisible();
    await expect(page.locator("#source")).toBeVisible();
  });

  test("consent checkbox is present and unchecked by default", async ({ page }) => {
    await gotoProxy(page);
    const checkbox = page.locator('input[type="checkbox"]');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
  });

  test("submit button is labelled correctly", async ({ page }) => {
    await gotoProxy(page);
    await expect(
      page.locator('button[type="submit"]')
    ).toContainText(/Register Proxy Intent/i);
  });

  test("honeypot field is hidden", async ({ page }) => {
    await gotoProxy(page);
    const honeypot = page.locator('input[name="website"]');
    await expect(honeypot).toBeHidden();
  });

  test("privacy policy link is present in consent text", async ({ page }) => {
    await gotoProxy(page);
    const privacyLink = page.locator('a[href="/privacy"]').first();
    await expect(privacyLink).toBeVisible();
  });

  test("source dropdown has expected options", async ({ page }) => {
    await gotoProxy(page);
    const select = page.locator("#source");
    await expect(select).toBeVisible();
    await expect(select.locator("option", { hasText: "Twitter / X" })).toBeAttached();
    await expect(select.locator("option", { hasText: "Word of mouth" })).toBeAttached();
    await expect(select.locator("option", { hasText: "Media / press" })).toBeAttached();
  });
});

// ---------------------------------------------------------------------------
// 2. Client-side validation
// ---------------------------------------------------------------------------

test.describe("Proxy Assignment form — client-side validation", () => {
  test("submitting without consent shows consent error", async ({ page }) => {
    await gotoProxy(page);

    await page.route("**/api/proxy", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ success: true }) })
    );

    await page.fill("#name", "James McPherson");
    await page.fill("#email", "james@example.com");
    // Leave consent unchecked
    await page.click('button[type="submit"]');

    await expect(
      page.locator("text=Please confirm your consent")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("form fields accept and retain input", async ({ page }) => {
    await gotoProxy(page);

    await page.fill("#name", "James McPherson");
    await page.fill("#email", "james@example.com");
    await page.fill("#numShares", "500 Ordinary");
    await page.fill("#yearPurchased", "1995");
    await page.selectOption("#source", "Word of mouth");

    await expect(page.locator("#name")).toHaveValue("James McPherson");
    await expect(page.locator("#email")).toHaveValue("james@example.com");
    await expect(page.locator("#numShares")).toHaveValue("500 Ordinary");
    await expect(page.locator("#yearPurchased")).toHaveValue("1995");
    await expect(page.locator("#source")).toHaveValue("Word of mouth");
  });

  test("consent checkbox can be checked", async ({ page }) => {
    await gotoProxy(page);
    const checkbox = page.locator('input[type="checkbox"]');
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// 3. Successful submission (API mocked)
// ---------------------------------------------------------------------------

test.describe("Proxy Assignment form — successful submission", () => {
  async function submitForm(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
    await gotoProxy(page);

    // Mock Supabase auth (prefill useEffect) and the proxy API
    await page.route("**/auth/v1/user**", (route) =>
      route.fulfill({ status: 401, body: JSON.stringify({}) })
    );
    await page.route("**/api/proxy", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ success: true }) })
    );

    await page.fill("#name", "James McPherson");
    await page.fill("#email", "james@example.com");
    await page.fill("#numShares", "500 Ordinary + 500 Preference");
    await page.fill("#yearPurchased", "1995");
    await page.selectOption("#source", "Word of mouth");
    await page.locator('input[type="checkbox"]').check();

    await page.click('button[type="submit"]');

    // If Turnstile widget hasn't resolved yet, wait and retry once
    const turnstileErr = page.locator("text=Security check not completed");
    const successHeading = page.locator("text=Proxy Intent Registered");

    const which = await Promise.race([
      turnstileErr.waitFor({ state: "visible", timeout: 3_000 }).then(() => "turnstile"),
      successHeading.waitFor({ state: "visible", timeout: 8_000 }).then(() => "success"),
    ]).catch(() => "timeout");

    if (which === "turnstile") {
      await page.waitForTimeout(2_000);
      await page.click('button[type="submit"]');
    }
  }

  test("shows success heading and confirmation text", async ({ page }) => {
    await submitForm(page);
    await expect(page.locator("text=Proxy Intent Registered")).toBeVisible({ timeout: 10_000 });
    // Copy corrected in Package 1: the appointee is a named person, not CSL.
    await expect(
      page.getByText(/We will send you the official proxy form/i)
    ).toBeVisible();
  });

  test("success state has a link to /membership", async ({ page }) => {
    await submitForm(page);
    await expect(page.locator("text=Proxy Intent Registered")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Support Our Work - Join CSL")).toBeVisible();
  });

  test("success state replaces the form (form no longer visible)", async ({ page }) => {
    await submitForm(page);
    await expect(page.locator("text=Proxy Intent Registered")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("form")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. API — validation and error responses
// ---------------------------------------------------------------------------

test.describe("POST /api/proxy — server-side validation", () => {
  // Each test uses its own unique IP suffix so they don't share rate limit counts
  let ipCounter = 100;
  function nextIp() { return `10.0.4.${ipCounter++}`; }

  test("returns 400 when name is missing", async ({ request }) => {
    const res = await postProxy(request, { ...VALID_PAYLOAD, name: "" }, nextIp());
    expect(res.status()).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/name and email are required/i);
  });

  test("returns 400 when email is missing", async ({ request }) => {
    const res = await postProxy(request, { ...VALID_PAYLOAD, email: "" }, nextIp());
    expect(res.status()).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/name and email are required/i);
  });

  test("returns 400 for malformed email", async ({ request }) => {
    const res = await postProxy(request, { ...VALID_PAYLOAD, email: "not-an-email" }, nextIp());
    expect(res.status()).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/valid email/i);
  });

  test("returns 400 when Turnstile token is missing", async ({ request }) => {
    const res = await postProxy(request, { ...VALID_PAYLOAD, turnstileToken: "" }, nextIp());
    expect(res.status()).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/bot detection/i);
  });

  test("returns 400 for disposable email domain", async ({ request }) => {
    const res = await postProxy(request, { ...VALID_PAYLOAD, email: "user@mailinator.com" }, nextIp());
    expect(res.status()).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/permanent email/i);
  });

  test("returns 400 for malformed JSON body", async ({ request }) => {
    const res = await request.post("/api/proxy", {
      data: "this is not json {{{",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": nextIp(),
      },
    });
    expect(res.status()).toBe(400);
  });

  test("optional fields (numShares, yearPurchased, source) are accepted when omitted", async ({ request }) => {
    const res = await postProxy(request, {
      name: "James McPherson",
      email: "james.minimal@example.com",
      turnstileToken: "test-token",
    }, nextIp());
    // Should reach DB insert — will succeed (200) or fail with 500 if DB unreachable,
    // but must NOT return 400 (no validation error for optional fields)
    expect(res.status()).not.toBe(400);
  });

  test("returns 429 after 5 requests from same IP", async ({ request }) => {
    const ip = IP.rateLimitTest;
    for (let i = 0; i < 4; i++) {
      await postProxy(request, VALID_PAYLOAD, ip);
    }
    const res = await postProxy(request, VALID_PAYLOAD, ip);
    expect(res.status()).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/too many requests/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Appointee copy
//
// A proxy cannot be appointed to a company. The page must not state or imply
// that CSL itself is the proxy holder.
//
// Scoped to /proxy, which is the page corrected in Package 1. The same claim
// still appears on /faq and /share-tracing and is reported, not fixed, in this
// package - so this assertion is deliberately not run site-wide yet.
// ---------------------------------------------------------------------------

test.describe("Proxy Assignment — appointee copy", () => {
  test("page never names CSL as the proxy holder", async ({ page }) => {
    await page.goto("/proxy", { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").innerText();

    expect(body).not.toMatch(/as your proxy holder/i);
    expect(body).not.toMatch(/proxy (vote )?to (CSL|Celtic Supporters Limited)/i);
    expect(body).not.toMatch(/naming Celtic Supporters Limited/i);
  });

  test("page states the proxy goes to a named person", async ({ page }) => {
    await page.goto("/proxy", { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").innerText();

    expect(body).toMatch(/appointed to a named person, not to a company/i);
  });
});

// ---------------------------------------------------------------------------
// 6. Honeypot — bot rejected silently in browser
// ---------------------------------------------------------------------------

test.describe("Proxy Assignment — honeypot", () => {
  test("filling the honeypot shows success without calling the API", async ({ page }) => {
    await gotoProxy(page);

    let apiCalled = false;
    await page.route("**/api/proxy", (route) => {
      apiCalled = true;
      route.continue();
    });

    // Reveal and fill the honeypot
    await page.evaluate(() => {
      const hp = document.querySelector<HTMLInputElement>('input[name="website"]');
      if (hp) {
        hp.style.display = "block";
        hp.value = "http://spam.example.com";
      }
    });

    await page.fill("#name", "Bot User");
    await page.fill("#email", "bot@example.com");
    await page.locator('input[type="checkbox"]').check();
    await page.click('button[type="submit"]');

    await expect(
      page.locator("text=Proxy Intent Registered")
    ).toBeVisible({ timeout: 5_000 });

    expect(apiCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Launch gate closed
//
// Runs last: it closes the gate, and the file-level afterAll leaves it closed.
// ---------------------------------------------------------------------------

test.describe("Proxy Assignment — gate closed", () => {
  test.beforeAll(async () => {
    await setProxyGate(false);
  });

  test("page renders explanation but no form", async ({ page }) => {
    const res = await page.goto("/proxy", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);

    // Explanatory content still present - this must not be a 404.
    await expect(page.locator("h1")).toContainText(/Appoint Your/i);
    await expect(page.getByText(/What Is Proxy Voting/i).first()).toBeVisible();

    // Holding message shown, form absent.
    await expect(page.getByText(/Notice of the Annual General Meeting/i).first()).toBeVisible();
    await expect(page.locator("#name")).toHaveCount(0);
    await expect(page.locator('button[type="submit"]')).toHaveCount(0);

    // Join CSL route stays available.
    await expect(page.locator('a[href="/membership"]').first()).toBeVisible();
  });

  test("POST returns 403", async ({ request }) => {
    const res = await postProxy(request, VALID_PAYLOAD, "10.8.0.1");

    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error: string; closed?: boolean };
    expect(body.closed).toBe(true);
    expect(body.error).toMatch(/not open yet/i);
  });
});
