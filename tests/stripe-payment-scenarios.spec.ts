/**
 * Stripe payment decline, 3DS, and subscription-failure scenarios.
 *
 * Architecture:
 *   - Decline tests (sections 1–2): direct Stripe API calls, no browser.
 *     The SDK is used with test PaymentMethod tokens (pm_card_*) to confirm
 *     that Stripe declines them with the expected error codes, and that no
 *     member row is created in Supabase.
 *   - invoice.payment_failed DB assertion (section 3): inserts a real member
 *     row with a synthetic stripe_customer_id, fires a signed webhook, and
 *     asserts the handler sets status = 'payment_failed'.
 *   - 3DS browser tests (section 4): Playwright drives Stripe's hosted
 *     checkout with 3DS test cards, interacts with the challenge dialog, and
 *     verifies the resulting Supabase state.
 *
 * PaymentMethod tokens (Stripe built-in test objects):
 *   pm_card_visa_chargeDeclined                   — generic decline
 *   pm_card_visa_chargeDeclinedInsufficientFunds  — insufficient funds
 *   pm_card_chargeDeclinedExpiredCard             — expired card
 *   pm_card_chargeDeclinedIncorrectCvc            — incorrect CVC
 *   pm_card_chargeCustomerFail                    — attaches OK, charge fails
 *   (3DS) 4000000000003220                        — 3DS2 required, succeeds
 *   (3DS) 4000008400001629                        — 3DS required, declined after auth
 *
 * PREREQUISITES:
 *   STRIPE_SECRET_KEY (sk_test_*) — in .env.local
 *   STRIPE_PRODUCT_ID             — in .env.local
 *   STRIPE_WEBHOOK_SECRET         — in .env.local
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — in .env.test.local
 */

import { test, expect, type Page } from "@playwright/test";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// ── Config ─────────────────────────────────────────────────────────────────────

const BASE_URL     = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

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

const LOCAL_ENV  = readEnvLocal();
const STRIPE_KEY = LOCAL_ENV.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY ?? "";
const PRODUCT_ID = LOCAL_ENV.STRIPE_PRODUCT_ID ?? process.env.STRIPE_PRODUCT_ID ?? "";

// Webhook secret selection:
//   Local dev server (localhost): inherits the Stripe CLI forwarding secret that
//   Playwright loads from .env.test.local into process.env. Use process.env first.
//   External/staging target: the Vercel deployment uses the Stripe Dashboard signing
//   secret stored in .env.local. Read it directly with readEnvLocal().
const isExternalTarget = BASE_URL && !BASE_URL.startsWith("http://localhost");
const WEBHOOK_SECRET = isExternalTarget
  ? (LOCAL_ENV.STRIPE_WEBHOOK_SECRET  ?? process.env.STRIPE_WEBHOOK_SECRET ?? "")
  : (process.env.STRIPE_WEBHOOK_SECRET ?? LOCAL_ENV.STRIPE_WEBHOOK_SECRET  ?? "");

// ── Stripe client ──────────────────────────────────────────────────────────────

function getStripeClient(): Stripe {
  return new Stripe(STRIPE_KEY, { apiVersion: "2026-05-27.dahlia" as Parameters<typeof Stripe>[1]["apiVersion"] });
}

// ── Supabase admin helpers ─────────────────────────────────────────────────────

function adminDb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

interface MemberRow {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  status: string | null;
  payment_failed_at: string | null;
}

async function getMemberByEmail(email: string): Promise<MemberRow | null> {
  const { data } = await adminDb()
    .from("members")
    .select("id, email, stripe_customer_id, status, payment_failed_at")
    .eq("email", email)
    .maybeSingle();
  return data ?? null;
}

async function getMemberByCustomerId(customerId: string): Promise<MemberRow | null> {
  const { data } = await adminDb()
    .from("members")
    .select("id, email, stripe_customer_id, status, payment_failed_at")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data ?? null;
}

/** Insert a minimal test member row and return its id. */
async function insertTestMember(email: string, stripeCustomerId: string): Promise<string> {
  const { data, error } = await adminDb()
    .from("members")
    .insert({
      email,
      stripe_customer_id: stripeCustomerId,
      status: "active",
      membership_tier: "monthly",
      plan_name: "Monthly 10",
      amount_pence: 1000,
    })
    .select("id")
    .single();
  if (error) throw new Error(`insertTestMember failed: ${error.message}`);
  return data.id;
}

async function deleteTestMember(id: string): Promise<void> {
  await adminDb().from("members").delete().eq("id", id);
}

/** Poll Supabase until the member row's status matches or timeout. */
async function waitForStatus(
  customerId: string,
  status: string,
  ms = 8_000
): Promise<MemberRow | null> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const m = await getMemberByCustomerId(customerId);
    if (m?.status === status) return m;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

// ── Webhook signing ────────────────────────────────────────────────────────────

function signWebhook(payload: object, secret: string): { body: string; sig: string } {
  const body = JSON.stringify(payload);
  const ts   = Math.floor(Date.now() / 1000);
  const hmac = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return { body, sig: `t=${ts},v1=${hmac}` };
}

function invoicePaymentFailedPayload(customerId: string, attemptCount = 1) {
  return {
    id:       `evt_test_pf_${Date.now()}`,
    object:   "event",
    type:     "invoice.payment_failed",
    livemode: false,
    data: {
      object: {
        id:            `in_test_${Date.now()}`,
        object:        "invoice",
        customer:      customerId,
        amount_due:    1000,
        currency:      "gbp",
        status:        "open",
        attempt_count: attemptCount,
      },
    },
  };
}

// ── Turnstile mock ─────────────────────────────────────────────────────────────

async function mockTurnstile(page: Page): Promise<void> {
  await page.route("**/challenges.cloudflare.com/turnstile/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `(function(){window.turnstile={render:function(c,o){setTimeout(function(){if(o&&typeof o.callback==='function')o.callback('mock-token-playwright');},50);return 'w';},remove:function(){},reset:function(){},execute:function(){},getResponse:function(){return 'mock-token-playwright';}};if(typeof window.onloadTurnstileCallback==='function')window.onloadTurnstileCallback();})();`,
    });
  });
}

// ── Serial mode + global timeout ───────────────────────────────────────────────

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

// ==============================================================================
// 1. DECLINE SCENARIOS — Stripe API direct
//    Each test confirms that a specific test PaymentMethod token is declined
//    with the expected Stripe error code, proving these cards cannot be used
//    to complete a payment (and therefore cannot trigger checkout.session.completed).
// ==============================================================================

test.describe("Decline scenarios — Stripe API", () => {

  test.beforeEach(({}, info) => {
    if (!STRIPE_KEY.startsWith("sk_test_")) {
      info.skip(true, "STRIPE_SECRET_KEY must be a test key (sk_test_*)");
    }
  });

  /**
   * Attempt to create and immediately confirm a PaymentIntent with the given
   * PaymentMethod token. Returns the StripeError on decline, or null if the
   * payment unexpectedly succeeded (which would be a test failure).
   */
  async function attemptPayment(pmToken: string): Promise<Stripe.StripeError | null> {
    const stripe = getStripeClient();
    try {
      await stripe.paymentIntents.create({
        amount: 1000,
        currency: "gbp",
        payment_method: pmToken,
        confirm: true,
        return_url: "https://example.com",
      });
      return null; // Unexpected success
    } catch (err) {
      return err as Stripe.StripeError;
    }
  }

  test("pm_card_visa_chargeDeclined — generic decline (card_declined / generic_decline)", async () => {
    const err = await attemptPayment("pm_card_visa_chargeDeclined");
    expect(err, "Payment must be declined").not.toBeNull();
    expect(err?.code).toBe("card_declined");
    expect(err?.decline_code).toBe("generic_decline");
    console.log(`  ✓ generic decline: code=${err?.code}, decline_code=${err?.decline_code}`);
  });

  test("pm_card_visa_chargeDeclinedInsufficientFunds — insufficient funds", async () => {
    const err = await attemptPayment("pm_card_visa_chargeDeclinedInsufficientFunds");
    expect(err, "Payment must be declined").not.toBeNull();
    expect(err?.code).toBe("card_declined");
    expect(err?.decline_code).toBe("insufficient_funds");
    console.log(`  ✓ insufficient funds: code=${err?.code}, decline_code=${err?.decline_code}`);
  });

  test("pm_card_chargeDeclinedExpiredCard — expired card", async () => {
    const err = await attemptPayment("pm_card_chargeDeclinedExpiredCard");
    expect(err, "Payment must be declined").not.toBeNull();
    expect(err?.code).toBe("expired_card");
    console.log(`  ✓ expired card: code=${err?.code}`);
  });

  test("pm_card_chargeDeclinedIncorrectCvc — incorrect CVC", async () => {
    const err = await attemptPayment("pm_card_chargeDeclinedIncorrectCvc");
    expect(err, "Payment must be declined").not.toBeNull();
    expect(err?.code).toBe("incorrect_cvc");
    console.log(`  ✓ incorrect CVC: code=${err?.code}`);
  });

});

// ==============================================================================
// 2. pm_card_chargeCustomerFail — subscription renewal failure mirror
//    This token attaches to a customer successfully (unlike raw declined cards)
//    but the charge fails when a payment is attempted — exactly like a card that
//    passes initial tokenisation but fails on the subscription renewal attempt.
// ==============================================================================

test.describe("pm_card_chargeCustomerFail — attaches OK, charge fails", () => {

  test.beforeEach(({}, info) => {
    if (!STRIPE_KEY.startsWith("sk_test_")) {
      info.skip(true, "STRIPE_SECRET_KEY must be a test key (sk_test_*)");
    }
    if (!SUPABASE_URL || !SERVICE_KEY) {
      info.skip(true, "Supabase env vars not set");
    }
  });

  test("PM attaches to customer without error; charge attempt fails with card_declined", async () => {
    const stripe   = getStripeClient();
    const email    = `test.charge.fail.${Date.now()}@example.com`;

    // Create a throw-away Stripe test customer.
    const customer = await stripe.customers.create({
      email,
      description: "Playwright test — chargeCustomerFail (auto-cleanup)",
    });

    try {
      // Step 1: attach pm_card_chargeCustomerFail — must succeed.
      // Note: Stripe assigns a real pm_* ID on attachment; the fixture token is
      // only used during the attach call and is not preserved as the returned id.
      const pm = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", {
        customer: customer.id,
      });
      expect(pm.customer).toBe(customer.id);
      expect(pm.id, "Attach must return a valid PM id").toMatch(/^pm_/);
      console.log(`  ✓ PM ${pm.id} attached to ${customer.id} without error`);

      // Step 2: confirm a PaymentIntent off-session (mirrors subscription renewal) — must fail.
      // off_session: true tells Stripe to attempt the charge without interactive SCA,
      // exactly as it would when retrying a subscription invoice automatically.
      let chargeError: Stripe.StripeError | null = null;
      try {
        await stripe.paymentIntents.create({
          amount:         1000,
          currency:       "gbp",
          customer:       customer.id,
          payment_method: pm.id,
          off_session:    true,
          confirm:        true,
        });
      } catch (err) {
        chargeError = err as Stripe.StripeError;
      }

      expect(chargeError, "Charge must fail even though PM attached successfully").not.toBeNull();
      expect(chargeError?.code).toBe("card_declined");
      console.log(`  ✓ Charge failed: code=${chargeError?.code}, decline_code=${chargeError?.decline_code}`);

      // Step 3: no checkout.session.completed was fired, so our webhook handler
      // was never invoked and no member row should exist for this customer.
      const member = await getMemberByCustomerId(customer.id);
      expect(member, "No member row should exist — checkout never completed").toBeNull();
      console.log("  ✓ No member row in Supabase for this customer");

    } finally {
      await stripe.customers.del(customer.id).catch(() => {});
    }
  });

});

// ==============================================================================
// 3. invoice.payment_failed — DB state assertion
//    Inserts a real member row with a synthetic stripe_customer_id, fires a
//    correctly signed invoice.payment_failed webhook, and asserts the handler
//    sets status = 'payment_failed' and payment_failed_at on that row.
// ==============================================================================

test.describe("invoice.payment_failed — DB state update", () => {

  test.beforeEach(({}, info) => {
    if (!WEBHOOK_SECRET)              info.skip(true, "STRIPE_WEBHOOK_SECRET not set");
    if (!SUPABASE_URL || !SERVICE_KEY) info.skip(true, "Supabase env vars not set");
  });

  test("webhook sets status=payment_failed and payment_failed_at on the matched member row", async ({ request }) => {
    const fakeCustomerId = `cus_test_pf_${Date.now()}`;
    const email          = `test.pf.db.${Date.now()}@example.com`;

    // Insert a test member in 'active' state.
    const memberId = await insertTestMember(email, fakeCustomerId);

    try {
      // Fire the signed webhook.
      const payload       = invoicePaymentFailedPayload(fakeCustomerId, 1);
      const { body, sig } = signWebhook(payload, WEBHOOK_SECRET);
      const res           = await request.post("/api/webhooks/stripe", {
        data:    body,
        headers: { "content-type": "application/json", "stripe-signature": sig },
      });
      expect(res.status(), "Webhook must return 200").toBe(200);

      // Poll for the status update (DB write is async inside the handler).
      const updated = await waitForStatus(fakeCustomerId, "payment_failed");

      expect(updated?.status,           "status must be payment_failed").toBe("payment_failed");
      expect(updated?.payment_failed_at,"payment_failed_at must be set").not.toBeNull();
      console.log(`  ✓ status=payment_failed, payment_failed_at=${updated?.payment_failed_at}`);

    } finally {
      await deleteTestMember(memberId);
    }
  });

  test("second invoice.payment_failed (attempt_count=2) also returns 200 and updates row", async ({ request }) => {
    const fakeCustomerId = `cus_test_pf2_${Date.now()}`;
    const email          = `test.pf.db2.${Date.now()}@example.com`;
    const memberId       = await insertTestMember(email, fakeCustomerId);

    try {
      const { body, sig } = signWebhook(
        invoicePaymentFailedPayload(fakeCustomerId, 2),
        WEBHOOK_SECRET
      );
      const res = await request.post("/api/webhooks/stripe", {
        data:    body,
        headers: { "content-type": "application/json", "stripe-signature": sig },
      });
      expect(res.status()).toBe(200);

      const updated = await waitForStatus(fakeCustomerId, "payment_failed");
      expect(updated?.status).toBe("payment_failed");
      console.log("  ✓ attempt_count=2: returns 200, status=payment_failed");
    } finally {
      await deleteTestMember(memberId);
    }
  });

});

// ==============================================================================
// 4. 3DS / SCA SCENARIOS — browser-based
//    Playwright drives Stripe's hosted checkout with 3DS test cards.
//    Stripe renders a simulated 3DS challenge dialog directly on the checkout
//    page; we click "Complete authentication" and assert the outcome.
// ==============================================================================

test.describe("3DS / SCA scenarios", () => {

  test.beforeEach(({}, info) => {
    if (!STRIPE_KEY.startsWith("sk_test_")) info.skip(true, "Must use Stripe test key");
    if (!SUPABASE_URL || !SERVICE_KEY)      info.skip(true, "Supabase env vars not set");
    if (!WEBHOOK_SECRET)                    info.skip(true, "STRIPE_WEBHOOK_SECRET not set");
  });

  /** Navigate to /membership, choose Standard, fill email, proceed to Stripe checkout. */
  async function goToStripeCheckout(page: Page, email: string): Promise<void> {
    await mockTurnstile(page);
    await page.goto("/membership");
    await page.waitForLoadState("networkidle", { timeout: 60_000 });

    await page.locator("button", { hasText: /^choose$/i }).first().click();
    await page.waitForSelector("#checkout-email", { timeout: 10_000 });
    await page.fill("#checkout-email", email);
    await page.waitForTimeout(1200); // Turnstile mock fires
    await page.locator("button", { hasText: /proceed to stripe/i }).click();
    await page.waitForURL(/checkout\.stripe\.com/, {
      timeout:    30_000,
      waitUntil: "domcontentloaded",
    });
  }

  /**
   * Fill Stripe's hosted card fields with the given card number, expiry, and CVC.
   * Stripe renders card inputs inside iframes; we search every frame on the page.
   */
  async function fillStripeCard(page: Page, cardNumber: string): Promise<void> {
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
    await page.waitForLoadState("networkidle",      { timeout: 30_000 }).catch(() => {});

    // Expand the "Pay with card" accordion (off-viewport overlay — JS click required).
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Pay with card"]') as HTMLButtonElement | null;
      if (btn) btn.click();
    });
    await page.waitForTimeout(3_000);

    async function fillInFrame(): Promise<boolean> {
      for (const frame of page.frames()) {
        try {
          const cardInput = frame.getByLabel(/card number/i).first();
          if (await cardInput.isVisible({ timeout: 500 }).catch(() => false)) {
            await cardInput.fill(cardNumber);
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
        } catch { /* cross-origin or detached frame — skip */ }
      }
      return false;
    }

    const deadline = Date.now() + 15_000;
    let filled     = false;
    while (Date.now() < deadline && !filled) {
      filled = await fillInFrame();
      if (!filled) await page.waitForTimeout(1_000);
    }
    if (!filled) throw new Error("Could not locate Stripe card number field in any frame after 15s");

    // Optional fields that may appear on the Stripe checkout page.
    const nameField = page.getByLabel(/name on card|cardholder|full name/i).first();
    if (await nameField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nameField.fill("Test 3DS");
    }
    const postalField = page.getByLabel(/postal code|zip|postcode/i).first();
    if (await postalField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await postalField.fill("G1 1AA");
    }
  }

  /**
   * Find and click Stripe's 3DS challenge button ("COMPLETE" or "FAIL").
   *
   * Strategy: locate the frame (or the main page) that contains a "FAIL"
   * button — this button is unique to Stripe's 3DS test dialog and cannot
   * appear on the main checkout page. Once the frame is identified, click
   * the target button (COMPLETE or FAIL) within that specific context.
   *
   * Why not search by "3D Secure" text: the heading may span multiple DOM
   * text nodes, making `locator("text=...")` unreliable. The "FAIL" button
   * is a simpler, unique anchor.
   */
  async function click3DSButton(page: Page, label: RegExp): Promise<void> {
    const deadline = Date.now() + 45_000;

    while (Date.now() < deadline) {
      for (const frame of page.frames()) {
        const frameUrl = frame.url();
        try {
          const btn = frame.getByRole("button", { name: label });
          const visible = await btn.isVisible({ timeout: 400 }).catch(() => false);
          if (!visible) continue;

          console.log(`  [3DS] clicking ${label} in: ${frameUrl.substring(0, 80)}`);

          // Give the cross-origin iframe's click handlers time to attach before clicking.
          await page.waitForTimeout(1_500);
          await btn.click({ force: true, timeout: 5_000 });

          // Verify the dialog closed — if the frame is still attached and the button
          // is still visible after 4 seconds, the click was a no-op; retry.
          await page.waitForTimeout(4_000);
          const stillVisible = await btn.isVisible({ timeout: 500 }).catch(() => false);
          if (!stillVisible) {
            console.log(`  [3DS] dialog closed — click accepted`);
            return;
          }
          console.log(`  [3DS] dialog still open after click — retrying`);
        } catch { /* cross-origin or detached frame — skip */ }
      }
      await page.waitForTimeout(1_000);
    }
    throw new Error(`3DS dialog button matching ${label} unresponsive after 45s`);
  }

  /** Sign and POST checkout.session.completed to the local/staging webhook endpoint. */
  async function fireCheckoutWebhook(sessionId: string): Promise<number> {
    const body = JSON.stringify({
      id:       `evt_test_3ds_${Date.now()}`,
      object:   "event",
      type:     "checkout.session.completed",
      livemode: false,
      data:     { object: { id: sessionId } },
    });
    const ts   = Math.floor(Date.now() / 1000);
    const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${body}`).digest("hex");
    const res  = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": `t=${ts},v1=${hmac}` },
      body,
    });
    return res.status;
  }

  // ── 3DS2 required, authentication succeeds → member created ─────────────────

  test("3DS2 required — auth succeeds, checkout.session.completed fires, member row created", async ({ page }) => {
    const email = `test.3ds.ok.${Date.now()}@example.com`;

    await goToStripeCheckout(page, email);
    await fillStripeCard(page, "4000000000003220");

    await page.locator('[data-testid="hosted-payment-submit-button"]').click({ timeout: 30_000 });

    // Stripe shows the 3DS challenge dialog — click "Complete authentication".
    await click3DSButton(page, /^complete$/i);

    // After successful 3DS, Stripe redirects to the success URL.
    await page.waitForURL(/membership\/success/, { timeout: 90_000, waitUntil: "domcontentloaded" });

    const sessionId = new URL(page.url()).searchParams.get("session_id");
    expect(sessionId, "session_id must be present in success URL").toBeTruthy();

    // Fire the webhook so the handler creates the member row.
    const webhookStatus = await fireCheckoutWebhook(sessionId!);
    expect(webhookStatus, "Webhook must return 200").toBe(200);
    console.log(`  [webhook] ${sessionId} → ${webhookStatus}`);

    // Poll Supabase for the member row.
    const db       = adminDb();
    const deadline = Date.now() + 15_000;
    let member: { status: string; membership_tier: string } | null = null;
    while (Date.now() < deadline) {
      const { data } = await db
        .from("members")
        .select("status, membership_tier")
        .eq("email", email)
        .maybeSingle();
      if (data) { member = data; break; }
      await new Promise((r) => setTimeout(r, 1_500));
    }

    expect(member, "Member row must exist after 3DS success + webhook").not.toBeNull();
    expect(member?.status).toBe("active");
    expect(member?.membership_tier).toBe("monthly");
    console.log(`  ✓ 3DS success: status=${member?.status}, tier=${member?.membership_tier}`);

    // Clean up — remove the member row so the email can be reused.
    await db.from("members").delete().eq("email", email);
  });

  // ── 3DS required, charge declined after auth → no member created ─────────────

  test("3DS required, charge declined after auth — no success redirect, no member row", async ({ page }) => {
    const email = `test.3ds.declined.${Date.now()}@example.com`;

    await goToStripeCheckout(page, email);
    await fillStripeCard(page, "4000008400001629");

    await page.locator('[data-testid="hosted-payment-submit-button"]').click({ timeout: 30_000 });

    // 3DS challenge appears — complete authentication.
    // Card 4000008400001629 succeeds the auth step but the charge is then declined.
    await click3DSButton(page, /^complete$/i);

    // Wait a few seconds; Stripe should NOT redirect to the success URL.
    await page.waitForTimeout(5_000);

    const currentUrl = page.url();
    expect(
      currentUrl.includes("membership/success"),
      `Should not reach success page — got: ${currentUrl}`
    ).toBe(false);

    // No member row should exist for this email.
    const member = await getMemberByEmail(email);
    expect(member, "No member row should be created after a declined 3DS charge").toBeNull();
    console.log("  ✓ 3DS declined: no success redirect, no member row in Supabase");
  });

});
