/**
 * Checkout rejoin logic — app/api/checkout/route.ts duplicate-member guard.
 *
 * Covers the revenue-path fix found while manually validating cancellation
 * handling on staging (2026-07-27, gphinn+signup4@gmail.com): the guard
 * blocked ANY existing members row regardless of status, making self-service
 * rejoin impossible — directly contradicting the requirement that a
 * cancelled member should be able to reactivate. See .claude/NOTES.md
 * "Cancellation handling" for the full write-up.
 *
 * Fix covered here:
 *   - active member is blocked, with copy that tells them to sign in (not
 *     "use a different email", which would invite a duplicate record)
 *   - payment_failed member is blocked, with copy that tells them to sign
 *     in and update their card, not "use a different email"
 *   - cancelled member is let through, AND their existing Stripe customer
 *     is reused (via `customer` on the Checkout Session) rather than
 *     letting Stripe mint a second customer — verified by retrieving the
 *     created session directly from the Stripe API and checking `.customer`
 *   - cancelled member with no stored stripe_customer_id (legacy row) falls
 *     back to customer_email cleanly, still succeeds
 *
 * Uses a real (test-mode) Stripe customer, created once and reused across
 * runs, and direct Supabase seeding for the members row — this is the
 * revenue path, so verification goes through the real Stripe API rather
 * than asserting the app's own claims about what it sent.
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRODUCT_ID = process.env.STRIPE_PRODUCT_ID;

const canRun = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && STRIPE_SECRET_KEY && STRIPE_PRODUCT_ID);

function db() {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
}

function stripe() {
  return new Stripe(STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });
}

const ACTIVE_EMAIL = "csl-test-rejoin-active@celticsupporters.net";
const FAILED_EMAIL = "csl-test-rejoin-failed@celticsupporters.net";
const CANCELLED_EMAIL = "csl-test-rejoin-cancelled@celticsupporters.net";
const CANCELLED_LEGACY_EMAIL = "csl-test-rejoin-cancelled-legacy@celticsupporters.net";

async function seedMember(email: string, status: string, stripeCustomerId: string | null) {
  const { error } = await db().from("members").upsert(
    {
      email,
      status,
      stripe_customer_id: stripeCustomerId,
      membership_tier: "monthly",
      plan_name: "Monthly 10",
      is_admin: false,
      is_lifetime: false,
    },
    { onConflict: "email" }
  );
  if (error) throw new Error(`Failed to seed ${email}: ${error.message}`);
}

async function checkoutRequest(request: import("@playwright/test").APIRequestContext, email: string) {
  return request.post("/api/checkout", {
    data: {
      plan: "standard",
      email,
      turnstileToken: "mock-token-playwright",
      website: "", // honeypot, must be empty
    },
    headers: { "Content-Type": "application/json" },
  });
}

test.describe("Checkout rejoin — duplicate member guard", () => {
  test.skip(!canRun, "SUPABASE_SERVICE_ROLE_KEY / STRIPE_SECRET_KEY / STRIPE_PRODUCT_ID not set");

  let realCustomerId: string;

  test.beforeAll(async () => {
    // One real Stripe test-mode customer, reused across the "cancelled with
    // existing customer" test — this is what proves reuse, not a fabricated ID.
    const customer = await stripe().customers.create({ email: CANCELLED_EMAIL });
    realCustomerId = customer.id;

    await seedMember(ACTIVE_EMAIL, "active", null);
    await seedMember(FAILED_EMAIL, "payment_failed", null);
    await seedMember(CANCELLED_EMAIL, "cancelled", realCustomerId);
    await seedMember(CANCELLED_LEGACY_EMAIL, "cancelled", null);
  });

  test.afterAll(async () => {
    // Best-effort cleanup — don't fail the suite if Stripe/Supabase cleanup fails.
    try { await stripe().customers.del(realCustomerId); } catch { /* ignore */ }
    try {
      await db().from("members").delete().in("email", [
        ACTIVE_EMAIL, FAILED_EMAIL, CANCELLED_EMAIL, CANCELLED_LEGACY_EMAIL,
      ]);
    } catch { /* ignore */ }
  });

  test("active member is blocked with sign-in guidance, not 'use a different email'", async ({ request }) => {
    const res = await checkoutRequest(request, ACTIVE_EMAIL);
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("You already have an active membership. Please sign in.");
    expect(body.error).not.toContain("different email");
    console.log("PASS: active member blocked with correct copy");
  });

  test("payment_failed member is blocked with card-update guidance, not 'use a different email'", async ({ request }) => {
    const res = await checkoutRequest(request, FAILED_EMAIL);
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("There's a problem with your payment method. Please sign in to update your card.");
    expect(body.error).not.toContain("different email");
    console.log("PASS: payment_failed member blocked with correct copy");
  });

  test("cancelled member with an existing Stripe customer reaches checkout, and the created session reuses that customer", async ({ request }) => {
    const res = await checkoutRequest(request, CANCELLED_EMAIL);
    expect(res.status(), "cancelled member must not be blocked").toBe(200);
    const body = await res.json();
    expect(body.url).toContain("checkout.stripe.com");

    // Extract the Checkout Session ID from the returned URL and verify
    // against the real Stripe API — not the app's own claim about what it sent.
    const match = body.url.match(/\/pay\/(cs_test_[a-zA-Z0-9]+)/);
    expect(match, `Could not extract session ID from ${body.url}`).toBeTruthy();
    const sessionId = match![1];

    const session = await stripe().checkout.sessions.retrieve(sessionId);
    expect(session.customer).toBe(realCustomerId);
    expect(session.customer_email).toBeFalsy(); // customer_email and customer are mutually exclusive
    console.log(`PASS: rejoin checkout session reused existing customer ${realCustomerId}`);

    await stripe().checkout.sessions.expire(sessionId).catch(() => {});
  });

  test("cancelled member with no stored Stripe customer falls back to customer_email cleanly", async ({ request }) => {
    const res = await checkoutRequest(request, CANCELLED_LEGACY_EMAIL);
    expect(res.status(), "cancelled member must not be blocked even with no stripe_customer_id").toBe(200);
    const body = await res.json();
    expect(body.url).toContain("checkout.stripe.com");

    const match = body.url.match(/\/pay\/(cs_test_[a-zA-Z0-9]+)/);
    expect(match).toBeTruthy();
    const sessionId = match![1];

    const session = await stripe().checkout.sessions.retrieve(sessionId);
    expect(session.customer_email).toBe(CANCELLED_LEGACY_EMAIL);
    console.log("PASS: cancelled member with no stored customer falls back to customer_email");

    await stripe().checkout.sessions.expire(sessionId).catch(() => {});
  });
});
