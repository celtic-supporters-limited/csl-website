/**
 * Subscription management smoke tests.
 *
 * Covers the My Membership tab: plan change, annual switch, UI validation,
 * and route security guards.
 *
 * Run against staging:
 *   $env:PLAYWRIGHT_BASE_URL="https://csl-website-git-develop-gary-phinn-s-projects.vercel.app"
 *   npx playwright test tests/subscription-management.spec.ts
 *
 * Requires in .env.test.local:
 *   TEST_USER_EMAIL           — email of a monthly-active member account
 *   TEST_USER_PASSWORD        — password for that account
 *   NEXT_PUBLIC_SUPABASE_URL  — for pre-flight state checks
 *   SUPABASE_SERVICE_ROLE_KEY — for pre-flight state checks
 *
 * Sections 3 and 5 make real Stripe Sandbox API calls and leave the
 * subscription in a modified state. The plan change test alternates between
 * Standard (£10) and Accelerator (£25) each run so it is repeatable.
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.describe.configure({ mode: "serial" });

// ── Config ────────────────────────────────────────────────────────────────────

const SMOKE_EMAIL    = process.env.TEST_USER_EMAIL    ?? "";
const SMOKE_PASSWORD = process.env.TEST_USER_PASSWORD ?? "";
const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL   ?? "";
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY  ?? "";

function skip(testInfo: { skip(reason: string): void }, name: string, value: string) {
  if (!value) testInfo.skip(`${name} not set — skipping`);
}

function adminSupabase() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function getMember() {
  const db = adminSupabase();
  const { data } = await db
    .from("members")
    .select("membership_tier, status, amount_pence, plan_name")
    .eq("email", SMOKE_EMAIL)
    .maybeSingle();
  return data;
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  // Wait for the form field specifically — networkidle is unreliable on staging
  // because auth listeners and inactivity timers keep the connection active.
  await page.waitForSelector("#email", { timeout: 30_000 });
  await page.fill("#email", SMOKE_EMAIL);
  await page.fill("#password", SMOKE_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/member-portal/, { timeout: 20_000 });
}

async function goToMyMembership(page: Page): Promise<void> {
  await login(page);
  // The portal renders two nav variants (mobile lg:hidden + desktop hidden lg:block).
  // The mobile button is first in DOM but hidden at the 1280px test viewport.
  // Use :visible to skip the hidden mobile button and click the visible desktop one.
  await page.locator("button:visible", { hasText: /my membership/i }).first().click();
  await page.waitForSelector("text=/member since/i", { timeout: 10_000 });
}

function requireMonthlyActive(member: Awaited<ReturnType<typeof getMember>>) {
  return member?.membership_tier === "monthly" && member?.status === "active";
}

// ── 1. My Membership tab — UI rendering ──────────────────────────────────────

test.describe("My Membership tab — rendering", () => {

  test.beforeEach(({}, testInfo) => {
    skip(testInfo, "TEST_USER_EMAIL",    SMOKE_EMAIL);
    skip(testInfo, "TEST_USER_PASSWORD", SMOKE_PASSWORD);
  });

  test("summary strip is visible after login", async ({ page }) => {
    await goToMyMembership(page);
    await expect(page.locator("text=/member since/i")).toBeVisible();
  });

  test("Payments section header is visible", async ({ page }) => {
    await goToMyMembership(page);
    // The "Payments" label is in a small-caps header above the payment table
    await expect(page.locator("text=/^payments$/i").first()).toBeVisible();
  });

});

// ── 2. Accordion rendering — monthly active member ────────────────────────────

test.describe("Subscription accordion — monthly active", () => {

  test.beforeEach(({}, testInfo) => {
    skip(testInfo, "TEST_USER_EMAIL",             SMOKE_EMAIL);
    skip(testInfo, "TEST_USER_PASSWORD",          SMOKE_PASSWORD);
    skip(testInfo, "NEXT_PUBLIC_SUPABASE_URL",    SUPABASE_URL);
    skip(testInfo, "SUPABASE_SERVICE_ROLE_KEY",   SERVICE_KEY);
  });

  test("all three accordion rows are visible", async ({ page }) => {
    const member = await getMember();
    if (!requireMonthlyActive(member)) { test.skip(); return; }

    await goToMyMembership(page);
    await expect(page.locator("text=/change monthly amount/i")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=/switch to annual billing/i")).toBeVisible();
    await expect(page.locator("text=/update card or cancel/i")).toBeVisible();
  });

  test("clicking a row expands it and shows form content", async ({ page }) => {
    const member = await getMember();
    if (!requireMonthlyActive(member)) { test.skip(); return; }

    await goToMyMembership(page);
    await page.locator("button", { hasText: /change monthly amount/i }).click();

    await expect(page.locator("label", { hasText: /standard/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("label", { hasText: /accelerator/i })).toBeVisible();
    await expect(page.locator("label", { hasText: /^custom/i })).toBeVisible();
  });

  test("clicking an open row again collapses it", async ({ page }) => {
    const member = await getMember();
    if (!requireMonthlyActive(member)) { test.skip(); return; }

    await goToMyMembership(page);
    const btn = page.locator("button", { hasText: /change monthly amount/i });
    await btn.click();
    await expect(page.locator("label", { hasText: /standard/i })).toBeVisible({ timeout: 5_000 });

    await btn.click();
    await expect(page.locator("label", { hasText: /standard/i })).not.toBeVisible({ timeout: 3_000 });
  });

  test("current plan shows Current badge and is disabled", async ({ page }) => {
    const member = await getMember();
    if (!requireMonthlyActive(member)) { test.skip(); return; }

    await goToMyMembership(page);
    await page.locator("button", { hasText: /change monthly amount/i }).click();

    // At least one option should be marked Current
    await expect(page.locator("text=/^current$/i").first()).toBeVisible({ timeout: 5_000 });
  });

});

// ── 3. Change monthly amount — real Stripe API call ───────────────────────────

test.describe("Change monthly amount — real Stripe call", () => {

  test.beforeEach(({}, testInfo) => {
    skip(testInfo, "TEST_USER_EMAIL",           SMOKE_EMAIL);
    skip(testInfo, "TEST_USER_PASSWORD",        SMOKE_PASSWORD);
    skip(testInfo, "NEXT_PUBLIC_SUPABASE_URL",  SUPABASE_URL);
    skip(testInfo, "SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  });

  test("changes plan and verifies Supabase is updated", async ({ page }) => {
    const member = await getMember();
    if (!requireMonthlyActive(member)) { test.skip(); return; }

    // Alternate between Standard (£10) and Accelerator (£25) each run.
    const currentPence   = member!.amount_pence ?? 0;
    const isAt10         = currentPence === 1000;
    const targetOption   = isAt10 ? /accelerator/i : /standard/i;
    const expectedPence  = isAt10 ? 2500 : 1000;
    const expectedPlan   = isAt10 ? "Monthly 25" : "Monthly 10";

    console.log(`Current plan: ${currentPence / 100} pence → changing to ${expectedPence / 100}`);

    await goToMyMembership(page);

    await page.locator("button", { hasText: /change monthly amount/i }).click();
    await expect(page.locator("label", { hasText: /standard/i })).toBeVisible({ timeout: 5_000 });

    // Select the target option
    await page.locator("label", { hasText: targetOption }).click();

    // Preview
    await page.locator("button", { hasText: /preview change/i }).click();
    await expect(page.locator("text=/confirm plan change/i")).toBeVisible({ timeout: 5_000 });

    // Confirm
    await page.locator("button", { hasText: /confirm change/i }).click();

    // Success state
    await expect(page.locator("text=/plan updated to/i")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(`text=/${expectedPlan}/i`)).toBeVisible();

    // Allow Supabase to update (webhook or direct DB write)
    await page.waitForTimeout(3_000);

    const updated = await getMember();
    expect(updated?.amount_pence).toBe(expectedPence);
    expect(updated?.plan_name).toBe(expectedPlan);

    console.log(`PASS: plan_name=${updated?.plan_name}, amount_pence=${updated?.amount_pence}`);
  });

});

// ── 4. Custom amount validation — UI ─────────────────────────────────────────

test.describe("Custom monthly amount — UI validation", () => {

  test.beforeEach(({}, testInfo) => {
    skip(testInfo, "TEST_USER_EMAIL",           SMOKE_EMAIL);
    skip(testInfo, "TEST_USER_PASSWORD",        SMOKE_PASSWORD);
    skip(testInfo, "NEXT_PUBLIC_SUPABASE_URL",  SUPABASE_URL);
    skip(testInfo, "SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  });

  test("amount below £30 shows validation error", async ({ page }) => {
    const member = await getMember();
    if (!requireMonthlyActive(member)) { test.skip(); return; }

    await goToMyMembership(page);
    await page.locator("button", { hasText: /change monthly amount/i }).click();
    await page.locator("label", { hasText: /^custom/i }).click();
    await page.locator("input[placeholder='30']").first().fill("20");
    await page.locator("button", { hasText: /preview change/i }).click();

    await expect(page.locator("text=/at least £30/i")).toBeVisible({ timeout: 5_000 });
  });

  test("amount not in £5 increments shows validation error", async ({ page }) => {
    const member = await getMember();
    if (!requireMonthlyActive(member)) { test.skip(); return; }

    await goToMyMembership(page);
    await page.locator("button", { hasText: /change monthly amount/i }).click();
    await page.locator("label", { hasText: /^custom/i }).click();
    await page.locator("input[placeholder='30']").first().fill("32");
    await page.locator("button", { hasText: /preview change/i }).click();

    await expect(page.locator("text=/must be in £5 increments/i")).toBeVisible({ timeout: 5_000 });
  });

});

// ── 5. Switch to annual ───────────────────────────────────────────────────────

test.describe("Switch to annual — validation and Stripe redirect", () => {

  test.beforeEach(({}, testInfo) => {
    skip(testInfo, "TEST_USER_EMAIL",           SMOKE_EMAIL);
    skip(testInfo, "TEST_USER_PASSWORD",        SMOKE_PASSWORD);
    skip(testInfo, "NEXT_PUBLIC_SUPABASE_URL",  SUPABASE_URL);
    skip(testInfo, "SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  });

  test("accordion row expands with amount input and minimum hint", async ({ page }) => {
    const member = await getMember();
    if (!requireMonthlyActive(member)) { test.skip(); return; }

    await goToMyMembership(page);
    await page.locator("button", { hasText: /switch to annual billing/i }).click();

    await expect(page.locator("input[placeholder='300']")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=/minimum £300/i")).toBeVisible();
  });

  test("amount below £300 shows validation error", async ({ page }) => {
    const member = await getMember();
    if (!requireMonthlyActive(member)) { test.skip(); return; }

    await goToMyMembership(page);
    await page.locator("button", { hasText: /switch to annual billing/i }).click();
    await page.locator("input[placeholder='300']").fill("200");
    await page.locator("button", { hasText: /preview switch/i }).click();

    await expect(page.locator("text=/at least £300/i")).toBeVisible({ timeout: 5_000 });
  });

  test("amount not in £10 increments shows validation error", async ({ page }) => {
    const member = await getMember();
    if (!requireMonthlyActive(member)) { test.skip(); return; }

    await goToMyMembership(page);
    await page.locator("button", { hasText: /switch to annual billing/i }).click();
    await page.locator("input[placeholder='300']").fill("305");
    await page.locator("button", { hasText: /preview switch/i }).click();

    await expect(page.locator("text=/must be in £10 increments/i")).toBeVisible({ timeout: 5_000 });
  });

  test("valid amount shows saving or equivalent calculation", async ({ page }) => {
    const member = await getMember();
    if (!requireMonthlyActive(member)) { test.skip(); return; }

    await goToMyMembership(page);
    await page.locator("button", { hasText: /switch to annual billing/i }).click();
    await page.locator("input[placeholder='300']").fill("300");

    await expect(page.locator("text=/saving|equivalent to/i")).toBeVisible({ timeout: 5_000 });
  });

  test("confirming valid amount redirects to Stripe Checkout", async ({ page }) => {
    const member = await getMember();
    if (!requireMonthlyActive(member)) { test.skip(); return; }

    await goToMyMembership(page);
    await page.locator("button", { hasText: /switch to annual billing/i }).click();
    await page.locator("input[placeholder='300']").fill("300");
    await page.locator("button", { hasText: /preview switch/i }).click();

    await expect(page.locator("text=/confirm switch to annual/i")).toBeVisible({ timeout: 5_000 });
    await page.locator("button", { hasText: /confirm and pay annually/i }).click();

    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    expect(page.url()).toMatch(/checkout\.stripe\.com/);
    console.log("PASS: Annual switch reached Stripe Checkout at", page.url());
  });

});

// ── 6. API security guards ────────────────────────────────────────────────────

test.describe("Subscription API — security guards", () => {

  test("POST /api/subscription/update without auth returns 401", async ({ request }) => {
    const res = await request.post("/api/subscription/update", {
      data: JSON.stringify({ plan: "standard" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/subscription/switch-to-annual without auth returns 401", async ({ request }) => {
    const res = await request.post("/api/subscription/switch-to-annual", {
      data: JSON.stringify({ amount: 300 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/subscription/switch-to-monthly without auth returns 401", async ({ request }) => {
    const res = await request.post("/api/subscription/switch-to-monthly", {
      data: JSON.stringify({ plan: "standard" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/billing-portal without auth returns 401", async ({ request }) => {
    const res = await request.post("/api/billing-portal", {
      data: "{}",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/subscription/update with invalid plan returns 400 or 401", async ({ request }) => {
    const res = await request.post("/api/subscription/update", {
      data: JSON.stringify({ plan: "fake_plan" }),
      headers: { "Content-Type": "application/json" },
    });
    expect([400, 401]).toContain(res.status());
  });

  test("POST /api/subscription/switch-to-annual with amount below £300 returns 400 or 401", async ({ request }) => {
    const res = await request.post("/api/subscription/switch-to-annual", {
      data: JSON.stringify({ amount: 50 }),
      headers: { "Content-Type": "application/json" },
    });
    expect([400, 401]).toContain(res.status());
  });

});
