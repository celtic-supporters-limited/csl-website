/**
 * /membership/success routing branch — returning vs new member.
 *
 * Found while manually validating rejoin on staging: the success page
 * always linked to /signup, which asked a returning member to set a new
 * password as if they were brand new. Fixed to branch on whether an
 * auth.users account already exists (detected via members.user_id, which
 * survives cancellation and is never touched by the checkout webhook's
 * upsert — see the comment in app/membership/success/page.tsx for why
 * that's race-free against the webhook for the current checkout).
 *
 * /membership-ended deliberately keeps the session alive so a member
 * clicking "Rejoin CSL" returns from Stripe still signed in — that makes
 * the "auth record + live session" branch the PRIMARY rejoin path, not an
 * edge case, and it's tested as such here alongside the signed-out path.
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const GATE_EMAIL    = process.env.TEST_GATE_REJOIN_ROUTING_EMAIL;
const GATE_PASSWORD = process.env.TEST_GATE_REJOIN_ROUTING_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const canRun = Boolean(GATE_EMAIL && GATE_PASSWORD && SUPABASE_URL && SERVICE_ROLE_KEY && STRIPE_SECRET_KEY);

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

// A fresh, unfinished Checkout Session with customer_email set is enough —
// the success page only needs session.customer_details.email, which Stripe
// populates from customer_email at creation, before the session completes.
async function createSessionForEmail(email: string): Promise<string> {
  const productId = process.env.STRIPE_PRODUCT_ID!;
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "gbp",
        unit_amount: 1000,
        recurring: { interval: "month" },
        product: productId,
      },
    }],
    customer_email: email,
    success_url: "https://example.com/success",
    cancel_url: "https://example.com/cancel",
  });
  return session.id;
}

test.describe("Checkout success routing — returning member", () => {
  test.skip(!canRun, "TEST_GATE_REJOIN_ROUTING_EMAIL / SUPABASE_SERVICE_ROLE_KEY / STRIPE_SECRET_KEY not set");

  test.beforeAll(async () => {
    // Confirm the seeded account actually has an auth.users link — the
    // whole branch depends on members.user_id being set.
    const db = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
    const { data } = await db.from("members").select("user_id").eq("email", GATE_EMAIL!).maybeSingle();
    test.skip(!data?.user_id, `${GATE_EMAIL} has no linked user_id — reseed via scripts/seed-test-gate-user.mjs`);
  });

  test("returning member with a live session lands on /member-portal with a welcome-back banner", async ({ page }) => {
    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });

    const sessionId = await createSessionForEmail(GATE_EMAIL!);
    await page.goto(`/membership/success?session_id=${sessionId}`);

    await page.waitForURL("**/member-portal**welcome_back=true**", { timeout: 15_000 }).catch(async () => {
      // URL glob with query params is finicky across Playwright versions — fall back to a direct check.
      await expect(page).toHaveURL(/member-portal\?welcome_back=true/);
    });
    await expect(page.locator("text=Welcome back! Your CSL membership has been reactivated.")).toBeVisible();
    console.log("PASS: live-session rejoin lands on /member-portal with welcome-back banner, no signup form");
  });

  test("returning member with no session lands on /login with a welcome-back notice", async ({ browser }) => {
    // Fresh, cookie-less context — simulates a member who signed out before
    // Stripe redirected them back (e.g. cleared cookies, different device).
    const context = await browser.newContext();
    const page = await context.newPage();

    const sessionId = await createSessionForEmail(GATE_EMAIL!);
    await page.goto(`/membership/success?session_id=${sessionId}`);

    await expect(page).toHaveURL(/login\?notice=welcome-back/);
    await expect(page.locator("text=Welcome back!")).toBeVisible();
    await expect(page.locator("text=Your existing password still works")).toBeVisible();
    await expect(page.locator("button", { hasText: "Forgot your password?" })).toBeVisible();
    console.log("PASS: signed-out rejoin lands on /login with welcome-back notice and visible forgot-password link");

    await context.close();
  });

  test("brand-new member (no members row at all) still sees the original set-up-account flow", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const brandNewEmail = `csl-test-brand-new-${Date.now()}@celticsupporters.net`;
    const sessionId = await createSessionForEmail(brandNewEmail);
    await page.goto(`/membership/success?session_id=${sessionId}`);

    // No redirect — stays on the success page with the original signup link.
    await expect(page).toHaveURL(/membership\/success/);
    await expect(page.locator("a", { hasText: "Set up your account" })).toBeVisible();
    console.log("PASS: brand-new member (no members row, no user_id) unaffected by the returning-member branch");

    await context.close();
  });
});
