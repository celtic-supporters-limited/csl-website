/**
 * Full sign-up flow tests — monthly, annual, and lifetime membership.
 *
 * Each test completes a real Stripe test-mode checkout, fires the
 * checkout.session.completed webhook to the local dev server, then
 * exercises the /signup form and verifies the resulting Supabase state.
 *
 * PREREQUISITES (check before running):
 *   1. Dev server running on port 3001 (started automatically by playwright.config.ts)
 *   2. .env.local has MEMBERSHIP_OPEN=true
 *   3. STRIPE_WEBHOOK_SECRET in .env.local matches the one the dev server uses
 *      (the test reads it directly from .env.local to sign webhook payloads)
 *   4. NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.test.local
 *      point at the staging Supabase project
 *
 * WHY the webhook is fired manually:
 *   The checkout success_url is built from NEXT_PUBLIC_SITE_URL, which in
 *   .env.local points at the production Vercel deployment. Stripe therefore
 *   redirects the browser there after payment — and sends the webhook to the
 *   production endpoint, not localhost. The test catches the redirect,
 *   extracts the session_id, signs a minimal checkout.session.completed
 *   event, and POSTs it directly to http://localhost:3001/api/webhooks/stripe
 *   before navigating back to the local success page.
 *
 * TEST ACCOUNTS (one-shot — each email can only be used once):
 *   Each run requires fresh email suffixes — once a member row exists in
 *   Supabase the checkout API rejects the same email. Increment the suffix
 *   for every new run (signup11/12/13, signup14/15/16, etc.).
 *   Last used: signup7 (monthly), signup8 (annual), signup10 (lifetime).
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import path from "path";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

// ── Config ─────────────────────────────────────────────────────────────────────

const BASE_URL     = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL   ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY  ?? "";
const PASSWORD     = "CSL_2026";

// Read the signing secret directly from .env.local so it matches the dev server.
function readEnvLocal(): Record<string, string> {
  const file = path.resolve(".env.local");
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, "utf-8").replace(/^﻿/, "");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const LOCAL_ENV      = readEnvLocal();
const WEBHOOK_SECRET = LOCAL_ENV.STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET ?? "";

// ── Supabase helpers ───────────────────────────────────────────────────────────

function adminDb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

interface MemberRow {
  id: string;
  email: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  membership_tier: string | null;
  status: string | null;
}

async function getMember(email: string): Promise<MemberRow | null> {
  const { data } = await adminDb()
    .from("members")
    .select("id, email, user_id, first_name, last_name, membership_tier, status")
    .eq("email", email)
    .maybeSingle();
  return data ?? null;
}

async function getAuthUser(email: string): Promise<string | null> {
  const { data } = await adminDb().auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === email)?.id ?? null;
}

/** Poll Supabase until the members row appears (webhook processed) or timeout. */
async function waitForMember(email: string, ms = 15_000): Promise<MemberRow | null> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const m = await getMember(email);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

// ── Stripe webhook helper ──────────────────────────────────────────────────────

/**
 * Sign and POST a checkout.session.completed event to the local webhook endpoint.
 * The handler retrieves the full session from Stripe itself using partial.id,
 * so sending just the session ID in data.object is sufficient.
 */
async function fireCheckoutWebhook(sessionId: string): Promise<number> {
  const body = JSON.stringify({
    id: `evt_test_signup_${Date.now()}`,
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { id: sessionId } },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const hmac = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const res = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${hmac}`,
    },
    body,
  });
  console.log(`[webhook] ${sessionId} → ${res.status}`);
  return res.status;
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

/** Intercept Cloudflare Turnstile CDN and return a stub that auto-fires success. */
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
        if (opts && typeof opts.callback === "function") opts.callback("mock-token-playwright");
      }, 50);
      return "mock-widget-id";
    },
    remove: function() {},
    reset: function() {},
    execute: function() {},
    getResponse: function() { return "mock-token-playwright"; }
  };
  if (typeof window.onloadTurnstileCallback === "function") window.onloadTurnstileCallback();
})();`,
    });
  });
}

/**
 * Navigate to /membership, select a plan by its card index, fill the email,
 * wait for Turnstile mock to fire, and click "Proceed to Stripe".
 *
 * Plan card "Choose" button order (matches DOM):
 *   0 = Standard (£10/mo)
 *   1 = Accelerator (£25/mo)
 *   2 = Lifetime (£5,000)
 *   3 = Custom Monthly (needs #custom-monthly filled first)
 *   4 = Custom Annual  (needs #custom-annual filled first)
 */
async function startCheckout(
  page: Page,
  email: string,
  planIndex: number,
  opts: { customMonthly?: number; customAnnual?: number } = {}
): Promise<void> {
  await mockTurnstile(page);
  await page.goto("/membership");
  await page.waitForLoadState("networkidle", { timeout: 60_000 });

  // Fill custom amount inputs before clicking Choose (inputs must exist before click)
  if (opts.customMonthly !== undefined) {
    await page.fill("#custom-monthly", String(opts.customMonthly));
  }
  if (opts.customAnnual !== undefined) {
    await page.fill("#custom-annual", String(opts.customAnnual));
  }

  const chooseButtons = page.locator("button", { hasText: /^choose$/i });
  await chooseButtons.nth(planIndex).click();

  // Checkout panel revealed — fill email
  await page.waitForSelector("#checkout-email", { timeout: 10_000 });
  await page.fill("#checkout-email", email);

  // Turnstile mock fires in 50 ms; allow a full second before clicking Proceed
  await page.waitForTimeout(1200);

  await page.locator("button", { hasText: /proceed to stripe/i }).click();

  // Stripe hosted checkout — use domcontentloaded; Stripe's page takes too long to fire load.
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000, waitUntil: "domcontentloaded" });
}

/**
 * Fill Stripe's hosted checkout form with the test card and submit.
 * Waits for the post-payment redirect (anywhere — may be production URL).
 *
 * Stripe's hosted checkout shows a payment-method selector (Card / Klarna /
 * Revolut Pay). We click the Card radio to expand the card fields, which
 * Stripe renders inside iframes. We search every frame on the page for the
 * card number input rather than relying on a fixed iframe name/selector,
 * since Stripe's internal frame names vary by checkout configuration.
 */
async function completeStripePayment(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });

  // Stripe shows a payment-method accordion. Click "Pay with card" to expand card fields.
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  // Stripe's "Pay with card" accordion button is a full-page transparent overlay
  // (AccordionButton-expandedClickArea) that sits outside the viewport in Playwright.
  // A JS click dispatches the event directly without viewport checks.
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Pay with card"]') as HTMLButtonElement | null;
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (clicked) {
    // Wait for the card iframe to be injected after the accordion expands.
    await page.waitForTimeout(3_000);
  }

  // Stripe renders card fields inside iframes. Search every frame on the page
  // for one that contains a card number input.
  async function fillInFrame(): Promise<boolean> {
    const frames = page.frames();
    for (const frame of frames) {
      try {
        const cardInput = frame.getByLabel(/card number/i).first();
        if (await cardInput.isVisible({ timeout: 500 }).catch(() => false)) {
          await cardInput.fill("4242 4242 4242 4242");

          const expiry = frame.getByLabel(/expir|mm \/ yy/i).first();
          if (await expiry.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await expiry.fill("12 / 34");
          }

          const cvc = frame.getByLabel(/cvc|cvv|security code/i).first();
          if (await cvc.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await cvc.fill("123");
          }

          return true;
        }
      } catch {
        // frame may be cross-origin or detached — skip
      }
    }
    return false;
  }

  // Retry for up to 15 seconds while Stripe loads its iframe.
  const deadline = Date.now() + 15_000;
  let filled = false;
  while (Date.now() < deadline && !filled) {
    filled = await fillInFrame();
    if (!filled) await page.waitForTimeout(1_000);
  }

  if (!filled) {
    // Last-ditch: maybe card fields are directly on the page (no iframe).
    const directCard = page.getByLabel(/card number/i).first();
    if (await directCard.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await directCard.fill("4242 4242 4242 4242");
      await page.getByLabel(/expir|mm \/ yy/i).first().fill("12 / 34");
      await page.getByLabel(/cvc|cvv|security code/i).first().fill("123");
      filled = true;
    }
  }

  if (!filled) {
    throw new Error("Could not find Stripe card number field in any frame after 15s");
  }

  // Cardholder name (optional)
  const nameField = page.getByLabel(/name on card|cardholder|full name/i).first();
  if (await nameField.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await nameField.fill("Test Signup");
  }

  // Postal code (optional)
  const postalField = page.getByLabel(/postal code|zip|postcode/i).first();
  if (await postalField.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await postalField.fill("G1 1AA");
  }

  // Submit — use Stripe's stable data-testid rather than button text (varies by mode).
  await page.locator('[data-testid="hosted-payment-submit-button"]').click({ timeout: 30_000 });

  // Wait for redirect back to success page (possibly on a different host)
  await page.waitForURL(/membership\/success/, { timeout: 90_000 });
}

/**
 * After Stripe redirects to the success URL:
 *   1. Extracts session_id from wherever the browser landed.
 *   2. Fires checkout.session.completed to the local webhook endpoint.
 *   3. Polls Supabase for the resulting members row.
 *   4. Navigates back to the local success page so the rest of the test
 *      runs on the dev server, not on the production URL.
 */
async function handlePostPayment(page: Page, email: string): Promise<MemberRow> {
  const sessionId = new URL(page.url()).searchParams.get("session_id");
  expect(sessionId, "Stripe success URL must contain session_id").toBeTruthy();

  // Fire webhook to local dev server
  const status = await fireCheckoutWebhook(sessionId!);
  expect(status, "Webhook must return 200").toBe(200);

  // Poll for member row (webhook is async inside the handler)
  const member = await waitForMember(email, 15_000);
  expect(
    member,
    `members row for ${email} not found after webhook — check STRIPE_SECRET_KEY and Supabase keys`
  ).toBeTruthy();

  // Navigate to local success page regardless of where Stripe redirected
  if (!page.url().startsWith(BASE_URL)) {
    await page.goto(`${BASE_URL}/membership/success?session_id=${sessionId}`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  }

  return member!;
}

/**
 * Click "Set up your account" on the success page, fill the signup form,
 * and wait for the redirect to /member-portal.
 */
async function completeSignup(
  page: Page,
  firstName: string,
  lastName: string
): Promise<void> {
  await page.locator("a, button", { hasText: /set up your account/i }).click();
  await page.waitForURL(/\/signup/, { timeout: 10_000 });

  await page.waitForSelector("#signup-first-name", { timeout: 10_000 });
  await page.fill("#signup-first-name", firstName);
  await page.fill("#signup-last-name", lastName);
  await page.fill("#signup-password", PASSWORD);
  await page.fill("#signup-confirm", PASSWORD);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(/\/member-portal/, { timeout: 30_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Full sign-up flow", () => {

  // ── Test 1: Standard monthly (£10/mo) ───────────────────────────────────────

  test("monthly — Standard £10/month", async ({ page }) => {
    if (!SUPABASE_URL || !SERVICE_KEY) test.skip("Supabase env vars not set");
    if (!WEBHOOK_SECRET)               test.skip("STRIPE_WEBHOOK_SECRET not found in .env.local");

    const email = "gphinn+signup7@gmail.com";

    // 1. Navigate to /membership, choose Standard (index 0), proceed to Stripe
    await startCheckout(page, email, 0);

    // 2. Complete payment on Stripe's hosted checkout
    await completeStripePayment(page);

    // 3. Fire webhook, poll for member row, navigate back to local success page
    const member = await handlePostPayment(page, email);

    // Member row assertions
    expect(member.status).toBe("active");
    expect(member.membership_tier).toBe("monthly");

    // 4. Complete signup (/signup form)
    await completeSignup(page, "Test", "Monthly");

    // 5. Verify portal loaded — member is signed in
    await expect(page).toHaveURL(/\/member-portal/, { timeout: 10_000 });

    // 6. Supabase state after signup
    const updated = await getMember(email);
    expect(updated?.user_id, "user_id must be linked after signup").toBeTruthy();
    expect(updated?.first_name).toBe("Test");
    expect(updated?.last_name).toBe("Monthly");

    const authId = await getAuthUser(email);
    expect(authId, "auth.users record must exist").toBeTruthy();
    expect(updated?.user_id).toBe(authId);

    console.log(`✓ Monthly signup complete — user_id: ${updated?.user_id}`);
  });

  // ── Test 2: Custom Annual (£300/yr) ─────────────────────────────────────────

  test("annual — Custom Annual £300/year", async ({ page }) => {
    if (!SUPABASE_URL || !SERVICE_KEY) test.skip("Supabase env vars not set");
    if (!WEBHOOK_SECRET)               test.skip("STRIPE_WEBHOOK_SECRET not found in .env.local");

    const email = "gphinn+signup8@gmail.com";

    // Custom Annual = button index 4; pre-fill #custom-annual input
    await startCheckout(page, email, 4, { customAnnual: 300 });

    await completeStripePayment(page);

    const member = await handlePostPayment(page, email);

    expect(member.status).toBe("active");
    expect(member.membership_tier).toBe("annual");

    await completeSignup(page, "Test", "Annual");

    await expect(page).toHaveURL(/\/member-portal/, { timeout: 10_000 });

    const updated = await getMember(email);
    expect(updated?.user_id, "user_id must be linked after signup").toBeTruthy();
    expect(updated?.first_name).toBe("Test");
    expect(updated?.last_name).toBe("Annual");

    const authId = await getAuthUser(email);
    expect(authId, "auth.users record must exist").toBeTruthy();
    expect(updated?.user_id).toBe(authId);

    console.log(`✓ Annual signup complete — user_id: ${updated?.user_id}`);
  });

  // ── Test 3: Lifetime (£5,000 one-off) ───────────────────────────────────────

  test("lifetime — £5,000 one-off payment", async ({ page }) => {
    if (!SUPABASE_URL || !SERVICE_KEY) test.skip("Supabase env vars not set");
    if (!WEBHOOK_SECRET)               test.skip("STRIPE_WEBHOOK_SECRET not found in .env.local");

    const email = "gphinn+signup10@gmail.com";

    // Lifetime = button index 2
    await startCheckout(page, email, 2);

    await completeStripePayment(page);

    const member = await handlePostPayment(page, email);

    expect(member.status).toBe("active");
    expect(member.membership_tier).toBe("lifetime");

    await completeSignup(page, "Test", "Lifetime");

    await expect(page).toHaveURL(/\/member-portal/, { timeout: 10_000 });

    const updated = await getMember(email);
    expect(updated?.user_id, "user_id must be linked after signup").toBeTruthy();
    expect(updated?.first_name).toBe("Test");
    expect(updated?.last_name).toBe("Lifetime");

    const authId = await getAuthUser(email);
    expect(authId, "auth.users record must exist").toBeTruthy();
    expect(updated?.user_id).toBe(authId);

    console.log(`✓ Lifetime signup complete — user_id: ${updated?.user_id}`);
  });

});
