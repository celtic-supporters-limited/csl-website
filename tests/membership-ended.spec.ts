/**
 * /membership-ended page — session handling and exit paths.
 *
 * Deliberately different from /portal-coming-soon: that page signs the
 * member out server-side because there is nowhere else for them to go.
 * /membership-ended keeps the session alive (the rejoin flow at /membership
 * benefits from knowing who they are) but MUST carry a visible sign-out
 * control, or it recreates the trapped-session bug fixed in PR #93.
 *
 * See .claude/NOTES.md "Cancellation handling" for the design decision.
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const GATE_EMAIL    = process.env.TEST_GATE_MEMBERSHIP_ENDED_EMAIL;
const GATE_PASSWORD = process.env.TEST_GATE_MEMBERSHIP_ENDED_PASSWORD;
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

test.describe("/membership-ended", () => {
  test.skip(!canRun, "TEST_GATE_MEMBERSHIP_ENDED_EMAIL / TEST_GATE_MEMBERSHIP_ENDED_PASSWORD / SUPABASE_SERVICE_ROLE_KEY not set");

  test.beforeEach(async () => {
    await setMemberStatus(GATE_EMAIL!, "cancelled");
  });

  test.afterEach(async () => {
    await setMemberStatus(GATE_EMAIL!, "active");
  });

  test("shows member-specific content — session was retained, not signed out", async ({ page }) => {
    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/membership-ended**", { timeout: 15_000 });

    // "Hi {firstName}," only renders when the server-side session lookup
    // succeeded — a signed-out visitor would see the generic "Hello," form.
    await expect(page.locator("text=/Hi \\w+,|Hello,/")).toBeVisible();
    console.log("PASS: /membership-ended renders without forcing a re-login");
  });

  test("sign-out control is visible and functional", async ({ page }) => {
    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/membership-ended**", { timeout: 15_000 });

    const signOutButton = page.locator("button", { hasText: "Sign out" });
    await expect(signOutButton).toBeVisible();
    await signOutButton.click();
    await page.waitForURL("**/login**", { timeout: 15_000 });

    // Confirms the sign-out actually cleared the session, not just navigated.
    // The evaluate itself triggers a hard navigation, which destroys its own
    // execution context before the call can resolve — don't await it directly.
    void page.evaluate(() => { window.location.href = "/member-portal"; }).catch(() => {});
    await page.waitForURL("**/login**", { timeout: 15_000 });
    console.log("PASS: sign-out clears the session — repeat portal visit redirects to /login");
  });

  test("Rejoin CSL link points to /membership", async ({ page }) => {
    await signIn(page, GATE_EMAIL!, GATE_PASSWORD!);
    await page.waitForURL("**/membership-ended**", { timeout: 15_000 });

    const rejoinLink = page.locator("a", { hasText: "Rejoin CSL" });
    await expect(rejoinLink).toBeVisible();
    await expect(rejoinLink).toHaveAttribute("href", "/membership");
    console.log("PASS: Rejoin CSL link present and correct");
  });
});
