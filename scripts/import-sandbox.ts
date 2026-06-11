#!/usr/bin/env node
/**
 * scripts/import-sandbox.ts
 *
 * Reads an obfuscated member CSV and creates matching test customers +
 * subscriptions in the Stripe Sandbox. Used to build realistic test data
 * for verifying the migration script before touching the live account.
 *
 * Required: STRIPE_SECRET_KEY must start with sk_test_ (hard-checked).
 *
 * Expected CSV columns (auto-detected by header name, case-insensitive):
 *   email    — header contains "email"
 *   name     — header contains "name" (or first/last combination)
 *   amount   — header contains "amount", "price", or "sum"
 *              value: integer (pence) or decimal (GBP, e.g. "25.00")
 *   interval — header contains "interval", "period", "billing", or "frequency"
 *              value: "month"/"monthly" or "year"/"annual"/"yearly"
 *   status   — header contains "status" (rows where status != "active" are skipped)
 *
 * If a column cannot be auto-detected, override with flags:
 *   --email-col "Email Address"  --amount-col "Monthly Amount" etc.
 *
 * Usage:
 *   npx tsx scripts/import-sandbox.ts --input obfuscated.csv [--limit 5] [--dry-run]
 *
 * Env vars (loaded from .env.local if present):
 *   STRIPE_SECRET_KEY   — must be a test key
 */

import { readFileSync } from "fs";
import { resolve } from "path";
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
  } catch { /* absent — rely on process.env */ }
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSV(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(field); field = "";
      } else {
        field += ch;
      }
      i++;
    }
    fields.push(field);
    return fields;
  };

  const headers = parseRow(nonEmpty[0]).map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((line) => {
    const values = parseRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()]));
  });
  return { headers, rows };
}

// ── Column detection ──────────────────────────────────────────────────────────

function findCol(headers: string[], patterns: string[], override?: string): string | null {
  if (override) return headers.find((h) => h === override) ?? null;
  const h = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, "");
  return headers.find((hdr) => patterns.some((p) => h(hdr).includes(p))) ?? null;
}

// ── Plan derivation ───────────────────────────────────────────────────────────

function derivePlanName(interval: "month" | "year", amountPence: number): string {
  if (interval === "year") return `Annual ${Math.round(amountPence / 100)}`;
  if (amountPence === 1000) return "Monthly 10";
  if (amountPence === 2500) return "Monthly 25";
  return `Monthly ${Math.round(amountPence / 100)}`;
}

function normaliseInterval(raw: string): "month" | "year" | null {
  const v = raw.toLowerCase().trim();
  if (["month", "monthly", "mo"].includes(v)) return "month";
  if (["year", "annual", "annually", "yearly", "yr"].includes(v)) return "year";
  return null;
}

function parseAmountPence(raw: string): number | null {
  const cleaned = raw.replace(/[£$,\s]/g, "");
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  // If it has a decimal point it's GBP — convert to pence
  return cleaned.includes(".") ? Math.round(num * 100) : Math.round(num);
}

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; };
const hasFlag = (name: string) => args.includes(name);

const inputPath = flag("--input");
const limitArg  = flag("--limit");
const dryRun    = hasFlag("--dry-run");

if (!inputPath) {
  console.error("Usage: npx tsx scripts/import-sandbox.ts --input <obfuscated.csv> [--limit N] [--dry-run]");
  process.exit(1);
}

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key) { console.error("Error: STRIPE_SECRET_KEY is not set."); process.exit(1); }
if (!key.startsWith("sk_test_")) {
  console.error("Error: STRIPE_SECRET_KEY must be a test key (sk_test_...). This script must not run against the live account.");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });

const raw = readFileSync(resolve(process.cwd(), inputPath), "utf-8");
const { headers, rows } = parseCSV(raw);

// Column mapping
const emailCol    = findCol(headers, ["email"],                    flag("--email-col"));
const nameCol     = findCol(headers, ["name"],                     flag("--name-col"));
const amountCol   = findCol(headers, ["amount", "price", "sum"],   flag("--amount-col"));
const intervalCol = findCol(headers, ["interval", "period", "billing", "frequency"], flag("--interval-col"));
const statusCol   = findCol(headers, ["status"],                   flag("--status-col"));

const missing = [
  !emailCol    && "email",
  !amountCol   && "amount",
  !intervalCol && "interval",
].filter(Boolean);

if (missing.length > 0) {
  console.error(`Cannot detect columns for: ${missing.join(", ")}`);
  console.error(`Headers found: ${headers.join(", ")}`);
  console.error(`Use --email-col, --amount-col, --interval-col flags to specify column names.`);
  process.exit(1);
}

console.log(`Column mapping:`);
console.log(`  email    → "${emailCol}"`);
console.log(`  name     → ${nameCol ? `"${nameCol}"` : "(none — will use email prefix)"}`);
console.log(`  amount   → "${amountCol}"`);
console.log(`  interval → "${intervalCol}"`);
console.log(`  status   → ${statusCol ? `"${statusCol}"` : "(none — all rows processed)"}`);
console.log();

if (dryRun) console.log("DRY RUN — no Stripe API calls will be made.\n");

const limit = limitArg ? parseInt(limitArg, 10) : Infinity;
let processed = 0, skipped = 0, failed = 0;

for (const row of rows) {
  if (processed >= limit) break;

  const email    = row[emailCol!]?.toLowerCase();
  const name     = nameCol ? row[nameCol] : email?.split("@")[0] ?? "Unknown";
  const amountRaw = row[amountCol!];
  const intervalRaw = row[intervalCol!];
  const status   = statusCol ? row[statusCol] : "active";

  if (!email) { skipped++; continue; }
  if (status && !["active", ""].includes(status.toLowerCase())) {
    console.log(`  SKIP  ${email} (status: ${status})`);
    skipped++;
    continue;
  }

  const amountPence = parseAmountPence(amountRaw);
  const interval    = normaliseInterval(intervalRaw);

  if (!amountPence || !interval) {
    console.warn(`  SKIP  ${email} — could not parse amount "${amountRaw}" or interval "${intervalRaw}"`);
    skipped++;
    continue;
  }

  const planName = derivePlanName(interval, amountPence);
  const display  = `${email}  ${planName}  £${(amountPence / 100).toFixed(2)}/${interval}`;

  if (dryRun) {
    console.log(`  WOULD CREATE  ${display}`);
    processed++;
    continue;
  }

  try {
    // Create customer
    const customer = await stripe.customers.create({ email, name });

    // Attach test Visa card
    const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } } as Parameters<typeof stripe.paymentMethods.create>[0]);
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });

    // Create subscription
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{
        price_data: {
          currency: "gbp",
          unit_amount: amountPence,
          recurring: { interval },
          product_data: { name: planName },
        },
      }],
      default_payment_method: pm.id,
    });

    console.log(`  OK    ${display}  cus=${customer.id}  sub=${sub.id}`);
    processed++;

    // Brief pause to stay well within Stripe rate limits
    await new Promise((r) => setTimeout(r, 300));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL  ${email} — ${msg}`);
    failed++;
  }
}

console.log();
console.log(`Done: ${processed} created, ${skipped} skipped, ${failed} failed`);
if (dryRun) console.log("(dry-run — nothing written to Stripe)");
