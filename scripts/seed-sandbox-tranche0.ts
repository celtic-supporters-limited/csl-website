#!/usr/bin/env node
/**
 * scripts/seed-sandbox-tranche0.ts
 *
 * Creates sandbox Stripe customers + attached payment methods mirroring the
 * tranche0_seed.csv insider accounts, then writes tranche0_sandbox.csv with
 * the resulting sandbox cus_/pm_ IDs.
 *
 * Run once. Re-running is safe — uses idempotency keys so duplicate customers
 * are not created if the script is interrupted and re-run.
 *
 * Output: scripts/tranche0_sandbox.csv (alongside this file)
 *
 * Usage:
 *   npx tsx scripts/seed-sandbox-tranche0.ts
 *
 * Env vars (loaded from .env.local):
 *   STRIPE_SECRET_KEY — MUST be a sk_test_... key (hard-checked)
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import Stripe from "stripe";

// ── Env loader ────────────────────────────────────────────────────────────────

function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      const [, key, val] = m;
      if (process.env[key] == null) process.env[key] = val.replace(/^['"]|['"]$/g, "");
    }
  } catch { /* absent */ }
}

// ── Sandbox member definitions (mirrors tranche0_seed.csv) ───────────────────
// billing_cycle_anchor values kept identical to the live seed so the migration
// dry-run output is directly comparable.

interface TrancheMember {
  email: string;
  first_name: string;
  last_name: string;
  plan_name: string;
  billing_amount_gbp: number;
  billing_interval: "month" | "year";
  billing_cycle_anchor: string; // ISO datetime string
  wp_subscription_id: string;
  card_expiry_check_needed: "Y" | "N";
  notes: string;
  // test card: use the UK Visa success card so results are realistic
  test_payment_method: string;
}

const MEMBERS: TrancheMember[] = [
  {
    email:                    "gary.phinn@outlook.com",
    first_name:               "Gary",
    last_name:                "Phinn",
    plan_name:                "Monthly £10",
    billing_amount_gbp:       10,
    billing_interval:         "month",
    billing_cycle_anchor:     "2026-07-01 09:36:37",
    wp_subscription_id:       "598",
    card_expiry_check_needed: "Y",
    notes:                    "Card on file expires this month per WP export - verify in Stripe dashboard before creating subscription, or first renewal (01/07/2026) may fail",
    // UK Visa — SCA region, no 3DS required by default
    test_payment_method:      "pm_card_gb",
  },
  {
    email:                    "martimank@hotmail.com",
    first_name:               "Martin",
    last_name:                "Kenny",
    plan_name:                "Monthly £10",
    billing_amount_gbp:       10,
    billing_interval:         "month",
    billing_cycle_anchor:     "2026-06-16 16:53:36",
    wp_subscription_id:       "483",
    card_expiry_check_needed: "N",
    notes:                    "Renewal due 16/06/2026 - close to cutover date, billing_cycle_anchor will trigger first Stripe invoice within days of subscription creation",
    test_payment_method:      "pm_card_gb",
  },
  {
    email:                    "brianmcpru@gmail.com",
    first_name:               "Brian",
    last_name:                "McLaughlin",
    plan_name:                "PWYW Monthly",
    billing_amount_gbp:       30,
    billing_interval:         "month",
    billing_cycle_anchor:     "2026-06-17 13:03:24",
    wp_subscription_id:       "7",
    card_expiry_check_needed: "N",
    notes:                    "PWYW plan - £30/month",
    test_payment_method:      "pm_card_gb",
  },
];

// ── CSV writer ────────────────────────────────────────────────────────────────

function writeSandboxCSV(
  rows: Array<TrancheMember & { stripe_customer_id: string; stripe_payment_method_id: string }>,
  outputPath: string
): void {
  const headers = [
    "email", "first_name", "last_name",
    "stripe_customer_id", "stripe_payment_method_id",
    "plan_name", "billing_amount_gbp", "billing_interval",
    "billing_cycle_anchor", "wp_subscription_id",
    "card_expiry_check_needed", "notes",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.email, r.first_name, r.last_name,
        r.stripe_customer_id, r.stripe_payment_method_id,
        r.plan_name, r.billing_amount_gbp, r.billing_interval,
        `"${r.billing_cycle_anchor}"`, r.wp_subscription_id,
        r.card_expiry_check_needed, `"${r.notes.replace(/"/g, '""')}"`,
      ].join(",")
    ),
  ];
  writeFileSync(outputPath, lines.join("\n"), "utf-8");
}

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();

void (async () => {

const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
if (!stripeKey) {
  console.error("Missing env var: STRIPE_SECRET_KEY");
  process.exit(1);
}
if (!stripeKey.startsWith("sk_test_")) {
  console.error("ERROR: STRIPE_SECRET_KEY must be a test key (sk_test_...). Refusing to run against live mode.");
  process.exit(1);
}

const stripe = new Stripe(stripeKey, { apiVersion: "2026-05-27.dahlia" });

console.log("=".repeat(60));
console.log("CSL Tranche 0 — Sandbox Seeder");
console.log("=".repeat(60));
console.log(`Stripe mode : TEST (sandbox)`);
console.log(`Members     : ${MEMBERS.length}`);
console.log();

const results: Array<TrancheMember & { stripe_customer_id: string; stripe_payment_method_id: string }> = [];

for (const member of MEMBERS) {
  const idempotencyKey = `sandbox-seed-csl-${member.wp_subscription_id}`;

  try {
    // Create or retrieve sandbox customer (idempotency key prevents duplicates)
    const customer = await stripe.customers.create(
      {
        email: member.email,
        name:  `${member.first_name} ${member.last_name}`,
        metadata: {
          wp_subscription_id: member.wp_subscription_id,
          sandbox_seed:       "tranche0",
        },
      },
      { idempotencyKey }
    );

    // Attach the test payment method to the customer
    const pm = await stripe.paymentMethods.attach(
      member.test_payment_method,
      { customer: customer.id },
      { idempotencyKey: `${idempotencyKey}-pm` }
    );

    // Set as default payment method on the customer
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });

    console.log(`  CREATED  ${member.email}`);
    console.log(`    customer_id         : ${customer.id}`);
    console.log(`    payment_method_id   : ${pm.id}`);
    console.log(`    card                : ${pm.card?.brand} •••• ${pm.card?.last4} (${pm.card?.exp_month}/${pm.card?.exp_year})`);
    console.log();

    results.push({
      ...member,
      stripe_customer_id:       customer.id,
      stripe_payment_method_id: pm.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL  ${member.email}: ${msg}`);
    process.exit(1);
  }
}

const outputPath = resolve(process.cwd(), "scripts", "tranche0_sandbox.csv");
writeSandboxCSV(results, outputPath);

console.log("=".repeat(60));
console.log(`Sandbox seed complete. CSV written to:`);
console.log(`  ${outputPath}`);
console.log();
console.log("Next step:");
console.log("  npx tsx scripts/create-subscriptions.ts --input scripts/tranche0_sandbox.csv");
console.log("  (dry-run first, then add --live when ready)");
console.log("=".repeat(60));

})();
