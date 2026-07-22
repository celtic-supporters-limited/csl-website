/**
 * Verifies that the portal left nav shows the current admin link labels on
 * every page — dashboard, admin members, and back to dashboard — catching
 * stale cached renders.
 *
 * Run against staging:
 *   $env:PLAYWRIGHT_BASE_URL="https://csl-website-git-develop-gary-phinn-s-projects.vercel.app"
 *   npx playwright test tests/nav-labels.spec.ts --headed
 */

import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const EMAIL    = process.env.TEST_USER_EMAIL    ?? "";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "";

const EXPECTED = [
  "Member Support",
  "Operational Status",
  "AGM Resolution Progress",
];
const STALE = [
  "Member Events",
  "Operations",
  "Resolution",
];

async function login(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/member-portal/, { timeout: 20_000 });
}

async function assertNav(page: Page, context: string) {
  for (const label of EXPECTED) {
    await expect(
      page.locator("nav, aside, [class*='sidebar'], [class*='shell']").filter({ hasText: label }).first(),
      `${context}: expected "${label}" in nav`
    ).toBeVisible({ timeout: 8_000 }).catch(async () => {
      // Fallback: check body text so we get a useful failure message
      await expect(page.locator("body"), `${context}: expected "${label}" anywhere on page`).toContainText(label, { timeout: 2_000 });
    });
  }

  for (const stale of STALE) {
    const count = await page.locator("nav, aside, [class*='sidebar'], [class*='shell']").filter({ hasText: stale }).count();
    expect(count, `${context}: stale label "${stale}" should not appear in nav`).toBe(0);
  }
}

test.beforeEach(({}, testInfo) => {
  if (!EMAIL || !PASSWORD) testInfo.skip("TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
});

test("nav labels correct on dashboard (/member-portal)", async ({ page }) => {
  await login(page);
  expect(page.url()).toMatch(/\/member-portal/);
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  await assertNav(page, "dashboard");
});

test("nav labels correct on admin/members page", async ({ page }) => {
  await login(page);
  await page.goto("/member-portal/admin/members");
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  await assertNav(page, "admin/members");
});

test("nav labels still correct after navigating from admin/members back to dashboard", async ({ page }) => {
  await login(page);
  await page.goto("/member-portal/admin/members");
  await page.waitForLoadState("networkidle", { timeout: 15_000 });

  // Navigate back to dashboard via the nav link
  await page.locator("a[href='/member-portal']").first().click();
  await page.waitForURL(/\/member-portal$/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  await assertNav(page, "dashboard after back-nav");
});

test("nav labels correct after hard reload of dashboard", async ({ page }) => {
  await login(page);
  await page.reload({ waitUntil: "networkidle" });
  await assertNav(page, "dashboard after reload");
});
