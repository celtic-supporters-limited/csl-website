/**
 * Signup Tests
 *
 * Tests for the /signup account-activation flow.
 *
 * Tests that require an existing member account need credentials via env vars:
 *   TEST_USER_EMAIL=member@example.com
 *   TEST_USER_PASSWORD=yourpassword
 *
 * Run:
 *   npx playwright test tests/signup.spec.ts
 */

import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? "";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? "";
const hasCredentials = !!(TEST_EMAIL && TEST_PASSWORD);

// ---------------------------------------------------------------------------
// TEST 1 — Duplicate email shows an error, does not redirect to portal
// ---------------------------------------------------------------------------
// Supabase signUp() rejects an already-registered email. The SignupForm must
// surface the error rather than silently redirecting to /member-portal.
// ---------------------------------------------------------------------------

test("signup with already-registered email shows an error", async ({
  page,
}) => {
  test.skip(
    !hasCredentials,
    "Set TEST_USER_EMAIL and TEST_USER_PASSWORD to run this test"
  );

  // Navigate as if arriving from /membership/success — email pre-filled via
  // query param and the field is disabled (locked) so the user cannot change it.
  await page.goto(`/signup?email=${encodeURIComponent(TEST_EMAIL)}`);
  await page.waitForLoadState("networkidle", { timeout: 60_000 });

  // Confirm the email field is pre-filled and locked.
  await expect(page.locator("#signup-email")).toHaveValue(TEST_EMAIL);
  await expect(page.locator("#signup-email")).toBeDisabled();

  // Fill in name and password. The existing user already has a password; the
  // signUp call will be rejected before any password change occurs.
  await page.fill("#signup-first-name", "Test");
  await page.fill("#signup-last-name", "User");
  await page.fill("#signup-password", TEST_PASSWORD);
  await page.fill("#signup-confirm", TEST_PASSWORD);

  await page.click('button[type="submit"]');

  // An error message must appear — the exact wording comes from Supabase.
  // We check for a broad substring that covers both the current Supabase v2
  // message ("User already registered") and any future rephrasing.
  const errorBox = page.locator("p.text-red-700");
  await expect(errorBox).toBeVisible({ timeout: 10_000 });
  await expect(errorBox).toContainText(/already registered|already exists/i);

  // Must NOT navigate away from /signup.
  await expect(page).toHaveURL(/\/signup/);
});

// ---------------------------------------------------------------------------
// TEST 2 — Signup without ?email param shows an editable email field
// ---------------------------------------------------------------------------

test("signup without prefilled email shows editable email field", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.waitForLoadState("networkidle", { timeout: 60_000 });

  const emailField = page.locator("#signup-email");
  await expect(emailField).toBeVisible();
  await expect(emailField).toBeEnabled();
  await expect(emailField).toHaveValue("");
});
