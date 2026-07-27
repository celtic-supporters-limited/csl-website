/**
 * Portal status gate — app/member-portal/layout.tsx.
 *
 * Covers the non-webhook half of cancellation handling (PR after 2026-07-22
 * requirements review — see .claude/NOTES.md "Cancellation handling"):
 *   - cancelled member -> redirected to /membership-ended
 *   - payment_failed member -> full access retained, no redirect
 *   - admin bypass evaluated BEFORE the status gate, for both statuses
 *     (same ordering bug shape as the user_id NULL issue fixed in PR #93 —
 *     see NOTES.md "Admin bypass — confirmed 2026-07-22, three conditions")
 *
 * Status is seeded directly via the Supabase service-role client rather than
 * routed through a real Stripe webhook — this keeps the test independent of
 * webhook branching logic that is intentionally NOT part of this change
 * (voluntary/involuntary cancellation detection is deferred until after
 * Tranche 1 migration; see NOTES.md).
 *
 * Requires a dedicated test member row, distinct from TEST_USER_EMAIL, so
 * this suite never mutates the shared always-active test account used by
 * other specs. Set TEST_GATE_PORTAL_GATE_EMAIL / TEST_GATE_PORTAL_GATE_PASSWORD in
 * .env.local pointing at a Supabase auth user that already has a members
 * row (user_id linked). The test restores status to "active" after each
 * run so re-runs are idempotent.
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const GATE_EMAIL    = process.env.TEST_GATE_PORTAL_GATE_EMAIL;
const GATE_PASSWORD = process.env.TEST_GATE_PORTAL_GATE_PASSWORD;
const ADMIN_EMAIL    = process.env.TEST_USER_EMAIL;    // existing seeded admin account, if is_admin=true
const ADMIN_PASSWORD = process.env.TEST_USER_PASSWORD;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminDb() {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
}

async function setMemberStatus(email: string, status: string) {
  const db = adminDb();
  const { error } = await db.from("members").update({ status }).eq("email", email);
  if (error) throw new Error(`Failed to seed status=${status} for ${email}: ${error.message}`);
}

async function getMemberIsAdmin(email: string): Promise<boolean> {
  const db = adminDb();
  const { data } = await db.from("members").select("is_admin").eq("email", email).maybeSingle();
  return data?.is_admin === true;
}

async function setPortalOpen(open: boolean) {
  const db = adminDb();
  const { error } = await db
    .from("site_config")
    .upsert({ key: "portal_open", value: open ? "true" : "false", updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`Failed to set portal_open=${open}: ${error.message}`);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle", { timeout: 60_000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/auth/v1/token") && r.status() === 200,
      { timeout: 15_000 }
    ),
    page.click('button[type="submit"]'),
  ]);
}

const canRunGateTests = Boolean(GATE_EMAIL && GATE_PASSWORD && SUPABASE_URL && SERVICE_ROLE_KEY);
const canRunAdminTests = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD && SUPABASE_URL && SERVICE_ROLE_KEY);

test.describe("Portal status gate — non-admin", () => {
  test.skip(!canRunGateTests, "TEST_GATE_PORTAL_GATE_EMAIL / TEST_GATE_PORTAL_GATE_PASSWORD / SUPABASE_SERVICE_ROLE_KEY not set");

  test.afterEach(async () => {
    await setMemberStatus(GATE_EMAIL!, "active");
  });

  test("status=cancelled redirects to /membership-ended", async ({ page }) => {
    await setMemberStatus(GATE_EMAIL!, "cancelled");
    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/membership-ended**", { timeout: 15_000 });
    await expect(page).toHaveURL(/membership-ended/);
    console.log("PASS: cancelled member redirected to /membership-ended");
  });

  test("status=cancelled redirects even when visiting an admin sub-route directly", async ({ page }) => {
    // Proves the gate lives in layout.tsx (wraps every child route), not
    // page.tsx (which only covers the dashboard itself).
    await setMemberStatus(GATE_EMAIL!, "cancelled");
    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    // Wait for the post-login redirect to settle before firing a second,
    // injected navigation — otherwise the two can race and the injected
    // navigation gets silently dropped mid-unload.
    await page.waitForURL("**/membership-ended**", { timeout: 15_000 });
    // The evaluate itself triggers a hard navigation, which destroys its own
    // execution context before the call can resolve — don't await it directly.
    void page.evaluate(() => { window.location.href = "/member-portal/admin/members"; }).catch(() => {});
    await page.waitForURL("**/membership-ended**", { timeout: 15_000 });
    await expect(page).toHaveURL(/membership-ended/);
    console.log("PASS: cancelled member redirected even from an admin sub-route");
  });

  test("status=payment_failed retains full portal access, no redirect", async ({ page }) => {
    await setMemberStatus(GATE_EMAIL!, "payment_failed");
    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });
    await expect(page).toHaveURL(/member-portal/);
    await expect(page).not.toHaveURL(/membership-ended/);
    console.log("PASS: payment_failed member reaches /member-portal, no redirect");
  });
});

test.describe("Portal status gate — admin bypass ordering", () => {
  test.skip(!canRunAdminTests, "TEST_USER_EMAIL / TEST_USER_PASSWORD / SUPABASE_SERVICE_ROLE_KEY not set");

  test.beforeAll(async () => {
    const isAdmin = await getMemberIsAdmin(ADMIN_EMAIL!);
    test.skip(!isAdmin, "TEST_USER_EMAIL is not an is_admin=true member — cannot test bypass ordering");
  });

  test.afterEach(async () => {
    await setMemberStatus(ADMIN_EMAIL!, "active");
  });

  test("admin with status=cancelled still reaches /member-portal/admin/* (row 10)", async ({ page }) => {
    await setMemberStatus(ADMIN_EMAIL!, "cancelled");
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    // Wait for the post-login redirect to settle before firing a second,
    // injected navigation — otherwise the two can race and the injected
    // navigation gets silently dropped mid-unload, leaving the test stuck
    // on /member-portal instead of ever reaching /member-portal/admin/members.
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });
    void page.evaluate(() => { window.location.href = "/member-portal/admin/members"; }).catch(() => {});
    await page.waitForURL("**/member-portal/admin/members**", { timeout: 15_000 });
    await expect(page).not.toHaveURL(/membership-ended/);
    await expect(page).toHaveURL(/member-portal\/admin\/members/);
    console.log("PASS: admin bypass wins over cancelled status, reaches admin route");
  });

  test("admin with status=cancelled still sees their own cancelled banner on member-facing views", async ({ page }) => {
    await setMemberStatus(ADMIN_EMAIL!, "cancelled");
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });
    await expect(page.locator("text=This membership has ended")).toBeVisible({ timeout: 10_000 });
    console.log("PASS: admin bypass does not hide their own lapsed-status banner");
  });

  test("admin with status=payment_failed retains full access and sees the payment_failed banner", async ({ page }) => {
    await setMemberStatus(ADMIN_EMAIL!, "payment_failed");
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });
    await expect(page.locator("text=Your last payment failed")).toBeVisible({ timeout: 10_000 });
    console.log("PASS: admin sees own payment_failed banner while retaining full access");
  });
});

// ── portal_open regression coverage ─────────────────────────────────────────
// layout.tsx now carries admin bypass, portal_open, cancelled, and
// payment_failed in a single member lookup. This is the pre-existing,
// already-live portal_open gate (PR #93) — these tests exist to catch a
// regression introduced by restructuring layout.tsx around the new status
// gate, not to re-test portal_open behaviour from scratch.
test.describe("Portal status gate — portal_open regression", () => {
  test.skip(!canRunGateTests || !canRunAdminTests, "TEST_GATE_PORTAL_GATE_EMAIL / TEST_USER_EMAIL / SUPABASE_SERVICE_ROLE_KEY not set");

  test.beforeAll(async () => {
    const isAdmin = await getMemberIsAdmin(ADMIN_EMAIL!);
    test.skip(!isAdmin, "TEST_USER_EMAIL is not an is_admin=true member — cannot test admin bypass through a closed portal");
  });

  test.afterEach(async () => {
    await setPortalOpen(true);
    await setMemberStatus(GATE_EMAIL!, "active");
  });

  test("portal_open=false redirects a non-admin, active member to /portal-coming-soon", async ({ page }) => {
    await setPortalOpen(false);
    await setMemberStatus(GATE_EMAIL!, "active");
    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/portal-coming-soon**", { timeout: 15_000 });
    await expect(page).toHaveURL(/portal-coming-soon/);
    console.log("PASS: portal_open=false still redirects a non-admin active member — unchanged from PR #93");
  });

  test("portal_open=false still lets an admin through, regardless of the new status gate", async ({ page }) => {
    await setPortalOpen(false);
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });
    await expect(page).not.toHaveURL(/portal-coming-soon/);
    await expect(page).toHaveURL(/member-portal/);
    console.log("PASS: admin bypass through a closed portal is intact after the layout.tsx restructure");
  });

  test("portal_open=false, admin also cancelled — admin bypass wins over both gates", async ({ page }) => {
    await setPortalOpen(false);
    await setMemberStatus(ADMIN_EMAIL!, "cancelled");
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });
    await expect(page).not.toHaveURL(/portal-coming-soon/);
    await expect(page).not.toHaveURL(/membership-ended/);
    await expect(page).toHaveURL(/member-portal/);
    await setMemberStatus(ADMIN_EMAIL!, "active");
    console.log("PASS: admin bypasses both portal_open and status gates simultaneously");
  });
});
