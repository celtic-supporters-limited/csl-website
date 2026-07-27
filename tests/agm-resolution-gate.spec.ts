/**
 * AGM requisition launch gate - /resolution and POST /api/resolution/sign.
 *
 * The gate is the `resolution_open` key in site_config, read through
 * lib/agm-gates.ts by both the page and the API route. It fails closed.
 *
 * Two risks are covered, and the second matters more than the first:
 *   - closed must actually block, at the API and not just the page
 *   - open must not wrongly block a legitimate signature during the campaign
 *
 * Gate state is global, so this file must not run in parallel with anything
 * else that touches `resolution_open`. Tests within a file run serially by
 * default, which is what this relies on. afterAll always closes the gate again
 * so an interrupted run cannot leave signing open.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
 * .env.local or .env.test.local (loaded by playwright.config.ts).
 *
 * Run:
 *   npx playwright test tests/agm-resolution-gate.spec.ts
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminDb() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run the gate tests"
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

async function setGate(open: boolean) {
  const { error } = await adminDb()
    .from("site_config")
    .upsert(
      { key: "resolution_open", value: open ? "true" : "false", updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) throw new Error(`Failed to set resolution_open=${open}: ${error.message}`);
}

async function deleteSignature(email: string) {
  await adminDb().from("agm_signatures").delete().eq("email", email);
}

async function signatureExists(email: string): Promise<boolean> {
  const { data } = await adminDb()
    .from("agm_signatures")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  return !!data;
}

// The resolution limiter allows 2 submissions per IP per hour, so every test
// that posts uses its own address.
let ipCounter = 10;
function nextIp() {
  return `10.9.0.${ipCounter++}`;
}

function validBody(email: string) {
  return {
    fullName: "Gate Test Signatory",
    email,
    postalAddress: "12 Example Street\nGlasgow\nG1 1AA",
    isShareholder: true,
    shareholderType: "direct",
    computershareSrn: "C0001234567",
    approximateShares: 500,
    isMember: false,
    typedSignature: "Gate Test Signatory",
    declarationAccepted: true,
    turnstileToken: "test-token",
  };
}

/**
 * The Take Action dropdown only renders its links while hovered, so the links
 * are absent from the DOM until the menu is opened. Asserting without opening
 * it would pass whatever the gate state.
 *
 * Returns a locator scoped to the nav: the footer links to /share-tracing and
 * /proxy as well, so an unscoped query matches twice.
 */
async function openTakeActionMenu(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Nav fetches gate state on mount; let that settle before opening the menu.
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: /Take Action/i }).hover();
  return page.getByRole("navigation");
}

async function postSign(
  request: APIRequestContext,
  body: Record<string, unknown>,
  ip = nextIp()
) {
  return request.post("/api/resolution/sign", {
    data: body,
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
  });
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  // Always leave the gate closed, whatever happened above.
  await setGate(false);
});

// ---------------------------------------------------------------------------
// 1. Gate closed
// ---------------------------------------------------------------------------

test.describe("Requisition gate closed", () => {
  test.beforeAll(async () => {
    await setGate(false);
  });

  test("page renders explanation but no signing form", async ({ page }) => {
    const res = await page.goto("/resolution", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);

    // Explanatory content still present - this must not be a 404.
    await expect(page.locator("h1")).toContainText(/Support the CSL Resolution/i);
    await expect(page.getByText("Who should sign")).toBeVisible();

    // Holding message shown, form absent.
    await expect(page.getByText(/Signing is not open yet|will open for signature/i).first()).toBeVisible();
    await expect(page.locator("#fullName")).toHaveCount(0);
    await expect(page.locator('button[type="submit"]')).toHaveCount(0);

    // Join CSL route stays available.
    await expect(page.locator('a[href="/membership"]').first()).toBeVisible();
  });

  test("signature counter is not shown", async ({ page }) => {
    await page.goto("/resolution", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Direct registered shareholder signatures/i)).toHaveCount(0);
  });

  test("nav does not offer Sign Resolution", async ({ page }) => {
    const nav = await openTakeActionMenu(page);
    // Share Tracing proves the menu is genuinely open, so the absence of
    // Sign Resolution below is meaningful rather than vacuously true.
    await expect(nav.getByRole("link", { name: "Share Tracing" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Sign Resolution" })).toHaveCount(0);
  });

  test("POST returns 403 and writes no row", async ({ request }) => {
    const email = `gate-closed-${Date.now()}@example.com`;
    const res = await postSign(request, validBody(email));

    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error: string; closed?: boolean };
    expect(body.closed).toBe(true);
    expect(body.error).toMatch(/not open yet/i);

    expect(await signatureExists(email)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Gate open - the path that must not regress
// ---------------------------------------------------------------------------

test.describe("Requisition gate open", () => {
  test.beforeAll(async () => {
    await setGate(true);
  });

  test("page renders the signing form", async ({ page }) => {
    await page.goto("/resolution", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#fullName", { timeout: 20_000 });

    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#postalAddress")).toBeVisible();
    await expect(page.locator("#typedSignature")).toBeVisible();
    await expect(page.getByText(/Direct registered shareholder signatures/i).first()).toBeVisible();
  });

  test("nav offers Sign Resolution", async ({ page }) => {
    const nav = await openTakeActionMenu(page);
    await expect(nav.getByRole("link", { name: "Sign Resolution" })).toBeVisible();
  });

  test("a valid submission still succeeds and writes a row", async ({ request }) => {
    const email = `gate-open-${Date.now()}@example.com`;
    try {
      const res = await postSign(request, validBody(email));

      expect(res.status()).toBe(200);
      const body = (await res.json()) as { ok?: boolean; firstName?: string };
      expect(body.ok).toBe(true);
      expect(body.firstName).toBe("Gate");

      expect(await signatureExists(email)).toBe(true);
    } finally {
      await deleteSignature(email);
    }
  });

  test("validation still applies when open", async ({ request }) => {
    const res = await postSign(request, {
      ...validBody(`gate-open-invalid-${Date.now()}@example.com`),
      fullName: "",
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/full name is required/i);
  });
});
