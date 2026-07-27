/**
 * Site gates - the four runtime controls in site_config, read through
 * lib/site-gates.ts by every page and API route that depends on them.
 *
 *   membership_open  /membership          + POST /api/checkout
 *   portal_open      /member-portal       (non-admin members only)
 *   resolution_open  /resolution          + POST /api/resolution/sign
 *   proxy_open       /proxy               + POST /api/proxy
 *
 * Two risks are covered per gate, and the second matters more than the first:
 *   - closed must actually block, at the API and not just the page
 *   - open must not wrongly block a legitimate user
 *
 * A gate needs two things to work, and this file exists because only one of
 * them is visible in code review: the read must be uncached, AND the consuming
 * route must not be statically rendered. membership_open failed the second
 * condition, so flipping it changed the database and nothing else.
 *
 * Gate state is global, so this file must not run in parallel with anything
 * else that touches these keys, notably tests/proxy-workflow.spec.ts which
 * opens proxy_open for its own suite. Run gate specs with --workers=1. Tests
 * within a file run serially by default, which is what this relies on.
 * afterAll restores every gate so an interrupted run cannot leave one open.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, plus
 * TEST_GATE_PORTAL_GATE_EMAIL / _PASSWORD for the portal gate, in .env.local or
 * .env.test.local (loaded by playwright.config.ts).
 *
 * Run:
 *   npx playwright test tests/site-gates.spec.ts --workers=1
 */

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORTAL_EMAIL = process.env.TEST_GATE_PORTAL_GATE_EMAIL;
const PORTAL_PASSWORD = process.env.TEST_GATE_PORTAL_GATE_PASSWORD;

type GateKey = "membership_open" | "portal_open" | "resolution_open" | "proxy_open";

function adminDb() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run the gate tests"
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

async function setSiteGate(key: GateKey, open: boolean) {
  const { error } = await adminDb()
    .from("site_config")
    .upsert(
      { key, value: open ? "true" : "false", updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) throw new Error(`Failed to set ${key}=${open}: ${error.message}`);
}

/** resolution_open, kept short because most of this file is about it. */
async function setGate(open: boolean) {
  await setSiteGate("resolution_open", open);
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
  // The dropdown is driven by React state, so wait for hydration before
  // hovering. Without this the hover lands on unhydrated markup and the menu
  // never opens.
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

  test("nav still offers Sign Resolution while closed", async ({ page }) => {
    // Nav visibility is not access control, the gate is. All three Take Action
    // entries stay visible in every gate state so a shareholder following a
    // link can still find the page, read what it is, and join CSL.
    const nav = await openTakeActionMenu(page);
    await expect(nav.getByRole("link", { name: "Share Tracing" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Proxy Assignment" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Sign Resolution" })).toBeVisible();
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

  test("nav offers Sign Resolution while open", async ({ page }) => {
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

// ---------------------------------------------------------------------------
// 3. Membership gate - the one that regressed
//
// /membership was statically rendered, so it served the value baked at build
// time while POST /api/checkout honoured the live value. The page assertions
// below are the ones that would have caught it.
// ---------------------------------------------------------------------------

async function postCheckout(request: APIRequestContext, ip: string) {
  return request.post("/api/checkout", {
    // Deliberately incomplete: this asserts whether the gate blocks, not
    // whether a real checkout session can be created. A 403 means the gate
    // rejected it, anything else means the request got past the gate.
    data: { plan: "standard", email: `gate-${Date.now()}@example.com`, turnstileToken: "test-token" },
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
  });
}

test.describe("Membership gate", () => {
  test.afterAll(async () => {
    await setSiteGate("membership_open", false);
  });

  test("closed: page shows the holding state and checkout is rejected", async ({ page, request }) => {
    await setSiteGate("membership_open", false);

    await page.goto("/membership", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Coming soon").first()).toBeVisible();
    await expect(page.getByText("Choose from the available options below")).toHaveCount(0);

    const res = await postCheckout(request, "10.7.1.1");
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not currently open/i);
  });

  test("open: page shows the plans state and checkout is not gate-blocked", async ({ page, request }) => {
    await setSiteGate("membership_open", true);

    await page.goto("/membership", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Choose from the available options below").first()).toBeVisible();
    await expect(page.getByText("Coming soon")).toHaveCount(0);

    const res = await postCheckout(request, "10.7.2.1");
    expect(res.status()).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 4. Portal gate
//
// Needs a real non-admin member: admins bypass portal_open by design, so an
// admin account would pass whatever the gate said.
//
// portal_open is the one gate that defaults OPEN on a missing key or a failed
// read (GATE_DEFAULTS in lib/site-gates.ts), so that a transient error cannot
// sign out every member.
// ---------------------------------------------------------------------------

test.describe("Portal gate", () => {
  test.skip(
    !(PORTAL_EMAIL && PORTAL_PASSWORD),
    "TEST_GATE_PORTAL_GATE_EMAIL / TEST_GATE_PORTAL_GATE_PASSWORD not set"
  );

  test.afterAll(async () => {
    await setSiteGate("portal_open", true);
  });

  test("closed: non-admin member is redirected to /portal-coming-soon", async ({ page }) => {
    await setSiteGate("portal_open", false);
    await signIn(page, PORTAL_EMAIL!, PORTAL_PASSWORD!);
    await page.waitForURL("**/portal-coming-soon**", { timeout: 20_000 });
    await expect(page).toHaveURL(/portal-coming-soon/);
  });

  test("open: non-admin member reaches the portal", async ({ page }) => {
    await setSiteGate("portal_open", true);
    await signIn(page, PORTAL_EMAIL!, PORTAL_PASSWORD!);
    await page.waitForURL("**/member-portal**", { timeout: 20_000 });
    await expect(page).toHaveURL(/member-portal/);
  });
});

// ---------------------------------------------------------------------------
// 5. Proxy gate
//
// The proxy suite in tests/proxy-workflow.spec.ts covers the open path in
// depth. These two prove the gate itself, so all four gates are provable from
// one file.
// ---------------------------------------------------------------------------

test.describe("Proxy gate", () => {
  test.afterAll(async () => {
    await setSiteGate("proxy_open", false);
  });

  test("closed: page hides the form and the API rejects", async ({ page, request }) => {
    await setSiteGate("proxy_open", false);

    await page.goto("/proxy", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Notice of the Annual General Meeting/i).first()).toBeVisible();
    await expect(page.locator("#name")).toHaveCount(0);

    const res = await request.post("/api/proxy", {
      data: { name: "Gate Test", email: `gate-${Date.now()}@example.com`, turnstileToken: "test-token" },
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.7.3.1" },
    });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { closed?: boolean };
    expect(body.closed).toBe(true);
  });

  test("open: page renders the form", async ({ page }) => {
    await setSiteGate("proxy_open", true);
    await page.goto("/proxy", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#name", { timeout: 20_000 });
    await expect(page.locator("#email")).toBeVisible();
  });
});
