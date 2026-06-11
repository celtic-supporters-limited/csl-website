#!/usr/bin/env node
/**
 * scripts/create-auth-users.ts
 *
 * Creates Supabase auth.users records for migrated members who have a row in
 * the members table but no user_id (i.e. no login account yet).
 *
 * Behaviour:
 *   - Reads members WHERE user_id IS NULL AND status = 'active'
 *   - For each, calls supabase.auth.admin.createUser({ email, email_confirm: true })
 *     → no password set; member uses "Forgot password" on first login to set one
 *   - Updates members.user_id with the resulting auth user id
 *   - Skips any member whose email already exists in auth.users (safe to re-run)
 *   - Dry-run ON by default — pass --execute to write to Supabase
 *
 * Run AFTER migrate-members.ts has populated the members table.
 *
 * Usage (dry-run — safe at any time):
 *   npx tsx scripts/create-auth-users.ts
 *
 * Usage (actually create auth records):
 *   npx tsx scripts/create-auth-users.ts --execute
 *
 * Env vars (loaded from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   — admin operations require service role
 */

import { readFileSync } from "fs";
import { resolve } from "path";
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

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();

void (async () => {

const args    = process.argv.slice(2);
const dryRun  = !args.includes("--execute");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!supabaseUrl || !serviceKey) {
  console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Use the Stripe key (if present) to determine test mode for member_events.is_test
const isTestMode = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");

console.log("=".repeat(60));
console.log("CSL — Create Auth Users for Migrated Members");
console.log("=".repeat(60));
console.log(`Supabase    : ${supabaseUrl}`);
console.log(`Dry run     : ${dryRun ? "YES (pass --execute to create auth records)" : "NO — auth records will be created"}`);
console.log();

// Fetch members without a user_id
const { data: members, error: fetchError } = await db
  .from("members")
  .select("id, email, first_name, last_name, status")
  .is("user_id", null)
  .eq("status", "active")
  .order("created_at", { ascending: true });

if (fetchError) {
  console.error(`Failed to fetch members: ${fetchError.message}`);
  process.exit(1);
}

if (!members || members.length === 0) {
  console.log("No members found with user_id = NULL and status = active. Nothing to do.");
  process.exit(0);
}

console.log(`Found ${members.length} member(s) without an auth account.\n`);

let created = 0, skipped = 0, failed = 0;

for (const member of members) {
  const displayName = [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email;
  const label = `${member.email}  [members.id=${member.id}]`;

  if (dryRun) {
    console.log(`  DRY RUN  ${label}`);
    console.log(`    Would call: auth.admin.createUser({ email: "${member.email}", email_confirm: true })`);
    console.log(`    Then:       UPDATE members SET user_id = <new_auth_id> WHERE id = '${member.id}'`);
    console.log();
    skipped++;
    continue;
  }

  // Check if an auth user already exists for this email (safe re-run guard)
  const { data: existing } = await db.auth.admin.listUsers();
  const alreadyExists = existing?.users?.find(
    (u) => u.email?.toLowerCase() === member.email.toLowerCase()
  );

  if (alreadyExists) {
    // Auth user exists but members.user_id is not set — just backfill the link
    const { error: linkError } = await db
      .from("members")
      .update({ user_id: alreadyExists.id })
      .eq("id", member.id);

    if (linkError) {
      console.error(`  FAIL (link)  ${label}: ${linkError.message}`);
      failed++;
    } else {
      console.log(`  LINKED   ${label}`);
      console.log(`    auth user already existed — backfilled user_id=${alreadyExists.id}`);
      console.log();
      created++;
    }
    continue;
  }

  // Create the auth user — no password; member sets one via "Forgot password"
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email:          member.email,
    email_confirm:  true, // skip confirmation email — they're already verified members
    user_metadata:  {
      first_name: member.first_name ?? "",
      last_name:  member.last_name ?? "",
    },
  });

  if (authError) {
    console.error(`  FAIL  ${label}`);
    console.error(`    ${authError.message}`);
    console.log();
    failed++;
    continue;
  }

  const authUserId = authData.user.id;

  // Link the auth user back to the members row
  const { error: updateError } = await db
    .from("members")
    .update({ user_id: authUserId })
    .eq("id", member.id);

  if (updateError) {
    // Auth user was created but link failed — log clearly so it can be fixed manually
    console.error(`  WARN  ${label}`);
    console.error(`    Auth user created (${authUserId}) but failed to set user_id: ${updateError.message}`);
    console.error(`    Fix manually: UPDATE members SET user_id='${authUserId}' WHERE id='${member.id}'`);
    console.log();
    failed++;
    continue;
  }

  // Log auth creation event — visible in admin member timeline
  await db.from("member_events").insert({
    member_id:   member.id,
    event_type:  "auth.account_created",
    event_email: member.email,
    is_test:     isTestMode,
    detail: {
      auth_user_id: authUserId,
      note: "Auth account created during member migration. No password set — member uses Forgot Password on first login.",
    },
  });

  console.log(`  CREATED  ${displayName}  <${member.email}>`);
  console.log(`    auth user_id : ${authUserId}`);
  console.log(`    members.id   : ${member.id}`);
  console.log(`    next step    : member uses "Forgot password" on first login`);
  console.log();
  created++;
}

console.log("=".repeat(60));
if (dryRun) {
  console.log(`  Would create : ${skipped} auth record(s)`);
} else {
  console.log(`  Created      : ${created}`);
  console.log(`  Failed       : ${failed}`);
}
console.log("=".repeat(60));

if (!dryRun && created > 0) {
  console.log();
  console.log("Next step: send members a welcome / login invitation email");
  console.log("  They should use 'Forgot password' at /login to set their password.");
  console.log("  Once set, they can access the Member Portal immediately.");
}

if (failed > 0) process.exit(1);

})();
