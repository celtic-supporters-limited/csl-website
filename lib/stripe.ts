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

// Paginate all successful Stripe charges and return aggregate totals.
// Only call from background contexts (cron, upload) — never on page load.
export async function sweepStripeCharges(): Promise<{
  total_collected_pence: number;
  earliest_charge_date: string | null;
}> {
  const stripe = getStripe();
  let total = 0;
  let earliest: string | null = null;
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const batch = await stripe.charges.list({ limit: 100, starting_after: startingAfter });
    for (const charge of batch.data) {
      if (charge.paid && charge.status === "succeeded") {
        total += charge.amount - (charge.amount_refunded ?? 0);
      }
      // charges.list is newest-first; last item in the final batch is the earliest
      earliest = new Date(charge.created * 1000).toISOString().split("T")[0];
    }
    hasMore = batch.has_more;
    startingAfter = batch.data[batch.data.length - 1]?.id;
  }

  return { total_collected_pence: total, earliest_charge_date: earliest };
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
