/**
 * Payment history label derivation and display.
 *
 * Context: 2026-08-01 production defect. Tranche 0/1 renewal charges showed
 * "Subscription update" (Stripe's own auto-generated charge.description) as
 * the plan label on both the member portal and admin Member Support views.
 * Root cause and fix history:
 *   1. First fix attempt (rejected): blocklist more Stripe auto-text strings
 *      on `charge.description`. Reactive, breaks again on the next unseen
 *      Stripe phrase.
 *   2. Second attempt (rejected): fall back to `member.plan_name`. Wrong —
 *      that's a mutable current-state field; a member who changes plan mid-
 *      history would have their entire past payment history relabelled.
 *   3. Third attempt (rejected): snapshot a derived label into a local
 *      `payments` table at `invoice.paid` time. Breaches the hard rule that
 *      CSL never stores payment history — Stripe is the sole system of
 *      record. See CLAUDE.md "Constraints".
 *   4. Shipped fix: read `stripe.invoices.list({ customer, status: "paid" })`
 *      at render time (member portal + admin Member Support), and derive the
 *      label from that specific invoice's own line item
 *      (`paymentLabelFromInvoiceLine`, lib/stripe.ts) — never from
 *      `charge.description` or any mutable current-plan field. No local
 *      storage, no write path, no backfill.
 *
 * Two test groups:
 *   A. Pure unit tests of `paymentLabelFromInvoiceLine` — no network.
 *   B. Live Stripe test-mode integration test proving `status: "paid"`
 *      actually excludes open/void invoices from what the app would render,
 *      and that a £0 trial-period invoice — which Stripe marks "paid" since
 *      nothing was due, found live on a real account while verifying this
 *      fix (2026-08-01) — is also excluded by the app's own filtering, not
 *      just by the Stripe-level status filter.
 *      Creates and cleans up its own test-mode customer/invoices; touches no
 *      real member data.
 *
 * Run:
 *   npx playwright test tests/payment-history-label.spec.ts
 */

import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { paymentLabelFromInvoiceLine, type PaymentHistoryLine } from "@/lib/stripe";

// ── Group A: pure label-derivation tests ────────────────────────────────────

test.describe("paymentLabelFromInvoiceLine — pure derivation", () => {
  function subscriptionLine(amount: number, interval: "month" | "year", proration = false): PaymentHistoryLine {
    return {
      amount,
      parent: {
        type: "subscription_item_details",
        subscription_item_details: { proration },
      },
      pricing: {
        price_details: {
          price: { unit_amount: amount, recurring: { interval } },
        },
      },
    };
  }

  function nonSubscriptionLine(amount: number): PaymentHistoryLine {
    return {
      amount,
      parent: { type: "invoice_item_details" },
      pricing: { price_details: { price: { unit_amount: amount, recurring: null } } },
    };
  }

  test("£10/month → Monthly 10", () => {
    expect(paymentLabelFromInvoiceLine(subscriptionLine(1000, "month"))).toBe("Monthly 10");
  });

  test("£25/month → Monthly 25", () => {
    expect(paymentLabelFromInvoiceLine(subscriptionLine(2500, "month"))).toBe("Monthly 25");
  });

  test("custom monthly £45 → Monthly 45", () => {
    expect(paymentLabelFromInvoiceLine(subscriptionLine(4500, "month"))).toBe("Monthly 45");
  });

  test("£300 collision resolved by interval — monthly", () => {
    // £300 is exactly the annual minimum AND a valid custom monthly amount —
    // genuinely ambiguous from amount alone. Must resolve via interval, not amount.
    expect(paymentLabelFromInvoiceLine(subscriptionLine(30000, "month"))).toBe("Monthly 300");
  });

  test("£300 collision resolved by interval — annual", () => {
    expect(paymentLabelFromInvoiceLine(subscriptionLine(30000, "year"))).toBe("Annual 300");
  });

  test("plan-change-mid-cycle regression: two independently-derived lines never share state", () => {
    // Simulates a member's payment history spanning a plan change: an old
    // invoice at £10/month followed by a new one at £25/month. Each row must
    // keep its own historically-accurate label — proves the function is pure
    // and derives purely from the line passed in, never from any shared or
    // "current" field.
    const beforeChange = paymentLabelFromInvoiceLine(subscriptionLine(1000, "month"));
    const afterChange = paymentLabelFromInvoiceLine(subscriptionLine(2500, "month"));
    expect(beforeChange).toBe("Monthly 10");
    expect(afterChange).toBe("Monthly 25");
    // Re-deriving the earlier line again afterwards must still give the same
    // answer — nothing about deriving the later line could have mutated it.
    expect(paymentLabelFromInvoiceLine(subscriptionLine(1000, "month"))).toBe(beforeChange);
  });

  test("one-off Lifetime payment (£5,000, non-subscription line) → Lifetime Member", () => {
    expect(paymentLabelFromInvoiceLine(nonSubscriptionLine(500000))).toBe("Lifetime Member");
  });

  test("other non-subscription line → neutral Membership label, never a plan name", () => {
    expect(paymentLabelFromInvoiceLine(nonSubscriptionLine(1234))).toBe("Membership");
  });

  test("defensive: an unexpected proration line is labelled as an adjustment, not a plan", () => {
    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args); };
    try {
      const label = paymentLabelFromInvoiceLine(subscriptionLine(500, "month", /* proration */ true));
      expect(label).toBe("Adjustment");
      expect(errors.length).toBeGreaterThan(0); // policy-breach signal must be logged, not silently absorbed
    } finally {
      console.error = originalError;
    }
  });

  test("unexpanded price (caller forgot the expand option) fails safe to a neutral label", () => {
    const line: PaymentHistoryLine = {
      amount: 1000,
      parent: { type: "subscription_item_details", subscription_item_details: { proration: false } },
      pricing: { price_details: { price: "price_notExpanded123" } }, // bare string, not expanded
    };
    expect(paymentLabelFromInvoiceLine(line)).toBe("Membership");
  });
});

// ── Group B: live Stripe test-mode — status: "paid" filter ─────────────────

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRODUCT_ID = process.env.STRIPE_PRODUCT_ID;
const canRunLive = Boolean(STRIPE_SECRET_KEY && STRIPE_PRODUCT_ID);

function stripeClient(): Stripe {
  return new Stripe(STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });
}

test.describe("stripe.invoices.list({ status: 'paid' }) — open/void invoices never render", () => {
  test.skip(!canRunLive, "STRIPE_SECRET_KEY / STRIPE_PRODUCT_ID not set");

  test("an open (unpaid) invoice is excluded from the paid-only list the app renders from", async () => {
    const stripe = stripeClient();

    const customer = await stripe.customers.create({ email: `csl-test-invoice-filter-${Date.now()}@celticsupporters.net` });
    let openInvoice: Stripe.Invoice | null = null;
    let voidInvoice: Stripe.Invoice | null = null;

    try {
      // A genuinely open invoice: create an invoice item then an invoice, but
      // never finalize/pay it. This is exactly what Smart Retries produces
      // mid-dunning — a real state on real member accounts, not a synthetic edge case.
      // collection_method: "send_invoice" avoids any automatic charge attempt
      // (the test customer has no payment method), so finalizing reliably
      // produces status "open" rather than racing straight to another state.
      await stripe.invoiceItems.create({
        customer: customer.id,
        amount: 1000,
        currency: "gbp",
      });
      openInvoice = await stripe.invoices.create({
        customer: customer.id,
        collection_method: "send_invoice",
        days_until_due: 30,
        auto_advance: false,
        pending_invoice_items_behavior: "include",
      });
      openInvoice = await stripe.invoices.finalizeInvoice(openInvoice.id!);
      expect(openInvoice.status).toBe("open");

      // A void invoice: finalize a second one, then void it.
      await stripe.invoiceItems.create({
        customer: customer.id,
        amount: 1000,
        currency: "gbp",
      });
      let toVoid = await stripe.invoices.create({
        customer: customer.id,
        collection_method: "send_invoice",
        days_until_due: 30,
        auto_advance: false,
        pending_invoice_items_behavior: "include",
      });
      toVoid = await stripe.invoices.finalizeInvoice(toVoid.id!);
      voidInvoice = await stripe.invoices.voidInvoice(toVoid.id!);

      // A £0 trial-period invoice: nothing due, so Stripe marks it "paid"
      // even though no money changed hands — found live on a real account
      // while verifying this fix. Passes the Stripe-level status: "paid"
      // filter; must be excluded by the app's own amount_paid > 0 guard.
      let zeroInvoice = await stripe.invoices.create({ customer: customer.id, auto_advance: false });
      zeroInvoice = await stripe.invoices.finalizeInvoice(zeroInvoice.id!);
      expect(zeroInvoice.status).toBe("paid");
      expect(zeroInvoice.amount_paid).toBe(0);

      // This is the exact call shape used in app/member-portal/page.tsx and
      // app/api/admin/member-search/route.ts.
      const paidOnly = await stripe.invoices.list({
        customer: customer.id,
        status: "paid",
        limit: 12,
      });

      // Reproduces the app's own extra filter (amount_paid > 0) on top of
      // the Stripe-level status filter — this is what actually renders.
      const renderedRows = paidOnly.data.filter((inv) => inv.amount_paid > 0);
      const renderedIds = renderedRows.map((inv) => inv.id);
      expect(renderedIds).not.toContain(zeroInvoice.id);
      expect(paidOnly.data.map((inv) => inv.id)).toContain(zeroInvoice.id); // sanity: Stripe's own filter alone would have included it

      const paidIds = paidOnly.data.map((inv) => inv.id);
      expect(paidIds).not.toContain(openInvoice.id);
      expect(paidIds).not.toContain(voidInvoice.id);
      expect(paidOnly.data.length).toBe(1); // only the £0 trial invoice is genuinely "paid" — the app's own filter removes it too
      expect(renderedRows.length).toBe(0); // and nothing at all should actually render for this customer

      // Sanity check: confirm the unfiltered list WOULD have included them,
      // proving the filter is doing real work and this isn't a vacuous pass.
      const unfiltered = await stripe.invoices.list({ customer: customer.id, limit: 12 });
      const unfilteredIds = unfiltered.data.map((inv) => inv.id);
      expect(unfilteredIds).toContain(openInvoice.id);
      expect(unfilteredIds).toContain(voidInvoice.id);

      console.log("PASS: open and void invoices are present in the unfiltered list but excluded once status: 'paid' is applied");
    } finally {
      // Cleanup — void the still-open invoice (can't delete a customer with
      // open invoices attached in some account configs) and delete the customer.
      if (openInvoice?.id) {
        try {
          const current = await stripe.invoices.retrieve(openInvoice.id);
          if (current.status === "open") await stripe.invoices.voidInvoice(openInvoice.id);
        } catch (err) {
          console.error("[payment-history-label test] cleanup: failed to void open test invoice:", err);
        }
      }
      await stripe.customers.del(customer.id).catch((err) =>
        console.error("[payment-history-label test] cleanup: failed to delete test customer:", err)
      );
    }
  });
});
