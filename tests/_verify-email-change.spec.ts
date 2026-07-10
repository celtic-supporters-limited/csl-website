/**
 * Verification script for the in-portal email change flow.
 * Deleted after verification. Not part of the permanent test suite.
 *
 * Verifies (UI-observable without inbox access):
 *   1. Editing the email field shows a warning about the confirmation step
 *   2. Submitting shows the blue confirmation banner + PATCH /api/profile with pending_email
 *   3. Amber pending banner appears on reload when member.pending_email is set in DB
 *   4. "Cancel pending change" clears pending_email via PATCH and removes the banner
 *   5. Submitting the same email shows "Profile updated" without pending flow
 *
 * Test 2 mocks supabase.auth.updateUser (PUT /auth/v1/user) so the real Supabase
 * account is not mutated. Test 3 sets pending_email directly via /api/profile PATCH.
 */

import { test, expect, type Page } from "@playwright/test";

const EMAIL    = process.env.TEST_USER_EMAIL    ?? "";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "";

// Distinct from the real address — will never be confirmed.
const NEW_EMAIL = "csl-email-change-verify@example.com";

async function loginAndGoToProfile(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle", { timeout: 20_000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/member-portal/, { timeout: 20_000 });
  await page.locator("aside nav button").filter({ hasText: /edit profile/i }).click();
  await page.waitForSelector("#email-address", { timeout: 10_000 });
}

async function clearPendingEmail(page: Page): Promise<void> {
  await page.request.fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ pending_email: null }),
  });
}

test.describe("Email change flow", () => {

  test.beforeEach(({}, testInfo) => {
    if (!EMAIL || !PASSWORD) testInfo.skip("TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
  });

  test("1 — warning text appears when email field is changed", async ({ page }) => {
    await loginAndGoToProfile(page);

    await page.fill("#email-address", NEW_EMAIL);

    await expect(page.locator("text=Changing your email will send a confirmation link")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("2 — submitting email change shows blue confirmation banner and calls PATCH with pending_email", async ({ page }) => {
    await loginAndGoToProfile(page);

    // Mock the Supabase updateUser (PUT /auth/v1/user) to avoid a real email change.
    // supabase.auth.updateUser sends PUT; getUser/refresh sends GET — only intercept PUT.
    // The URL has a ?redirect_to=... query string, so use a trailing wildcard.
    await page.route("**/auth/v1/user*", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: "mock-user-id", email: EMAIL }),
        });
      } else {
        await route.continue();
      }
    });

    // Collect all PATCH /api/profile request bodies
    const patchBodies: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/profile") && req.method() === "PATCH") {
        patchBodies.push(req.postData() ?? "");
      }
    });

    await page.fill("#email-address", NEW_EMAIL);
    await page.locator('form:has(#email-address) button[type="submit"]').click();

    // Blue confirmation banner should appear once updateUser succeeds
    await expect(page.locator("text=Confirmation sent to")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`text=${NEW_EMAIL}`)).toBeVisible({ timeout: 5_000 });

    // Wait a moment for all PATCHes to complete, then verify one carried pending_email
    await page.waitForTimeout(2_000);
    const hasPendingPatch = patchBodies.some(
      (b) => b.includes("pending_email") && b.includes(NEW_EMAIL)
    );
    expect(hasPendingPatch).toBe(true);

    // Cleanup: clear pending_email so DB is left in original state
    await clearPendingEmail(page);
  });

  test("3 — amber banner shows on reload when pending_email is set, cancel clears it", async ({ page }) => {
    // Login first so we have an auth session
    await page.goto("/login");
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/member-portal/, { timeout: 20_000 });

    // Set pending_email directly in DB — no Supabase auth mutation needed.
    // page.request inherits the browser's session cookies so the PATCH is authenticated.
    const setRes = await page.request.fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ pending_email: NEW_EMAIL }),
    });
    expect(setRes.ok()).toBeTruthy();

    // Reload page so local state is fresh; member.pending_email is now set in DB
    await page.reload();
    await page.waitForLoadState("networkidle", { timeout: 20_000 });

    // Navigate to Edit Profile tab
    await page.locator("aside nav button").filter({ hasText: /edit profile/i }).click();
    await page.waitForSelector("#email-address", { timeout: 10_000 });

    // Amber banner should be visible (member.pending_email is set; emailPending local state is null)
    await expect(page.locator("text=Email change pending")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${NEW_EMAIL}`)).toBeVisible({ timeout: 5_000 });

    // Capture the cancel PATCH
    const cancelPromise = page.waitForResponse(
      (res) => res.url().includes("/api/profile") && res.request().method() === "PATCH",
      { timeout: 10_000 }
    );

    await page.locator("button", { hasText: /cancel pending change/i }).click();

    // Banner should disappear
    await expect(page.locator("text=Email change pending")).not.toBeVisible({ timeout: 10_000 });

    // The cancel PATCH should have sent pending_email: null
    const cancelRes = await cancelPromise;
    expect(cancelRes.request().postData()).toContain('"pending_email":null');
  });

  test("4 — submitting same email as current does not trigger pending flow", async ({ page }) => {
    await loginAndGoToProfile(page);

    const profileResponses: number[] = [];
    page.on("response", (res) => {
      if (res.url().includes("/api/profile")) profileResponses.push(res.status());
    });

    // Submit without changing the email field
    await page.locator('form:has(#email-address) button[type="submit"]').click();

    await expect(page.locator("text=Profile updated")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Email change pending")).not.toBeVisible();
    await expect(page.locator("text=Confirmation sent to")).not.toBeVisible();
    expect(profileResponses.every((s) => s === 200)).toBe(true);
  });

});
