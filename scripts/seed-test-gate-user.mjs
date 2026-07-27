// One-off seed script for tests/portal-status-gate.spec.ts,
// tests/membership-ended.spec.ts, tests/payment-failed-banner.spec.ts.
//
// Creates THREE dedicated, non-admin test members — one per spec file, not
// one shared account. Playwright runs different spec files in separate
// parallel workers by default (no fullyParallel/workers override in
// playwright.config.ts), so a single shared account's `status` column gets
// raced by all three files simultaneously, producing intermittent failures
// that look like a real gate bug but are actually a test-isolation bug.
// Each file gets its own row so they can never collide, however Playwright
// schedules them.
//
// Idempotent — safe to re-run. Every run resets all passwords (there is no
// way to read a password back out of Supabase to confirm it's unchanged),
// so this script is the single source of truth for these credentials — it
// writes them directly into .env.test.local itself. Do not hand-copy
// printed values into that file; a manual copy step is exactly what caused
// these credentials to drift out of sync with the file in the past.
//
// Usage:
//   node scripts/seed-test-gate-user.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
// .env.test.local (falls back to .env.local if not found there).

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

function loadEnvFile(filename) {
  const filePath = path.resolve(filename);
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^﻿/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(".env.test.local");
loadEnvFile(".env.local");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Check .env.test.local or .env.local.");
  process.exit(1);
}

// One account per spec file — see the note above on why a shared account
// is unsafe under Playwright's default cross-file parallelism.
const ACCOUNTS = [
  { envVar: "PORTAL_GATE",         email: "csl-test-gate-1@celticsupporters.net", firstName: "Gate1" },
  { envVar: "MEMBERSHIP_ENDED",    email: "csl-test-gate-2@celticsupporters.net", firstName: "Gate2" },
  { envVar: "PAYMENT_BANNER",      email: "csl-test-gate-3@celticsupporters.net", firstName: "Gate3" },
  { envVar: "REJOIN_ROUTING",      email: "csl-test-gate-4@celticsupporters.net", firstName: "Gate4" },
  { envVar: "PENDING_CANCELLATION", email: "csl-test-gate-5@celticsupporters.net", firstName: "Gate5" },
];

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedOne({ email, firstName }) {
  const password = crypto.randomBytes(12).toString("base64url");

  const { data: existingList, error: listError } = await db.auth.admin.listUsers();
  if (listError) throw new Error(`auth.admin.listUsers failed: ${listError.message}`);

  const existingUser = existingList.users.find((u) => u.email === email);

  let userId;
  if (existingUser) {
    userId = existingUser.id;
    const { error: updateError } = await db.auth.admin.updateUserById(userId, { password });
    if (updateError) throw new Error(`auth.admin.updateUserById failed: ${updateError.message}`);
    console.log(`  Found existing auth user (${userId}) — password reset.`);
  } else {
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) throw new Error(`auth.admin.createUser failed: ${createError.message}`);
    userId = created.user.id;
    console.log(`  Created new auth user (${userId}).`);
  }

  const { data: existingMember } = await db
    .from("members")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  const memberFields = {
    email,
    user_id: userId,
    first_name: firstName,
    last_name: "Test",
    is_admin: false,
    is_lifetime: false,
    status: "active",
    membership_tier: "monthly",
    plan_name: "Monthly 10",
  };

  if (existingMember) {
    const { error: updateError } = await db.from("members").update(memberFields).eq("id", existingMember.id);
    if (updateError) throw new Error(`members update failed: ${updateError.message}`);
    console.log(`  Updated existing members row (${existingMember.id}).`);
  } else {
    const { error: insertError } = await db.from("members").insert(memberFields);
    if (insertError) throw new Error(`members insert failed: ${insertError.message}`);
    console.log("  Created new members row.");
  }

  return password;
}

// Replace or append KEY=value lines in .env.test.local, preserving every
// other line (comments, unrelated vars) exactly as-is.
function writeEnvValues(filename, values) {
  const filePath = path.resolve(filename);
  const raw = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf-8").replace(/^﻿/, "")
    : "";
  const lines = raw.length ? raw.split(/\r?\n/) : [];
  const remaining = new Map(Object.entries(values));

  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) return line;
    const key = trimmed.slice(0, eqIdx).trim();
    if (remaining.has(key)) {
      const value = remaining.get(key);
      remaining.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });

  for (const [key, value] of remaining) {
    updated.push(`${key}=${value}`);
  }

  fs.writeFileSync(filePath, updated.join("\n") + "\n", "utf-8");
}

async function main() {
  console.log(`Target Supabase project: ${SUPABASE_URL}\n`);

  const envValues = {};
  for (const account of ACCOUNTS) {
    console.log(`Seeding ${account.email} (${account.envVar})...`);
    const password = await seedOne(account);
    envValues[`TEST_GATE_${account.envVar}_EMAIL`] = account.email;
    envValues[`TEST_GATE_${account.envVar}_PASSWORD`] = password;
    console.log("");
  }

  writeEnvValues(".env.test.local", envValues);
  console.log(`Done. .env.test.local updated directly with ${Object.keys(envValues).length} values.`);
  console.log("Do not commit .env.test.local — it is gitignored, keep it that way.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  process.exit(1);
});
