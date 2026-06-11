#!/usr/bin/env node
/**
 * scripts/create-subscriptions.ts
 *
 * Reads a seed CSV and creates Stripe Subscriptions for members who already
 * have a Stripe Customer + saved PaymentMethod from the legacy WordPress
 * billing system. Uses dynamic price_data (not pre-created Price IDs) to
 * match the CSL website's checkout approach.
 *
 * Behaviour:
 *   - Dry-run ON by default — logs what would be created, nothing sent to Stripe
 *   - Pass --execute to actually create subscriptions
 *   - Uses idempotency key per customer (stripe_customer_id) so re-runs after
 *     a partial failure will not create duplicate subscriptions
 *   - Writes a results CSV log alongside the input file
 *
 * DO NOT run with a live Stripe key until sandbox test is complete and
 * insider sign-off (Gary/Martin tranche 0) is confirmed.
 *
 * Expected CSV columns:
 *   email, first_name, last_name, stripe_customer_id, stripe_payment_method_id,
 *   plan_name, billing_amount_gbp, billing_interval (month|year),
 *   billing_cycle_anchor, wp_subscription_id, card_expiry_check_needed, notes
 *
 * billing_interval defaults to "month" if the column is absent.
 * billing_amount_gbp must be a positive number (GBP, e.g. 10 or 10.00).
 *
 * Usage (dry-run — safe at any time):
 *   npx tsx scripts/create-subscriptions.ts --input tranche0_seed.csv
 *
 * Usage (sandbox, actually create):
 *   npx tsx scripts/create-subscriptions.ts --input tranche0_seed.csv --execute
 *
 * Usage (LIVE — only after sandbox + insider sign-off):
 *   STRIPE_SECRET_KEY=sk_live_... npx tsx scripts/create-subscriptions.ts --input tranche0_seed.csv --execute
 *
 * Env vars (loaded from .env.local if present):
 *   STRIPE_SECRET_KEY   — sk_test_... for sandbox, sk_live_... for production
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname, basename } from "path";
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

// ── Plan derivation (mirrors webhook derivePlanName / deriveTier) ─────────────

function derivePlanName(interval: string, amountPence: number): string {
  const gbp = Math.round(amountPence / 100);
  if (interval === "year") return `Annual ${gbp}`;
  if (amountPence === 1000) return "Monthly 10";
  if (amountPence === 2500) return "Monthly 25";
  return `Monthly ${gbp}`;
}

function deriveTier(interval: string): "monthly" | "annual" {
  return interval === "year" ? "annual" : "monthly";
}

// ── CSV parser ────────────────────────────────────────────────────────────────

interface SeedRow {
  email: string;
  first_name: string;
  last_name: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  plan_name: string;
  billing_amount_gbp: number;
  billing_interval: "month" | "year";
  billing_cycle_anchor: Date;
  wp_subscription_id: string;
  card_expiry_check_needed: boolean;
  notes: string;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function parseCSV(filePath: string): SeedRow[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV has no data rows");

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

  const col = (name: string, optional = false): number => {
    const idx = headers.indexOf(name);
    if (idx === -1 && !optional) throw new Error(`Missing required column: "${name}"`);
    return idx;
  };

  const colEmail    = col("email");
  const colFirst    = col("first_name");
  const colLast     = col("last_name");
  const colCusId    = col("stripe_customer_id");
  const colPmId     = col("stripe_payment_method_id");
  const colPlanName = col("plan_name");
  const colAmount   = col("billing_amount_gbp");
  const colInterval = col("billing_interval", true); // optional — defaults to "month"
  const colAnchor   = col("billing_cycle_anchor");
  const colWpId     = col("wp_subscription_id");
  const colCheck    = col("card_expiry_check_needed");
  const colNotes    = col("notes");

  const rows: SeedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    if (cells.every((c) => c.trim() === "")) continue;

    const anchorRaw = cells[colAnchor]?.trim() ?? "";
    const anchor = anchorRaw ? new Date(anchorRaw) : null;
    if (!anchor || isNaN(anchor.getTime())) {
      console.warn(`  WARN  row ${i + 1}: invalid billing_cycle_anchor "${anchorRaw}" — skipping`);
      continue;
    }

    const amountGbp = parseFloat(cells[colAmount]?.trim() ?? "0");
    if (!amountGbp || amountGbp <= 0) {
      console.warn(`  WARN  row ${i + 1}: invalid billing_amount_gbp "${cells[colAmount]}" — skipping`);
      continue;
    }

    const rawInterval = colInterval !== -1 ? cells[colInterval]?.trim().toLowerCase() : "";
    const billingInterval: "month" | "year" =
      rawInterval === "year" || rawInterval === "annual" || rawInterval === "yearly"
        ? "year"
        : "month";

    rows.push({
      email:                    cells[colEmail]?.trim().toLowerCase() ?? "",
      first_name:               cells[colFirst]?.trim() ?? "",
      last_name:                cells[colLast]?.trim() ?? "",
      stripe_customer_id:       cells[colCusId]?.trim() ?? "",
      stripe_payment_method_id: cells[colPmId]?.trim() ?? "",
      plan_name:                cells[colPlanName]?.trim() ?? "",
      billing_amount_gbp:       amountGbp,
      billing_interval:         billingInterval,
      billing_cycle_anchor:     anchor,
      wp_subscription_id:       cells[colWpId]?.trim() ?? "",
      card_expiry_check_needed: cells[colCheck]?.trim().toUpperCase() === "Y",
      notes:                    cells[colNotes]?.trim().replace(/^["']|["']$/g, "") ?? "",
    });
  }

  return rows;
}

// ── Live PaymentMethod lookup ─────────────────────────────────────────────────

interface LiveCard {
  brand: string;
  last4: string;
  expDisplay: string;   // MM/YYYY
  isExpired: boolean;
  expiringSoon: boolean; // expires within 60 days
}

async function fetchLiveCard(stripe: InstanceType<typeof Stripe>, pmId: string): Promise<LiveCard | null> {
  try {
    const pm = await stripe.paymentMethods.retrieve(pmId);
    if (!pm.card) return null;
    const { brand, last4, exp_month, exp_year } = pm.card;
    const now = new Date();
    const cardExpiry = new Date(exp_year, exp_month - 1, 1); // first of expiry month
    const cutoffExpired = new Date(now.getFullYear(), now.getMonth(), 1);
    const cutoffSoon    = new Date(now.getFullYear(), now.getMonth() + 2, 1); // 60 days out
    return {
      brand:        brand ?? "unknown",
      last4:        last4 ?? "????",
      expDisplay:   `${String(exp_month).padStart(2, "0")}/${exp_year}`,
      isExpired:    cardExpiry < cutoffExpired,
      expiringSoon: !cardExpiry.valueOf() || (cardExpiry >= cutoffExpired && cardExpiry < cutoffSoon),
    };
  } catch {
    return null;
  }
}

// ── Results CSV writer ────────────────────────────────────────────────────────

interface ResultRow {
  email: string;
  stripe_customer_id: string;
  wp_subscription_id: string;
  member_type: string; // "standard" | "orphaned"
  plan_name: string;
  billing_amount_gbp: string;
  billing_interval: string;
  billing_cycle_anchor: string;
  card_brand: string;
  card_last4: string;
  card_expiry: string;
  card_status: string; // "ok" | "expiring_soon" | "expired" | "unknown"
  subscription_id: string;
  status: "created" | "dry_run" | "already_exists" | "error";
  error_message: string;
  notes: string;
}

function writeResultsCSV(rows: ResultRow[], outputPath: string): void {
  const headers: (keyof ResultRow)[] = [
    "email", "stripe_customer_id", "wp_subscription_id", "member_type", "plan_name",
    "billing_amount_gbp", "billing_interval", "billing_cycle_anchor",
    "card_brand", "card_last4", "card_expiry", "card_status",
    "subscription_id", "status", "error_message", "notes",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ];
  writeFileSync(outputPath, lines.join("\n"), "utf-8");
}

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();

void (async () => {

const args       = process.argv.slice(2);
const dryRun     = !args.includes("--execute");
const inputIdx   = args.indexOf("--input");
const inputPath  = inputIdx !== -1 ? args[inputIdx + 1] : null;

if (!inputPath) {
  console.error("Usage: npx tsx scripts/create-subscriptions.ts --input <seed.csv> [--execute]");
  process.exit(1);
}

const resolvedInput = resolve(inputPath);
if (!existsSync(resolvedInput)) {
  console.error(`Input file not found: ${resolvedInput}`);
  process.exit(1);
}

const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
if (!stripeKey) {
  console.error("Missing env var: STRIPE_SECRET_KEY");
  process.exit(1);
}

const isTestMode = stripeKey.startsWith("sk_test_");

console.log("=".repeat(60));
console.log("CSL Stripe Subscription Migration");
console.log("=".repeat(60));
console.log(`Stripe mode : ${isTestMode ? "TEST (sandbox)" : "⚠️  LIVE"}`);
console.log(`Input CSV   : ${resolvedInput}`);
console.log(`Dry run     : ${dryRun ? "YES (pass --execute to create subscriptions)" : "NO — subscriptions will be created"}`);
console.log();

if (!isTestMode && !dryRun) {
  console.log("⚠️  WARNING: --execute flag set against a LIVE Stripe key. Creating real Stripe Subscriptions.");
  console.log("   Only proceed if Tranche 0 insider sign-off is confirmed.");
  console.log("   Ctrl+C within 10 seconds to abort...");
  await new Promise((r) => setTimeout(r, 10000));
  console.log("   Proceeding.\n");
}

const stripe = new Stripe(stripeKey, { apiVersion: "2026-05-27.dahlia" });

let rows: SeedRow[];
try {
  rows = parseCSV(resolvedInput);
} catch (err) {
  console.error(`Failed to parse CSV: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

console.log(`Loaded ${rows.length} row(s).\n`);

// Ensure a CSL Membership product exists to attach price_data to.
// The Subscriptions API requires price_data.product (an existing Product ID)
// unlike Checkout Sessions which accept inline product_data.
let cslProductId: string;
if (!dryRun) {
  const existing = await stripe.products.search({ query: 'name:"CSL Membership" AND active:"true"', limit: 1 });
  if (existing.data.length > 0) {
    cslProductId = existing.data[0].id;
    console.log(`Using existing product: ${cslProductId} (${existing.data[0].name})\n`);
  } else {
    const product = await stripe.products.create(
      { name: "CSL Membership", metadata: { csl: "true" } },
      { idempotencyKey: "csl-membership-product" }
    );
    cslProductId = product.id;
    console.log(`Created product: ${cslProductId}\n`);
  }
} else {
  cslProductId = "prod_placeholder";
}

const results: ResultRow[] = [];
let created = 0, dryCount = 0, alreadyExists = 0, failed = 0;

for (const row of rows) {
  const amountPence   = Math.round(row.billing_amount_gbp * 100);
  const anchorUnix    = Math.floor(row.billing_cycle_anchor.getTime() / 1000);
  const anchorDisplay = row.billing_cycle_anchor.toISOString().split("T")[0];
  const planName      = derivePlanName(row.billing_interval, amountPence);
  const isOrphaned    = !row.wp_subscription_id;
  const memberType    = isOrphaned ? "orphaned" : "standard";
  const wpLabel       = isOrphaned ? "[ORPHANED — no WP subscription]" : `wp=${row.wp_subscription_id}`;
  const label         = `${row.email}  [cus=${row.stripe_customer_id}  ${wpLabel}]`;

  if (isOrphaned) {
    console.log(`  NOTE  ${label}`);
    console.log(`    Orphaned Stripe customer — paid via Stripe but no WordPress subscription record.`);
  }

  // Fetch live card details from Stripe (read-only — safe in both dry-run and execute)
  const liveCard = await fetchLiveCard(stripe, row.stripe_payment_method_id);
  const cardStatus = liveCard
    ? liveCard.isExpired    ? "expired"
    : liveCard.expiringSoon ? "expiring_soon"
    : "ok"
    : "unknown";

  if (liveCard) {
    const flag = cardStatus === "expired"       ? "  EXPIRED"
               : cardStatus === "expiring_soon" ? "  EXPIRING SOON"
               : "";
    console.log(`  CARD${flag}  ${row.email}  ${liveCard.brand} •••• ${liveCard.last4}  exp ${liveCard.expDisplay}`);
  } else {
    console.log(`  CARD UNKNOWN  ${row.email}  could not retrieve pm=${row.stripe_payment_method_id}`);
  }

  // Pre-flight duplicate check — if a non-cancelled subscription already exists
  // for this customer (from a previous run or manual creation) skip it.
  const existingSubs = await stripe.subscriptions.list({ customer: row.stripe_customer_id, limit: 5 });
  const activeSub = existingSubs.data.find(
    (s) => !["canceled", "incomplete_expired"].includes(s.status)
  );
  if (activeSub) {
    console.log(`  ALREADY EXISTS  ${label}`);
    console.log(`    existing sub : ${activeSub.id}  status=${activeSub.status}`);
    console.log();
    results.push({
      email: row.email, stripe_customer_id: row.stripe_customer_id,
      wp_subscription_id: row.wp_subscription_id, member_type: memberType, plan_name: planName,
      billing_amount_gbp: String(row.billing_amount_gbp), billing_interval: row.billing_interval,
      billing_cycle_anchor: anchorDisplay,
      card_brand: liveCard?.brand ?? "", card_last4: liveCard?.last4 ?? "",
      card_expiry: liveCard?.expDisplay ?? "", card_status: cardStatus,
      subscription_id: activeSub.id, status: "already_exists",
      error_message: `Subscription ${activeSub.id} already exists (status=${activeSub.status})`,
      notes: row.notes,
    });
    alreadyExists++;
    continue;
  }

  if (dryRun) {
    console.log(`  DRY RUN  ${label}`);
    console.log(`    plan_name        : ${planName}`);
    console.log(`    amount           : £${row.billing_amount_gbp}/${row.billing_interval}`);
    console.log(`    unit_amount      : ${amountPence}p`);
    console.log(`    billing_anchor   : ${anchorDisplay} (unix ${anchorUnix})`);
    console.log(`    proration        : none`);
    console.log(`    idempotency_key  : create-sub-${row.stripe_customer_id}`);
    console.log();
    results.push({
      email: row.email, stripe_customer_id: row.stripe_customer_id,
      wp_subscription_id: row.wp_subscription_id, member_type: memberType, plan_name: planName,
      billing_amount_gbp: String(row.billing_amount_gbp), billing_interval: row.billing_interval,
      billing_cycle_anchor: anchorDisplay,
      card_brand: liveCard?.brand ?? "", card_last4: liveCard?.last4 ?? "",
      card_expiry: liveCard?.expDisplay ?? "", card_status: cardStatus,
      subscription_id: "(dry-run)", status: "dry_run", error_message: "",
      notes: row.notes,
    });
    dryCount++;
    continue;
  }

  // Live creation
  try {
    const sub = await stripe.subscriptions.create(
      {
        customer:               row.stripe_customer_id,
        items: [{
          price_data: {
            currency:    "gbp",
            unit_amount: amountPence,
            recurring:   { interval: row.billing_interval },
            product:     cslProductId,
          },
        }],
        default_payment_method: row.stripe_payment_method_id,
        billing_cycle_anchor:   anchorUnix,
        proration_behavior:     "none",
        metadata: {
          // Use "ORPHANED" rather than empty string so the metadata is readable in Stripe Dashboard
          wp_subscription_id: row.wp_subscription_id || "ORPHANED",
          plan_name:          planName,
          migrated_at:        new Date().toISOString(),
        },
      },
      { idempotencyKey: `create-sub-${row.stripe_customer_id}` }
    );

    console.log(`  CREATED  ${label}`);
    console.log(`    subscription_id : ${sub.id}  status=${sub.status}`);
    console.log(`    anchor          : ${anchorDisplay}`);
    console.log();

    results.push({
      email: row.email, stripe_customer_id: row.stripe_customer_id,
      wp_subscription_id: row.wp_subscription_id, member_type: memberType, plan_name: planName,
      billing_amount_gbp: String(row.billing_amount_gbp), billing_interval: row.billing_interval,
      billing_cycle_anchor: anchorDisplay,
      card_brand: liveCard?.brand ?? "", card_last4: liveCard?.last4 ?? "",
      card_expiry: liveCard?.expDisplay ?? "", card_status: cardStatus,
      subscription_id: sub.id, status: "created", error_message: "",
      notes: row.notes,
    });
    created++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL  ${label}`);
    console.error(`    Error: ${msg}\n`);
    results.push({
      email: row.email, stripe_customer_id: row.stripe_customer_id,
      wp_subscription_id: row.wp_subscription_id, member_type: memberType, plan_name: planName,
      billing_amount_gbp: String(row.billing_amount_gbp), billing_interval: row.billing_interval,
      billing_cycle_anchor: anchorDisplay,
      card_brand: liveCard?.brand ?? "", card_last4: liveCard?.last4 ?? "",
      card_expiry: liveCard?.expDisplay ?? "", card_status: cardStatus,
      subscription_id: "", status: "error", error_message: msg,
      notes: row.notes,
    });
    failed++;
  }
}

const inputBase  = basename(resolvedInput, ".csv");
const outputPath = resolve(dirname(resolvedInput), `${inputBase}_results_${Date.now()}.csv`);
writeResultsCSV(results, outputPath);

console.log("=".repeat(60));
if (dryRun) console.log(`  Dry-run previewed : ${dryCount}`);
console.log(`  Created           : ${created}`);
console.log(`  Already existed   : ${alreadyExists}`);
console.log(`  Failed            : ${failed}`);
console.log(`  Results CSV       : ${outputPath}`);
console.log("=".repeat(60));

if (failed > 0) process.exit(1);

})();
