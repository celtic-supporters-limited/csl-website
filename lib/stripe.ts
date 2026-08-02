import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing env var: STRIPE_SECRET_KEY is required.");
  }

  client = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
  return client;
}

// US state abbreviations that sometimes appear in country field on legacy Stripe charges
const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

// Paginate all successful Stripe charges and return aggregate totals.
// Only call from background contexts (cron, upload) — never on page load.
export async function sweepStripeCharges(): Promise<{
  total_collected_pence: number;
  earliest_charge_date: string | null;
  country_breakdown: Record<string, number>;
}> {
  const stripe = getStripe();
  let total = 0;
  let earliest: string | null = null;
  const countryTally: Record<string, number> = {};
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const batch = await stripe.charges.list({ limit: 100, starting_after: startingAfter });
    for (const charge of batch.data) {
      if (charge.paid && charge.status === "succeeded") {
        total += charge.amount - (charge.amount_refunded ?? 0);
        const raw = charge.billing_details?.address?.country ?? "Unknown";
        const country = US_STATE_CODES.has(raw) ? "US" : raw;
        countryTally[country] = (countryTally[country] ?? 0) + 1;
      }
      // charges.list is newest-first; last item in the final batch is the earliest
      earliest = new Date(charge.created * 1000).toISOString().split("T")[0];
    }
    hasMore = batch.has_more;
    startingAfter = batch.data[batch.data.length - 1]?.id;
  }

  return { total_collected_pence: total, earliest_charge_date: earliest, country_breakdown: countryTally };
}

// The dahlia Stripe API version moved `current_period_end` from the
// subscription root to the first subscription item. Older SDK types still
// expect it on the root, so callers must check both locations — this is the
// one place that lookup happens, so the two call sites (member portal,
// admin member search) can't drift out of sync with each other again.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSubscriptionPeriodEnd(sub: any): number | null {
  const item = sub?.items?.data?.[0];
  return item?.current_period_end ?? sub?.current_period_end ?? null;
}

// Stopgap for the deferred pending-cancellation email/banner work (see
// .claude/NOTES.md "Cancellation handling") — surfaces the same information
// via the daily monitoring digest instead, until the real feature is built.
// Combined signal, not cancel_at_period_end alone: the customer Billing
// Portal sets cancel_at directly (confirmed via a real captured payload);
// only our own /api/subscription/* annual-switch flow sets the boolean.
// Only call from background contexts (cron) — paginates every active
// subscription, same cost profile as sweepStripeCharges().
export type PendingCancellationStripeInfo = {
  customerId: string;
  endsAtUnix: number;
  amountPence: number | null;
  interval: string | null;
};

export async function findPendingCancellations(): Promise<PendingCancellationStripeInfo[]> {
  const stripe = getStripe();
  const results: PendingCancellationStripeInfo[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const batch = await stripe.subscriptions.list({ status: "active", limit: 100, starting_after: startingAfter });
    for (const sub of batch.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = sub as any;
      const cancelAt: number | null = s.cancel_at ?? (s.cancel_at_period_end ? getSubscriptionPeriodEnd(s) : null);
      if (cancelAt) {
        const customerId = typeof s.customer === "string" ? s.customer : s.customer?.id;
        if (customerId) {
          const item = s.items?.data?.[0];
          results.push({
            customerId,
            endsAtUnix: cancelAt,
            amountPence: item?.price?.unit_amount ?? null,
            interval: item?.price?.recurring?.interval ?? null,
          });
        }
      }
    }
    hasMore = batch.has_more;
    startingAfter = batch.data[batch.data.length - 1]?.id;
  }

  return results;
}

// ── Payment history label derivation ────────────────────────────────────────
// Shared by the member portal and admin Member Support payment history views.
// Never derive a plan label from a mutable current-state field (member.plan_name)
// or from Stripe's own auto-generated charge.description text — both produced
// real production defects (2026-08-01). Always derive from the specific
// invoice line item being displayed, so a later plan change can never rewrite
// how a past payment is labelled, and Stripe's internal wording ("Subscription
// update", "Subscription creation") never reaches a member or volunteer.
//
// In the 2026-05-27 "dahlia" Stripe API version, an invoice line item has no
// top-level `price` field — it's nested at `pricing.price_details.price`,
// which returns a bare price ID unless the caller expands it (confirmed live,
// 2026-08-01: `expand: ["data.lines.data.pricing.price_details.price"]` on
// `invoices.list()` returns the full Price object in the same call, no extra
// round trip). Callers of this helper must pass that expand option.
export type PaymentHistoryLine = {
  amount: number;
  parent: {
    type?: string;
    subscription_item_details?: { proration?: boolean } | null;
  } | null;
  pricing: {
    price_details?: {
      price?: string | { unit_amount: number | null; recurring: { interval: string } | null } | null;
    } | null;
  } | null;
};

// One-off charge (e.g. Lifetime) or a manually added invoice item — never
// attach a recurring membership plan name to either. Lifetime is a fixed,
// known amount (see app/api/checkout/route.ts), so it can still be named
// specifically without guessing at any other one-off amount. Shared between
// the invoice-line non-subscription branch and raw Charge objects that never
// got an invoice at all (Lifetime payments made before invoice_creation was
// enabled on that Checkout session — see paymentHistoryRowFromCharge below).
export function nonSubscriptionPaymentLabel(amountPence: number): string {
  return amountPence === 500000 ? "Lifetime Member" : "Membership";
}

export function paymentLabelFromInvoiceLine(line: PaymentHistoryLine): string {
  const isSubscriptionLine = line.parent?.type === "subscription_item_details";

  if (!isSubscriptionLine) {
    return nonSubscriptionPaymentLabel(line.amount);
  }

  // Defensive: CSL's plan-change routes all use proration_behavior: "none",
  // so a proration line should never occur. If one appears anyway, that is a
  // policy breach signal, not something to silently label as a normal plan —
  // log it and surface a neutral "Adjustment" label instead.
  if (line.parent?.subscription_item_details?.proration) {
    console.error(
      "[payment-history] Unexpected proration line on a paid invoice — policy says proration_behavior: 'none' everywhere. Investigate before trusting this row's amount."
    );
    return "Adjustment";
  }

  const price = line.pricing?.price_details?.price;
  if (!price || typeof price === "string") {
    // Not expanded — caller forgot the expand option, or Stripe returned an
    // unexpanded price for some other reason. Fail safe to a neutral label
    // rather than guessing from amount alone.
    return "Membership";
  }

  const unitAmount = price.unit_amount ?? line.amount;
  const amountPounds = Math.round(unitAmount / 100);
  const interval = price.recurring?.interval;

  if (interval === "year") return `Annual ${amountPounds}`;
  if (unitAmount === 1000) return "Monthly 10";
  if (unitAmount === 2500) return "Monthly 25";
  return `Monthly ${amountPounds}`;
}

// A single row for either display surface — built from an Invoice (the
// normal case) or from a raw Charge that never got an invoice (only
// possible for a one-off payment made before invoice_creation was enabled
// on the Lifetime Checkout session; every subscription charge always has
// an invoice). Both sources converge on this shape so callers can merge
// and sort them without caring which Stripe object a row came from.
export type PaymentHistoryRow = {
  id: string;
  amount_pence: number;
  plan_name: string;
  paid_at: string;
  url: string | null;
};

export function paymentHistoryRowFromCharge(charge: {
  id: string;
  amount: number;
  created: number;
  receipt_url?: string | null;
}): PaymentHistoryRow {
  return {
    id: charge.id,
    amount_pence: charge.amount,
    plan_name: nonSubscriptionPaymentLabel(charge.amount),
    paid_at: new Date(charge.created * 1000).toISOString(),
    url: charge.receipt_url ?? null,
  };
}

// Full payment history for a customer, from both Stripe sources — used by
// the member portal and admin Member Support. Two sources, not one:
//   - invoices.list() covers every subscription charge, always (a
//     subscription charge always produces an invoice). Filtered to genuinely
//     paid, non-£0 invoices — see the inline comments below.
//   - charges.list() catches the one case invoices can't: a one-off payment
//     made before invoice_creation was enabled on the Lifetime Checkout
//     session (see app/api/checkout/route.ts) has a Charge but no Invoice.
//     The 2026-05-27 "dahlia" API version's Charge object has no `invoice`
//     field at all (confirmed — grepped the SDK types), so invoice-backed
//     charges are excluded by cross-referencing payment_intent against the
//     invoices already fetched above, rather than by a direct field.
// Fetches up to 100 of each (Stripe's per-page max) in one call each, no
// pagination — CSL's real member volumes make a second page unreachable in
// practice; if that ever changes, has_more on either response is the signal
// to add real pagination, not a reason to build it pre-emptively today.
export async function fetchPaymentHistory(customerId: string): Promise<PaymentHistoryRow[]> {
  const stripe = getStripe();

  const [invoicesResult, chargesResult] = await Promise.allSettled([
    stripe.invoices.list({
      customer: customerId,
      status: "paid",
      limit: 100,
      // "data.payments" (not "data.payment_intent" — no such top-level field
      // exists on Invoice in this API version, confirmed live 2026-08-02) is
      // how an invoice's payment_intent is reached: invoice.payment_intent
      // was replaced by invoice.payments, a list of InvoicePayment objects
      // each carrying .payment.payment_intent. Stripe caps expand at 4
      // levels, so this is expanded one level (giving the payment_intent as
      // a plain string ID, confirmed live — no need to expand further) and
      // "data.lines.data.pricing.price_details.price" is a second, separate
      // expand entry for the label logic.
      expand: ["data.lines.data.pricing.price_details.price", "data.payments"],
    }),
    stripe.charges.list({ customer: customerId, limit: 100 }),
  ]);

  // Every invoice's own payment_intent, so invoice-backed charges can be
  // excluded from the charges pass below without a direct invoice field.
  const invoicePaymentIntentIds = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawInvoices: any[] = invoicesResult.status === "fulfilled" ? (invoicesResult.value.data as any[]) : [];
  for (const invoice of rawInvoices) {
    const pi = invoice.payments?.data?.[0]?.payment?.payment_intent;
    const piId = typeof pi === "string" ? pi : pi?.id;
    if (piId) invoicePaymentIntentIds.add(piId);
  }

  const invoiceRows: PaymentHistoryRow[] = rawInvoices
    // A trial-period invoice with nothing due is marked "paid" by Stripe
    // (trivially satisfied), same as the annual-switch trial start
    // (checkout.session.completed's subscription_data.trial_end).
    // Showing a £0 row as a "payment" is the same credibility problem
    // this history was fixed for — the invoice.paid webhook handler
    // already skips these for the same reason.
    .filter((invoice) => (invoice.amount_paid as number) > 0)
    .map((invoice) => {
      const line = invoice.lines?.data?.[0];
      return {
        id: invoice.id as string,
        amount_pence: invoice.amount_paid as number,
        plan_name: line ? paymentLabelFromInvoiceLine(line) : "Membership",
        paid_at: new Date(
          ((invoice.status_transitions?.paid_at as number) ?? (invoice.created as number)) * 1000
        ).toISOString(),
        url: (invoice.hosted_invoice_url as string | null) ?? null,
      };
    });
  if (invoicesResult.status === "rejected") {
    console.error("[payment-history] Stripe invoices fetch error:", invoicesResult.reason);
  }

  const chargeRows: PaymentHistoryRow[] = chargesResult.status === "fulfilled"
    ? chargesResult.value.data
        .filter((charge) => {
          const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
          const isInvoiceBacked = !!piId && invoicePaymentIntentIds.has(piId);
          return !isInvoiceBacked && charge.paid && charge.amount > 0;
        })
        .map(paymentHistoryRowFromCharge)
    : [];
  if (chargesResult.status === "rejected") {
    console.error("[payment-history] Stripe charges fetch error:", chargesResult.reason);
  }

  return [...invoiceRows, ...chargeRows].sort(
    (a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
  );
}

// Plan identifiers used across client and server
export type PlanType =
  | "standard"
  | "accelerator"
  | "custom_monthly"
  | "custom_annual"
  | "lifetime";

// Server-side validation — returns an error string or null
export function validatePlan(
  plan: PlanType,
  amount: number | undefined
): string | null {
  if (plan === "custom_monthly") {
    if (!amount || !Number.isInteger(amount) || amount < 30 || amount % 5 !== 0)
      return "Custom monthly amount must be at least £30 in £5 increments.";
  }
  if (plan === "custom_annual") {
    if (!amount || !Number.isInteger(amount) || amount < 300 || amount % 10 !== 0)
      return "Custom annual amount must be at least £300 in £10 increments.";
  }
  return null;
}
