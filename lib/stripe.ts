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
