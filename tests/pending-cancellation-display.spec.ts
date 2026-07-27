/**
 * Pending-cancellation display — dashboard label and My Membership warning.
 *
 * Found live on staging (2026-07-27): the customer Billing Portal sets
 * cancel_at (a timestamp) on cancellation, not cancel_at_period_end (which
 * stays false) — but app/member-portal/page.tsx only ever read
 * cancel_at_period_end. Result: a member who had already cancelled still
 * saw "Renews {date}" on their dashboard, using their own cancellation date
 * as if it were a renewal date. The My Membership tab's amber warning had
 * the same blind spot.
 *
 * Both display spots now check a combined signal — cancel_at OR
 * cancel_at_period_end — since real evidence shows both fields are used in
 * this codebase: the customer Billing Portal sets cancel_at; our own
 * /api/subscription/* annual-switch flow sets cancel_at_period_end
 * directly. See .claude/NOTES.md "Cancellation handling" for the full
 * real-payload writeup.
 *
 * Uses real Stripe test-mode subscriptions (not Checkout) so the exact
 * field Stripe's Billing Portal sets is reproduced directly via the API,
 * rather than asserting against a synthetic payload shape.
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const GATE_EMAIL    = process.env.TEST_GATE_PENDING_CANCELLATION_EMAIL;
const GATE_PASSWORD = process.env.TEST_GATE_PENDING_CANCELLATION_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRODUCT_ID = process.env.STRIPE_PRODUCT_ID;

const canRun = Boolean(
  GATE_EMAIL && GATE_PASSWORD && SUPABASE_URL && SERVICE_ROLE_KEY && STRIPE_SECRET_KEY && STRIPE_PRODUCT_ID
);

function db() {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
}

function stripe() {
  return new Stripe(STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle", { timeout: 60_000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/auth/v1/token") && r.status() === 200,
      { timeout: 15_000 }
    ),
    page.click('button[type="submit"]'),
  ]);
}

// Creates a real, chargeable Stripe subscription (not via Checkout) so the
// portal's stripe_subscription_id lookup resolves to a genuine object.
async function createRealSubscription(): Promise<{ customerId: string; subscriptionId: string }> {
  const s = stripe();
  const customer = await s.customers.create({ email: `${Date.now()}-pending-cancel@celticsupporters.net` });

  // Stripe's built-in test PaymentMethod token — raw card-number creation is
  // blocked server-side by default (PCI restriction), this is the sanctioned
  // way to attach a working test card without going through Elements/Checkout.
  const pm = await s.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await s.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });

  const price = await s.prices.create({
    currency: "gbp",
    unit_amount: 1000,
    recurring: { interval: "month" },
    product: STRIPE_PRODUCT_ID!,
  });

  const sub = await s.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
  });

  return { customerId: customer.id, subscriptionId: sub.id };
}

async function linkMemberToSubscription(customerId: string, subscriptionId: string) {
  const { error } = await db()
    .from("members")
    .update({ stripe_customer_id: customerId, stripe_subscription_id: subscriptionId, status: "active" })
    .eq("email", GATE_EMAIL!);
  if (error) throw new Error(`Failed to link ${GATE_EMAIL} to ${subscriptionId}: ${error.message}`);
}

test.describe("Pending-cancellation display", () => {
  test.skip(!canRun, "TEST_GATE_PENDING_CANCELLATION_EMAIL / SUPABASE_SERVICE_ROLE_KEY / STRIPE_SECRET_KEY / STRIPE_PRODUCT_ID not set");

  test.afterEach(async () => {
    await db().from("members").update({ status: "active" }).eq("email", GATE_EMAIL!);
  });

  test("cancel_at set (Billing Portal path): dashboard shows 'Cancels', not 'Renews'; My Membership shows warning with Reverse cancellation link", async ({ page }) => {
    const { customerId, subscriptionId } = await createRealSubscription();
    const cancelAtUnix = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days out
    await stripe().subscriptions.update(subscriptionId, { cancel_at: cancelAtUnix });
    await linkMemberToSubscription(customerId, subscriptionId);

    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });

    await expect(page.locator("text=/^Cancels /")).toBeVisible();
    await expect(page.locator("text=/^Renews /")).toHaveCount(0);

    await page.evaluate(() => { window.location.href = "/member-portal?tab=membership"; });
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    await expect(page.locator("text=Your subscription will cancel on")).toBeVisible();
    await expect(page.locator("button", { hasText: "Reverse cancellation" })).toBeVisible();

    await stripe().subscriptions.cancel(subscriptionId).catch(() => {});
    console.log("PASS: cancel_at signal correctly shows 'Cancels' label and reversal link");
  });

  test("cancel_at_period_end=true only (internal annual-switch path): same display, same link", async ({ page }) => {
    const { customerId, subscriptionId } = await createRealSubscription();
    await stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    await linkMemberToSubscription(customerId, subscriptionId);

    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });

    await expect(page.locator("text=/^Cancels /")).toBeVisible();
    await expect(page.locator("text=/^Renews /")).toHaveCount(0);

    await page.evaluate(() => { window.location.href = "/member-portal?tab=membership"; });
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    await expect(page.locator("text=Your subscription will cancel on")).toBeVisible();
    await expect(page.locator("button", { hasText: "Reverse cancellation" })).toBeVisible();

    await stripe().subscriptions.cancel(subscriptionId).catch(() => {});
    console.log("PASS: cancel_at_period_end-only signal also caught by the combined check");
  });

  test("neither flag set: dashboard shows 'Renews', no cancellation warning (regression)", async ({ page }) => {
    const { customerId, subscriptionId } = await createRealSubscription();
    await linkMemberToSubscription(customerId, subscriptionId);

    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });

    await expect(page.locator("text=/^Renews /")).toBeVisible();
    await expect(page.locator("text=/^Cancels /")).toHaveCount(0);

    await page.evaluate(() => { window.location.href = "/member-portal?tab=membership"; });
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    await expect(page.locator("text=Your subscription will cancel on")).toHaveCount(0);

    await stripe().subscriptions.cancel(subscriptionId).catch(() => {});
    console.log("PASS: active subscription with no pending cancellation shows the original 'Renews' label");
  });
});
