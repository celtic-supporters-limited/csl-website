/**
 * MembershipStatusBanner — components/MembershipStatusBanner.tsx.
 *
 * Distinct from tests/payment-failed.spec.ts, which covers the webhook DB
 * write and that the portal doesn't crash. This file asserts the banner
 * itself: correct copy, correct action, and — critically — that it is
 * absent for active members and does not double-render (the old inline
 * banner inside DashboardTab was removed in favour of one global banner
 * mounted above all tabs in PortalClient.tsx, so this must render exactly
 * once regardless of which tab is active).
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const GATE_EMAIL    = process.env.TEST_GATE_PAYMENT_BANNER_EMAIL;
const GATE_PASSWORD = process.env.TEST_GATE_PAYMENT_BANNER_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const canRun = Boolean(GATE_EMAIL && GATE_PASSWORD && SUPABASE_URL && SERVICE_ROLE_KEY);

async function setMemberStatus(email: string, status: string) {
  const db = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  const { error } = await db.from("members").update({ status }).eq("email", email);
  if (error) throw new Error(`Failed to seed status=${status} for ${email}: ${error.message}`);
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

test.describe("payment_failed banner", () => {
  test.skip(!canRun, "TEST_GATE_PAYMENT_BANNER_EMAIL / TEST_GATE_PAYMENT_BANNER_PASSWORD / SUPABASE_SERVICE_ROLE_KEY not set");

  test.afterEach(async () => {
    await setMemberStatus(GATE_EMAIL!, "active");
  });

  test("banner renders exactly once on the dashboard tab, with card-update action", async ({ page }) => {
    await setMemberStatus(GATE_EMAIL!, "payment_failed");
    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });

    const banner = page.locator("text=Your last payment failed");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCount(1);

    const updateButton = page.locator("button", { hasText: "Update payment method" });
    await expect(updateButton).toBeVisible();
    console.log("PASS: payment_failed banner renders once on dashboard, with action button");
  });

  test("banner persists when switching to a non-dashboard tab", async ({ page }) => {
    await setMemberStatus(GATE_EMAIL!, "payment_failed");
    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });

    await page.evaluate(() => { window.location.href = "/member-portal?tab=profile"; });
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    const banner = page.locator("text=Your last payment failed");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCount(1);
    console.log("PASS: banner is global (mounted above tab content), not dashboard-only");
  });

  test("banner is absent for an active member", async ({ page }) => {
    await setMemberStatus(GATE_EMAIL!, "active");
    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 15_000 });

    await expect(page.locator("text=Your last payment failed")).toHaveCount(0);
    console.log("PASS: no banner shown for an active member");
  });
});
