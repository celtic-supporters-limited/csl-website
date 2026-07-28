/**
 * AGM Package 3 - resolution content, version management, meeting scoping.
 *
 * Covers the schema additions to agm_resolution_versions (declaration_text,
 * consent_text, supporting_statement, meeting_ref), the two new admin routes
 * (POST /api/admin/resolution-versions, POST /api/admin/resolution-versions/activate),
 * and the public page rendering the current version's content.
 *
 * REQUIRES sql/agm-p3-staging-cleanup.sql then sql/agm-p3-resolution-content.sql
 * to have been run on the target database.
 *
 * SAFETY, same shape as tests/agm-requisition-capture.spec.ts.
 *
 * This suite creates versions and activates them, including making
 * non-placeholder content current. Between individual test steps the target
 * environment is briefly signable if the gate is also open. Refuses to run
 * anywhere but staging. afterAll restores the placeholder as current and
 * closes the gate.
 *
 * Some versions created here end up with a signature recorded against them
 * (that is what test 2 and test 4 are proving) and therefore cannot be
 * deleted - the FK restrict is doing its job. Those rows are left in the
 * staging catalogue deliberately; if they were removable, the constraint
 * would not be working.
 *
 * Run:
 *   npx playwright test tests/agm-p3-resolution-content.spec.ts --workers=1
 */

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.TEST_USER_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_USER_PASSWORD;

// Same allowlist as tests/agm-requisition-capture.spec.ts. Not a secret: part
// of NEXT_PUBLIC_SUPABASE_URL, ships in the client bundle.
const STAGING_PROJECT_REF = "mixwriunejiaxbpgxqmp";

function db() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

async function setConfig(key: string, value: string) {
  const { error } = await db()
    .from("site_config")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`setConfig ${key}: ${error.message}`);
}

/** Two-step flip for test setup that bypasses the admin API deliberately. */
async function setCurrentDirect(id: string) {
  await db().from("agm_resolution_versions").update({ is_current: false }).eq("is_current", true);
  const { error } = await db().from("agm_resolution_versions").update({ is_current: true }).eq("id", id);
  if (error) throw new Error(`setCurrentDirect: ${error.message}`);
}

async function getPlaceholderId(): Promise<string> {
  const { data, error } = await db()
    .from("agm_resolution_versions")
    .select("id")
    .eq("is_placeholder", true)
    .maybeSingle();
  if (error || !data) throw new Error("placeholder version not found - has the P3 schema script run?");
  return data.id;
}

type TestVersionFields = {
  version_label: string;
  body: string;
  declaration_text: string;
  consent_text: string;
  supporting_statement?: string | null;
  is_placeholder?: boolean;
  is_current?: boolean;
};

async function insertVersion(fields: TestVersionFields): Promise<string> {
  const { data, error } = await db()
    .from("agm_resolution_versions")
    .insert({ created_by: "playwright p3", is_placeholder: false, is_current: false, ...fields })
    .select("id")
    .single();
  if (error) throw new Error(`insertVersion: ${error.message}`);
  return data.id;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle", { timeout: 60_000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/auth/v1/token") && r.status() === 200, { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
}

let ipCounter = 40;
const nextIp = () => `10.12.0.${ipCounter++}`;

function validSignBody(email: string) {
  return {
    fullName: "P3 Test Signatory",
    addressLine1: "1 Test Street",
    addressTown: "Glasgow",
    addressPostcode: "G1 1AA",
    email,
    howHeld: "direct",
    computershareSrn: "C0009998887",
    shareClass: "ORD",
    eligibilityConfirmed: true,
    resolutionSupported: true,
    consentGiven: true,
    signatureName: "P3 Test Signatory",
    turnstileToken: "test-token",
  };
}

async function sign(request: APIRequestContext, body: Record<string, unknown>) {
  return request.post("/api/resolution/sign", {
    data: body,
    headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
  });
}

async function cleanupSignature(email: string) {
  await db().from("agm_signatures").delete().eq("email", email);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (!SUPABASE_URL?.includes(STAGING_PROJECT_REF)) {
    throw new Error(
      `Refusing to run: this suite creates and activates resolution versions and must only target staging (${STAGING_PROJECT_REF}). Got ${SUPABASE_URL ?? "no NEXT_PUBLIC_SUPABASE_URL"}.`
    );
  }
  await setConfig("resolution_open", "false");
});

test.afterAll(async () => {
  const placeholderId = await getPlaceholderId();
  await setCurrentDirect(placeholderId);
  await setConfig("resolution_open", "false");
});

// ---------------------------------------------------------------------------
// 1. Immutability - four separate assertions
// ---------------------------------------------------------------------------

test("declaration_text, consent_text and supporting_statement cannot be updated, neither can body", async () => {
  const id = await insertVersion({
    version_label: "P3 immutability probe",
    body: "Body v1",
    declaration_text: "Declaration v1",
    consent_text: "Consent v1",
    supporting_statement: "Statement v1",
  });

  const attempts: [string, Record<string, string>][] = [
    ["body", { body: "tampered" }],
    ["declaration_text", { declaration_text: "tampered" }],
    ["consent_text", { consent_text: "tampered" }],
    ["supporting_statement", { supporting_statement: "tampered" }],
  ];

  for (const [column, patch] of attempts) {
    const { error } = await db().from("agm_resolution_versions").update(patch).eq("id", id);
    expect(error, `${column} should be immutable`).not.toBeNull();
    expect(error?.message).toMatch(new RegExp(`${column} is immutable`));
  }

  const { data: unchanged } = await db()
    .from("agm_resolution_versions")
    .select("body, declaration_text, consent_text, supporting_statement")
    .eq("id", id)
    .single();
  expect(unchanged.body).toBe("Body v1");
  expect(unchanged.declaration_text).toBe("Declaration v1");
  expect(unchanged.consent_text).toBe("Consent v1");
  expect(unchanged.supporting_statement).toBe("Statement v1");
});

// ---------------------------------------------------------------------------
// 2. FK restrict - a version with signatures cannot be deleted
// ---------------------------------------------------------------------------

test("a version with signatures against it cannot be deleted", async ({ request }) => {
  const id = await insertVersion({
    version_label: "P3 FK restrict probe",
    body: "Resolution body for FK probe",
    declaration_text: "Declaration for FK probe",
    consent_text: "Consent for FK probe",
  });
  await setCurrentDirect(id);
  await setConfig("resolution_open", "true");

  const email = `p3-fk-${Date.now()}@example.com`;
  try {
    const res = await sign(request, validSignBody(email));
    expect(res.status()).toBe(200);

    const { error } = await db().from("agm_resolution_versions").delete().eq("id", id);
    expect(error).not.toBeNull();

    const { data: still } = await db()
      .from("agm_resolution_versions").select("id").eq("id", id).maybeSingle();
    expect(still).toBeTruthy();
  } finally {
    await cleanupSignature(email);
    await setConfig("resolution_open", "false");
  }
});

// ---------------------------------------------------------------------------
// 3. Creating a version leaves existing versions, including current, unchanged
// ---------------------------------------------------------------------------

test("creating a new version via the admin route does not alter existing versions", async ({ page }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const placeholderId = await getPlaceholderId();
  await setCurrentDirect(placeholderId);
  const { data: before } = await db()
    .from("agm_resolution_versions").select("*").eq("id", placeholderId).single();

  await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  const res = await page.request.post("/api/admin/resolution-versions", {
    data: {
      versionLabel: "P3 create-does-not-mutate probe",
      body: "New body",
      declarationText: "New declaration",
      consentText: "New consent",
    },
  });
  expect(res.status()).toBe(200);
  const created = await res.json();
  expect(created.ok).toBe(true);

  const { data: after } = await db()
    .from("agm_resolution_versions").select("*").eq("id", placeholderId).single();
  expect(after).toEqual(before);
  expect(after.is_current).toBe(true);

  const { data: newRow } = await db()
    .from("agm_resolution_versions").select("is_current").eq("id", created.id).single();
  expect(newRow.is_current).toBe(false);
});

// ---------------------------------------------------------------------------
// 4. The one that matters most: activating a different version does not
//    alter resolution_version_id on an existing signature.
// ---------------------------------------------------------------------------

test("making a different version current does not alter an existing signature's version id", async ({ page, request }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const versionA = await insertVersion({
    version_label: "P3 test 4 - version A",
    body: "Version A body",
    declaration_text: "Version A declaration",
    consent_text: "Version A consent",
  });
  await setCurrentDirect(versionA);
  await setConfig("resolution_open", "true");

  const email = `p3-versionid-${Date.now()}@example.com`;
  try {
    expect((await sign(request, validSignBody(email))).status()).toBe(200);

    const { data: signatureBefore } = await db()
      .from("agm_signatures").select("resolution_version_id").eq("email", email).single();
    expect(signatureBefore.resolution_version_id).toBe(versionA);

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    const createRes = await page.request.post("/api/admin/resolution-versions", {
      data: {
        versionLabel: "P3 test 4 - version B",
        body: "Version B body",
        declarationText: "Version B declaration",
        consentText: "Version B consent",
      },
    });
    const versionB = (await createRes.json()).id;

    const activateRes = await page.request.post("/api/admin/resolution-versions/activate", {
      data: { id: versionB },
    });
    expect(activateRes.status()).toBe(200);

    const { data: nowCurrent } = await db()
      .from("agm_resolution_versions").select("id").eq("is_current", true).single();
    expect(nowCurrent.id).toBe(versionB);

    const { data: signatureAfter } = await db()
      .from("agm_signatures").select("resolution_version_id").eq("email", email).single();
    expect(signatureAfter.resolution_version_id).toBe(versionA);
    expect(signatureAfter.resolution_version_id).not.toBe(versionB);
  } finally {
    await cleanupSignature(email);
    await setConfig("resolution_open", "false");
  }
});

// ---------------------------------------------------------------------------
// 5. Public page renders the current version's texts
// ---------------------------------------------------------------------------

test("public page renders the current version's resolution, declaration and consent text", async ({ page }) => {
  const marker = `P3RENDER${Date.now()}`;
  const id = await insertVersion({
    version_label: "P3 render probe",
    body: `RESOLUTION-${marker}`,
    declaration_text: `DECLARATION-${marker}`,
    consent_text: `CONSENT-${marker}`,
  });
  await setCurrentDirect(id);
  await setConfig("resolution_open", "true");

  try {
    await page.goto("/resolution", { waitUntil: "domcontentloaded" });
    // The resolution/declaration/consent block only renders once the
    // shareholder branch is chosen.
    await page.getByRole("radio", { name: "Yes" }).first().check();
    const body = await page.locator("body").innerText();
    expect(body).toContain(`RESOLUTION-${marker}`);
    expect(body).toContain(`DECLARATION-${marker}`);
    expect(body).toContain(`CONSENT-${marker}`);
  } finally {
    await setConfig("resolution_open", "false");
  }
});

// ---------------------------------------------------------------------------
// 6. Supporting statement: present renders, null does not
// ---------------------------------------------------------------------------

test("supporting statement renders when set and is absent when null", async ({ page }) => {
  const withStatement = await insertVersion({
    version_label: "P3 statement present",
    body: "Body with statement",
    declaration_text: "Declaration with statement",
    consent_text: "Consent with statement",
    supporting_statement: "UNIQUE-STATEMENT-TEXT-12345",
  });
  const withoutStatement = await insertVersion({
    version_label: "P3 statement absent",
    body: "Body without statement",
    declaration_text: "Declaration without statement",
    consent_text: "Consent without statement",
    supporting_statement: null,
  });

  await setConfig("resolution_open", "true");
  try {
    await setCurrentDirect(withStatement);
    await page.goto("/resolution", { waitUntil: "domcontentloaded" });
    await page.getByRole("radio", { name: "Yes" }).first().check();
    let body = await page.locator("body").innerText();
    expect(body).toContain("Supporting Statement");
    expect(body).toContain("UNIQUE-STATEMENT-TEXT-12345");

    await setCurrentDirect(withoutStatement);
    await page.goto("/resolution", { waitUntil: "domcontentloaded" });
    await page.getByRole("radio", { name: "Yes" }).first().check();
    body = await page.locator("body").innerText();
    expect(body).not.toContain("Supporting Statement");
  } finally {
    await setConfig("resolution_open", "false");
  }
});

// ---------------------------------------------------------------------------
// 7. Placeholder current: nothing signable, unchanged from Package 2
// ---------------------------------------------------------------------------

test("with the placeholder current, the public page offers no signing form regardless of gate state", async ({ page }) => {
  const placeholderId = await getPlaceholderId();
  await setCurrentDirect(placeholderId);
  await setConfig("resolution_open", "true");

  try {
    await page.goto("/resolution", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#fullName")).toHaveCount(0);
    await expect(page.getByText(/placeholder|not been finalised|not open yet/i).first()).toBeVisible();
  } finally {
    await setConfig("resolution_open", "false");
  }
});

// ---------------------------------------------------------------------------
// 8. Admin list shows the correct signature count per version
// ---------------------------------------------------------------------------

test("admin version list shows the correct signature count", async ({ page, request }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const id = await insertVersion({
    version_label: `P3 count probe ${Date.now()}`,
    body: "Count probe body",
    declaration_text: "Count probe declaration",
    consent_text: "Count probe consent",
  });
  await setCurrentDirect(id);
  await setConfig("resolution_open", "true");

  const email = `p3-count-${Date.now()}@example.com`;
  try {
    expect((await sign(request, validSignBody(email))).status()).toBe(200);

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/resolution/versions", { waitUntil: "domcontentloaded" });

    const row = page.locator("tr", { hasText: `P3 count probe` });
    await expect(row.first()).toBeVisible();
    await expect(row.first()).toContainText("1");
  } finally {
    await cleanupSignature(email);
    await setConfig("resolution_open", "false");
  }
});

// ---------------------------------------------------------------------------
// 9. No edit affordance anywhere in the admin UI
// ---------------------------------------------------------------------------

test("no edit action exists on the version management page", async ({ page }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await page.goto("/member-portal/admin/resolution/versions", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: /^edit$/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^edit$/i })).toHaveCount(0);

  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\bEdit\b/);
});
