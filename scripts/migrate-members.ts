#!/usr/bin/env node
/**
 * scripts/migrate-members.ts
 *
 * Reads all active Stripe subscriptions and upserts matching rows into the
 * Supabase members table. Idempotent — safe to run multiple times.
 *
 * Behaviour:
 *   New member (no existing row)   → INSERT with all Stripe-derived fields
 *   Existing member (row found)    → UPDATE only Stripe-managed fields
 *                                    (does not overwrite profile data the
 *                                    member has set themselves)
 *   Lifetime members               → not handled here; create manually in
 *                                    Supabase per CLAUDE.md §8.4
 *
 * Verification workflow:
 *   1. Run import-sandbox.ts to seed Stripe Sandbox with obfuscated test data
 *   2. Run this script with --dry-run against the sandbox to preview output
 *   3. Run without --dry-run against sandbox + staging Supabase to verify rows
 *   4. Once satisfied, run with live STRIPE_SECRET_KEY + production Supabase
 *
 * Usage:
 *   npx tsx scripts/migrate-members.ts [--dry-run] [--limit N]
 *
 * Flags:
 *   --dry-run   Print each action without writing to Supabase
 *   --limit N   Process at most N subscriptions (useful for spot-checking)
 *
 * Env vars (loaded from .env.local if present):
 *   STRIPE_SECRET_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

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

// ── Plan derivation (mirrors webhook derivePlanName) ─────────────────────────

function derivePlanName(interval: string, amountPence: number): string {
  if (interval === "year") return `Annual ${Math.round(amountPence / 100)}`;
  if (amountPence === 1000) return "Monthly 10";
  if (amountPence === 2500) return "Monthly 25";
  return `Monthly ${Math.round(amountPence / 100)}`;
}

function deriveTier(interval: string): "monthly" | "annual" {
  return interval === "year" ? "annual" : "monthly";
}

// ── Stripe pagination helper ──────────────────────────────────────────────────

async function listAllSubscriptions(stripe: Stripe): Promise<Stripe.Subscription[]> {
  const all: Stripe.Subscription[] = [];
  let page = await stripe.subscriptions.list({
    status: "active",
    limit: 100,
    expand: ["data.customer", "data.default_payment_method"],
  });
  all.push(...page.data);
  while (page.has_more) {
    page = await stripe.subscriptions.list({
      status: "active",
      limit: 100,
      starting_after: page.data[page.data.length - 1].id,
      expand: ["data.customer", "data.default_payment_method"],
    });
    all.push(...page.data);
  }
  return all;
}

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();

void (async () => {

const args    = process.argv.slice(2);
const dryRun  = args.includes("--dry-run");
const limitArg = (() => { const i = args.indexOf("--limit"); return i !== -1 ? parseInt(args[i + 1], 10) : Infinity; })();

const stripeKey  = process.env.STRIPE_SECRET_KEY ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const missingVars = [
  !stripeKey   && "STRIPE_SECRET_KEY",
  !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
  !serviceKey  && "SUPABASE_SERVICE_ROLE_KEY",
].filter(Boolean);

if (missingVars.length > 0) {
  console.error(`Missing env vars: ${missingVars.join(", ")}`);
  process.exit(1);
}

const isTestMode = stripeKey.startsWith("sk_test_");
console.log(`Stripe mode : ${isTestMode ? "TEST (sandbox)" : "LIVE"}`);
console.log(`Supabase    : ${supabaseUrl}`);
console.log(`Dry run     : ${dryRun}`);
console.log();

if (!isTestMode && dryRun === false) {
  console.log("Running against LIVE Stripe + production Supabase.");
  console.log("You have 5 seconds to abort with Ctrl+C...");
  await new Promise((r) => setTimeout(r, 5000));
}

const stripe = new Stripe(stripeKey, { apiVersion: "2026-05-27.dahlia" });
const db = createClient(supabaseUrl, serviceKey);

// ── Migration event logger ────────────────────────────────────────────────────
// Writes to member_events so volunteers can see when each member was migrated.
// Uses stripe_event_id = 'migration-{sub.id}' — the unique constraint means
// re-running this script never creates duplicate events.

async function logMigrationEvent(memberId: string, sub: Stripe.Subscription, email: string): Promise<void> {
  const item     = sub.items.data[0];
  const price    = item?.price;
  const wpSubId  = sub.metadata?.wp_subscription_id ?? null;
  const isTest   = stripeKey.startsWith("sk_test_");

  const { error } = await db.from("member_events").insert({
    member_id:      memberId,
    event_type:     "subscription.migrated",
    event_email:    email,
    stripe_event_id: `migration-${sub.id}`,
    is_test:        isTest,
    detail: {
      subscription_id:      sub.id,
      stripe_customer_id:   typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      plan_name:            sub.metadata?.plan_name ?? null,
      amount_pence:         price?.unit_amount ?? null,
      billing_interval:     price?.recurring?.interval ?? null,
      billing_cycle_anchor: sub.billing_cycle_anchor
        ? new Date(sub.billing_cycle_anchor * 1000).toISOString()
        : null,
      wp_subscription_id:   wpSubId,
      migrated_at:          sub.metadata?.migrated_at ?? new Date().toISOString(),
    },
  });

  if (error) {
    // 23505 = unique_violation — event already logged on a previous run; silently skip
    if (error.code === "23505") return;
    console.warn(`  WARN  could not log migration event for ${email}: ${error.message}`);
  }
}

console.log("Fetching active subscriptions from Stripe...");
const subscriptions = await listAllSubscriptions(stripe);
console.log(`Found ${subscriptions.length} active subscriptions.\n`);

let inserted = 0, updated = 0, skipped = 0, failed = 0;
const toProcess = subscriptions.slice(0, limitArg);

for (const sub of toProcess) {
  const customer = sub.customer as Stripe.Customer;

  // Skip deleted customers
  if (customer.deleted) { skipped++; continue; }

  const email = customer.email?.toLowerCase();
  if (!email) {
    console.warn(`  SKIP  sub=${sub.id} — customer has no email`);
    skipped++;
    continue;
  }

  // Get amount + interval from first subscription item
  const item = sub.items.data[0];
  const price = item?.price;
  if (!price || !price.unit_amount || !price.recurring) {
    console.warn(`  SKIP  ${email} — no unit_amount or recurring on price`);
    skipped++;
    continue;
  }

  const amountPence = price.unit_amount;
  const interval    = price.recurring.interval; // "month" | "year" | "week" | "day"
  const tier        = deriveTier(interval);
  const planName    = derivePlanName(interval, amountPence);

  const label = `${email}  ${planName}  £${(amountPence / 100).toFixed(2)}/${interval}`;

  if (dryRun) {
    console.log(`  PREVIEW  ${label}  cus=${customer.id}`);
    continue;
  }

  try {
    // Check if member already exists (by stripe_customer_id)
    const { data: existing } = await db
      .from("members")
      .select("id, email")
      .eq("stripe_customer_id", customer.id)
      .maybeSingle();

    if (existing) {
      // Update only Stripe-managed fields — never overwrite profile data
      const { error } = await db
        .from("members")
        .update({
          stripe_subscription_id: sub.id,
          membership_tier:        tier,
          plan_name:              planName,
          amount_pence:           amountPence,
          status:                 "active",
        })
        .eq("stripe_customer_id", customer.id);

      if (error) throw new Error(error.message);
      console.log(`  UPDATE  ${label}  id=${existing.id}`);
      updated++;
    } else {
      // New member — full insert; return the new row so we can log the migration event
      const { data: inserted_row, error } = await db.from("members").insert({
        email,
        name:                   customer.name ?? null,
        stripe_customer_id:     customer.id,
        stripe_subscription_id: sub.id,
        membership_tier:        tier,
        plan_name:              planName,
        amount_pence:           amountPence,
        status:                 "active",
        created_at:             new Date(sub.created * 1000).toISOString(),
      }).select("id").single();

      if (error) {
        // Email unique constraint — member exists under a different stripe_customer_id
        if (error.code === "23505") {
          console.warn(`  WARN  ${email} — email already exists with different customer ID; skipping`);
          skipped++;
          continue;
        }
        throw new Error(error.message);
      }

      // Log migration event — visible in admin member timeline
      await logMigrationEvent(inserted_row.id, sub, email);

      // Log expired card event if the card on file was expired at migration time.
      // Only applies to migrated subscriptions (metadata.migrated_at set by create-subscriptions.ts).
      // Volunteers use this to identify members who need to update their payment method.
      if (sub.metadata?.migrated_at) {
        const pm = sub.default_payment_method as { card?: { brand: string; last4: string; exp_month: number; exp_year: number } } | null;
        if (pm?.card) {
          const { brand, last4, exp_month, exp_year } = pm.card;
          const now = new Date();
          const isExpired = new Date(exp_year, exp_month - 1, 1) < new Date(now.getFullYear(), now.getMonth(), 1);
          if (isExpired) {
            const expDisplay = `${String(exp_month).padStart(2, "0")}/${exp_year}`;
            await db.from("member_events").insert({
              member_id:       inserted_row.id,
              event_type:      "card.expired",
              event_email:     email,
              stripe_event_id: `card-expired-migration-${sub.id}`,
              is_test:         isTestMode,
              detail: {
                card_brand:      brand,
                card_last4:      last4,
                card_expiry:     expDisplay,
                subscription_id: sub.id,
                note:            "Card was expired at point of subscription migration — member must update payment method on first portal login.",
              },
            });
            console.log(`  CARD EXPIRED  ${email}  ${brand} •••• ${last4}  exp ${expDisplay} — event logged`);
          }
        }
      }

      console.log(`  INSERT  ${label}  cus=${customer.id}`);
      inserted++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL  ${email} — ${msg}`);
    failed++;
  }
}

console.log();
console.log(`Done: ${inserted} inserted, ${updated} updated, ${skipped} skipped, ${failed} failed`);
if (dryRun) console.log("(dry-run — nothing written to Supabase)");
if (!isTestMode && !dryRun) console.log("Production migration complete.");

})();
