/**
 * Stripe webhook regression tests — subscription lifecycle.
 *
 * All tests sign payloads locally with STRIPE_WEBHOOK_SECRET so
 * constructEvent passes without hitting the Stripe API. No real
 * Stripe customers are created or charged.
 *
 * Covered events:
 *   invoice.payment_failed   → 200, signature rejection → 400
 *   invoice.paid             → 200
 *   customer.subscription.deleted → 200
 *   customer.subscription.updated → 200
 *   unknown event type       → 200 (graceful ignore)
 *   missing signature header → 400
 *   tampered payload         → 400
 *   malformed JSON body      → 400
 */

import { test, expect } from "@playwright/test";
import crypto from "crypto";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const WEBHOOK_URL    = "/api/webhooks/stripe";

// ── Signing helper ────────────────────────────────────────────────────────────
// Mirrors Stripe SDK's computeSignature: HMAC-SHA256 over "<timestamp>.<body>".

function sign(payload: object, secret: string): { body: string; sig: string } {
  const body      = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const hmac      = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return { body, sig: `t=${timestamp},v1=${hmac}` };
}

// ── Payload factories ─────────────────────────────────────────────────────────

function invoiceEvent(
  type: "invoice.payment_failed" | "invoice.paid",
  customerId: string,
  opts: { attemptCount?: number } = {}
) {
  return {
    id:       `evt_test_${type.replace(/\./g, "_")}_${Date.now()}`,
    object:   "event",
    type,
    livemode: false,
    data: {
      object: {
        id:            `in_test_${Date.now()}`,
        object:        "invoice",
        customer:      customerId,
        amount_due:    1000,
        amount_paid:   type === "invoice.paid" ? 1000 : 0,
        currency:      "gbp",
        status:        type === "invoice.paid" ? "paid" : "open",
        attempt_count: opts.attemptCount ?? 1,
      },
    },
  };
}

function cardExpiringEvent(customerId: string, opts: { expMonth?: number; expYear?: number } = {}) {
  return {
    id:       `evt_test_card_expiring_${Date.now()}`,
    object:   "event",
    type:     "customer.source.expiring",
    livemode: false,
    data: {
      object: {
        id:        `card_test_${Date.now()}`,
        object:    "card",
        customer:  customerId,
        brand:     "Visa",
        last4:     "4242",
        exp_month: opts.expMonth ?? 7,
        exp_year:  opts.expYear ?? 2026,
      },
    },
  };
}

function subscriptionEvent(
  type: "customer.subscription.deleted" | "customer.subscription.updated",
  customerId: string
) {
  return {
    id:       `evt_test_${type.replace(/\./g, "_")}_${Date.now()}`,
    object:   "event",
    type,
    livemode: false,
    data: {
      object: {
        id:       `sub_test_${Date.now()}`,
        object:   "subscription",
        customer: customerId,
        status:   type === "customer.subscription.deleted" ? "canceled" : "active",
        items: {
          data: [
            {
              price: {
                unit_amount: 1000,
                recurring: { interval: "month" },
              },
            },
          ],
        },
      },
    },
  };
}

// ── Helper: post a signed webhook ────────────────────────────────────────────

async function postWebhook(
  request: Parameters<typeof test>[1] extends (args: { request: infer R }) => unknown ? R : never,
  payload: object,
  overrides: { sig?: string; skipSig?: boolean } = {}
) {
  const { body, sig } = sign(payload, WEBHOOK_SECRET);
  return request.post(WEBHOOK_URL, {
    data: body,
    headers: {
      "content-type": "application/json",
      ...(overrides.skipSig ? {} : { "stripe-signature": overrides.sig ?? sig }),
    },
  });
}

// ── Guard ─────────────────────────────────────────────────────────────────────

// Run all webhook tests serially — the Next.js dev server handles concurrent
// requests fine but the in-process connection pool can exhaust under rapid parallel load.
test.describe.configure({ mode: "serial" });

test.beforeEach(({}, testInfo) => {
  if (!WEBHOOK_SECRET) testInfo.skip(true, "STRIPE_WEBHOOK_SECRET not set");
});

// ── invoice.payment_failed ────────────────────────────────────────────────────

test.describe("invoice.payment_failed", () => {
  test("returns 200 for a valid signed payload", async ({ request }) => {
    const { body, sig } = sign(invoiceEvent("invoice.payment_failed", "cus_no_match_fail"), WEBHOOK_SECRET);
    const res = await request.post(WEBHOOK_URL, {
      data: body,
      headers: { "content-type": "application/json", "stripe-signature": sig },
    });
    expect(res.status()).toBe(200);
  });

  test("returns 200 even when customer ID matches no member row", async ({ request }) => {
    const payload = invoiceEvent("invoice.payment_failed", "cus_nonexistent_xyz");
    const res = await postWebhook(request, payload);
    expect(res.status()).toBe(200);
  });

  test("returns 200 with attempt_count=1 (first failure)", async ({ request }) => {
    const payload = invoiceEvent("invoice.payment_failed", "cus_dunning_attempt1", { attemptCount: 1 });
    const res = await postWebhook(request, payload);
    expect(res.status()).toBe(200);
  });

  test("returns 200 with attempt_count=2 (second retry)", async ({ request }) => {
    const payload = invoiceEvent("invoice.payment_failed", "cus_dunning_attempt2", { attemptCount: 2 });
    const res = await postWebhook(request, payload);
    expect(res.status()).toBe(200);
  });

  test("returns 200 with attempt_count=3 (final retry)", async ({ request }) => {
    const payload = invoiceEvent("invoice.payment_failed", "cus_dunning_attempt3", { attemptCount: 3 });
    const res = await postWebhook(request, payload);
    expect(res.status()).toBe(200);
  });

  test("returns 400 for tampered payload", async ({ request }) => {
    const payload = invoiceEvent("invoice.payment_failed", "cus_tamper");
    const { body } = sign(payload, WEBHOOK_SECRET);
    const res = await request.post(WEBHOOK_URL, {
      data: body,
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=999999,v1=invalidsignature",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 400 when stripe-signature header is absent", async ({ request }) => {
    const { body } = sign(invoiceEvent("invoice.payment_failed", "cus_nosig"), WEBHOOK_SECRET);
    const res = await request.post(WEBHOOK_URL, {
      data: body,
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });
});

// ── invoice.paid ──────────────────────────────────────────────────────────────

test.describe("invoice.paid", () => {
  test("returns 200 for a valid signed payload", async ({ request }) => {
    const res = await postWebhook(request, invoiceEvent("invoice.paid", "cus_no_match_paid"));
    expect(res.status()).toBe(200);
  });

  test("returns 200 even when customer ID matches no member row", async ({ request }) => {
    const res = await postWebhook(request, invoiceEvent("invoice.paid", "cus_nonexistent_abc"));
    expect(res.status()).toBe(200);
  });

  test("returns 400 for tampered payload", async ({ request }) => {
    const { body } = sign(invoiceEvent("invoice.paid", "cus_tamper_paid"), WEBHOOK_SECRET);
    const res = await request.post(WEBHOOK_URL, {
      data: body,
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=badhash",
      },
    });
    expect(res.status()).toBe(400);
  });
});

// ── customer.subscription.deleted ────────────────────────────────────────────

test.describe("customer.subscription.deleted", () => {
  test("returns 200 for a valid signed payload", async ({ request }) => {
    const res = await postWebhook(
      request,
      subscriptionEvent("customer.subscription.deleted", "cus_no_match_del")
    );
    expect(res.status()).toBe(200);
  });

  test("returns 200 even when customer ID matches no member row", async ({ request }) => {
    const res = await postWebhook(
      request,
      subscriptionEvent("customer.subscription.deleted", "cus_nonexistent_del")
    );
    expect(res.status()).toBe(200);
  });

  test("returns 400 for tampered payload", async ({ request }) => {
    const { body } = sign(
      subscriptionEvent("customer.subscription.deleted", "cus_tamper_del"),
      WEBHOOK_SECRET
    );
    const res = await request.post(WEBHOOK_URL, {
      data: body,
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=badhash",
      },
    });
    expect(res.status()).toBe(400);
  });
});

// ── customer.subscription.updated ────────────────────────────────────────────

test.describe("customer.subscription.updated", () => {
  test("returns 200 for a valid signed payload", async ({ request }) => {
    const res = await postWebhook(
      request,
      subscriptionEvent("customer.subscription.updated", "cus_no_match_upd")
    );
    expect(res.status()).toBe(200);
  });

  test("returns 200 even when customer ID matches no member row", async ({ request }) => {
    const res = await postWebhook(
      request,
      subscriptionEvent("customer.subscription.updated", "cus_nonexistent_upd")
    );
    expect(res.status()).toBe(200);
  });
});

// ── customer.source.expiring ─────────────────────────────────────────────────

test.describe("customer.source.expiring", () => {
  test("returns 200 for a valid signed payload", async ({ request }) => {
    const res = await postWebhook(request, cardExpiringEvent("cus_no_match_expiring"));
    expect(res.status()).toBe(200);
  });

  test("returns 200 even when customer ID matches no member row", async ({ request }) => {
    const res = await postWebhook(request, cardExpiringEvent("cus_nonexistent_expiring"));
    expect(res.status()).toBe(200);
  });

  test("returns 200 with card expiring next month", async ({ request }) => {
    const now = new Date();
    const res = await postWebhook(
      request,
      cardExpiringEvent("cus_expiring_soon", {
        expMonth: now.getMonth() + 2 || 1,
        expYear:  now.getFullYear(),
      })
    );
    expect(res.status()).toBe(200);
  });

  test("returns 400 for tampered payload", async ({ request }) => {
    const { body } = sign(cardExpiringEvent("cus_tamper_expiring"), WEBHOOK_SECRET);
    const res = await request.post(WEBHOOK_URL, {
      data: body,
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=badhash",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 400 when stripe-signature header is absent", async ({ request }) => {
    const { body } = sign(cardExpiringEvent("cus_nosig_expiring"), WEBHOOK_SECRET);
    const res = await request.post(WEBHOOK_URL, {
      data: body,
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

test.describe("webhook edge cases", () => {
  test("returns 200 for unknown event type (graceful ignore)", async ({ request }) => {
    const payload = {
      id:       `evt_test_unknown_${Date.now()}`,
      object:   "event",
      type:     "some.unknown.event",
      livemode: false,
      data:     { object: {} },
    };
    const res = await postWebhook(request, payload);
    expect(res.status()).toBe(200);
  });

  test("returns 400 for malformed JSON body", async ({ request }) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const badBody   = "this is not json {{{";
    const hmac      = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(`${timestamp}.${badBody}`)
      .digest("hex");
    const res = await request.post(WEBHOOK_URL, {
      data: badBody,
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${hmac}`,
      },
    });
    // Signature passes (body signed correctly) but JSON.parse fails → 400
    expect(res.status()).toBe(400);
  });

  test("returns 400 for empty body with valid signature", async ({ request }) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const emptyBody = "";
    const hmac      = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(`${timestamp}.${emptyBody}`)
      .digest("hex");
    const res = await request.post(WEBHOOK_URL, {
      data: emptyBody,
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${hmac}`,
      },
    });
    expect(res.status()).toBe(400);
  });
});
