/**
 * AGM Package 3 content, updated for the admin redesign that merged the two
 * admin resolution pages into one at /member-portal/admin/resolution and
 * retired /member-portal/admin/resolution/versions entirely. See
 * docs/agm/CSL_AGM_AdminRedesign_ClaudeCode_Prompt.md.
 *
 * The underlying schema, immutability trigger and FK restrict on
 * agm_resolution_versions are unchanged by that redesign, so the tests
 * proving them (1, 2) are unchanged. What changed is the interface: there is
 * no more standalone "create" then "make current" as two separate admin
 * actions a test can call directly and call it done - the one thing that
 * matters most, that saving new wording never moves an existing signature's
 * resolution_version_id, now has to be proven by actually driving the
 * "Change wording" -> "Save" -> "Yes, save" flow a volunteer uses (test 4).
 *
 * REQUIRES sql/agm-p3-staging-cleanup.sql then sql/agm-p3-resolution-content.sql
 * to have been run on the target database.
 *
 * SAFETY, same shape as tests/agm-requisition-capture.spec.ts.
 *
 * This suite creates wordings and makes some of them current, including
 * non-placeholder content. Between individual test steps the target
 * environment is briefly signable if the gate is also open. Refuses to run
 * anywhere but staging. afterAll restores the placeholder as current and
 * closes the gate.
 *
 * Every wording this file creates is deleted by the same test before that
 * test ends. Tests 2 and 4 sign against their own wording to prove the FK
 * restrict blocks deletion mid-test - that assertion still runs - but each
 * then removes the signature it just made and deletes the wording
 * afterwards, so nothing survives the run. A wording only needs
 * is_placeholder: false when the test actually signs against it or needs the
 * public page to render its content; insertVersion() defaults to placeholder
 * otherwise. Every created wording's label carries TEST_LABEL_PREFIX, so any
 * survivor is identifiable at a glance in the Wording History disclosure.
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

// Every wording this file creates carries this prefix, so a row left behind
// by a crashed run is identifiable in the Wording History disclosure without
// having to know which test wrote it.
const TEST_LABEL_PREFIX = "[TEST] ";

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

/** Two-step flip for test setup that bypasses the admin "Save" flow deliberately. */
async function setCurrentDirect(id: string) {
  await db().from("agm_resolution_versions").update({ is_current: false }).eq("is_current", true);
  const { error } = await db().from("agm_resolution_versions").update({ is_current: true }).eq("id", id);
  if (error) throw new Error(`setCurrentDirect: ${error.message}`);
}

// Selects all placeholder rows rather than .maybeSingle(): a wording created
// by test 1 is itself a placeholder for the duration of its own test
// (deleted at the end), so a call to this function from a different test
// running after a crashed, uncleaned-up prior run could otherwise find two
// rows and throw. Prefers the real seeded row over anything carrying the
// test label prefix, so a stray leftover is never mistaken for the one the
// public page should fall back to.
async function getPlaceholderId(): Promise<string> {
  const { data, error } = await db()
    .from("agm_resolution_versions")
    .select("id, version_label")
    .eq("is_placeholder", true);
  if (error) throw new Error(`getPlaceholderId: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("placeholder wording not found - has the P3 schema script run?");
  }
  const real = data.find((v) => !v.version_label.startsWith(TEST_LABEL_PREFIX));
  return (real ?? data[0]).id;
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

// Defaults to placeholder: most of what this file creates is never signed
// against and never needs to be. A caller that actually signs against its
// wording, or needs the public page to render its content, passes
// is_placeholder: false explicitly - that override is the record of which
// tests need a signable wording and which do not.
async function insertVersion(fields: TestVersionFields): Promise<string> {
  const { data, error } = await db()
    .from("agm_resolution_versions")
    .insert({
      created_by: "playwright p3",
      is_placeholder: true,
      is_current: false,
      ...fields,
      version_label: `${TEST_LABEL_PREFIX}${fields.version_label}`,
    })
    .select("id")
    .single();
  if (error) throw new Error(`insertVersion: ${error.message}`);
  return data.id;
}

async function deleteVersion(id: string) {
  const { error } = await db().from("agm_resolution_versions").delete().eq("id", id);
  if (error) {
    // Best-effort: a wording this test itself signed against needs its
    // signature cleared first, which every caller below does before calling
    // this. Logged rather than thrown so one failed cleanup does not stop the
    // rest of the file's teardown from running.
    console.warn(`could not delete test wording ${id}: ${error.message}`);
  }
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
  // Wait for the post-login redirect to settle before firing any
  // page.request.* calls - the session cookie is not guaranteed to be
  // attached until the client has actually navigated to /member-portal.
  await page.waitForURL(/\/member-portal/, { timeout: 20_000 });
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
      `Refusing to run: this suite creates and activates resolution wordings and must only target staging (${STAGING_PROJECT_REF}). Got ${SUPABASE_URL ?? "no NEXT_PUBLIC_SUPABASE_URL"}.`
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
// 1. Immutability - four separate assertions. Unchanged by the redesign:
//    this is the database trigger, not the interface.
// ---------------------------------------------------------------------------

test("declaration_text, consent_text and supporting_statement cannot be updated, neither can body", async () => {
  const id = await insertVersion({
    version_label: "P3 immutability probe",
    body: "Body v1",
    declaration_text: "Declaration v1",
    consent_text: "Consent v1",
    supporting_statement: "Statement v1",
  });

  try {
    const attempts: [string, Record<string, string>][] = [
      ["body", { body: "tampered" }],
      ["declaration_text", { declaration_text: "tampered" }],
      ["consent_text", { consent_text: "tampered" }],
      ["supporting_statement", { supporting_statement: "tampered" }],
    ];

    for (const [column, patch] of attempts) {
      const { error } = await db().from("agm_resolution_versions").update(patch).eq("id", id);
      console.log(`IMMUTABILITY [${column}]:`, error?.message);
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
  } finally {
    await deleteVersion(id);
  }
});

// ---------------------------------------------------------------------------
// 2. FK restrict - a wording with signatures cannot be deleted. Unchanged by
//    the redesign: the delete action and its route are gone from the admin
//    UI, but the database constraint this proves is what makes that removal
//    safe in the first place.
// ---------------------------------------------------------------------------

test("a wording with signatures against it cannot be deleted", async ({ request }) => {
  const id = await insertVersion({
    version_label: "P3 FK restrict probe",
    body: "Resolution body for FK probe",
    declaration_text: "Declaration for FK probe",
    consent_text: "Consent for FK probe",
    is_placeholder: false, // signed against below - must be real content
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
    await deleteVersion(id);
    await setConfig("resolution_open", "false");
  }
});

// ---------------------------------------------------------------------------
// 3. Creating a wording via the admin route leaves existing wordings,
//    including which is current, unchanged. The route itself is unchanged by
//    the redesign except that it no longer accepts a label from the client -
//    POST /api/admin/resolution-versions generates one server-side now.
// ---------------------------------------------------------------------------

test("creating a new wording via the admin route does not alter existing wordings", async ({ page }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const placeholderId = await getPlaceholderId();
  await setCurrentDirect(placeholderId);
  const { data: before } = await db()
    .from("agm_resolution_versions").select("*").eq("id", placeholderId).single();

  await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  const res = await page.request.post("/api/admin/resolution-versions", {
    data: {
      body: "New body",
      declarationText: "New declaration",
      consentText: "New consent",
      isPlaceholder: true,
    },
  });
  expect(res.status()).toBe(200);
  const created = await res.json();
  expect(created.ok).toBe(true);

  try {
    const { data: after } = await db()
      .from("agm_resolution_versions").select("*").eq("id", placeholderId).single();
    expect(after).toEqual(before);
    expect(after.is_current).toBe(true);

    const { data: newRow } = await db()
      .from("agm_resolution_versions").select("is_current, version_label").eq("id", created.id).single();
    expect(newRow.is_current).toBe(false);
    // The admin interface has no label field - the client never sends one.
    // See autoLabel() in app/api/admin/resolution-versions/route.ts.
    expect(newRow.version_label).toMatch(/^Wording saved \d/);
  } finally {
    await deleteVersion(created.id);
  }
});

// ---------------------------------------------------------------------------
// 4. The one that matters most: saving new wording through the actual
//    "Change wording" -> "Save" -> "Yes, save" flow a volunteer uses does not
//    alter resolution_version_id on an existing signature. Previously this
//    drove the create and activate API routes directly; now it drives the
//    merged page, because that is the thing that changed.
// ---------------------------------------------------------------------------

test("saving new wording through the admin page does not alter an existing signature's wording binding", async ({ page, request }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const versionA = await insertVersion({
    version_label: "P3 test 4 - wording A",
    body: "Wording A body",
    declaration_text: "Wording A declaration",
    consent_text: "Wording A consent",
    is_placeholder: false, // signed against below - must be real content
  });
  await setCurrentDirect(versionA);
  await setConfig("resolution_open", "true");

  const email = `p3-versionid-${Date.now()}@example.com`;
  const marker = `P3SAVE${Date.now()}`;
  let newId: string | null = null;
  try {
    expect((await sign(request, validSignBody(email))).status()).toBe(200);

    const { data: signatureBefore } = await db()
      .from("agm_signatures").select("resolution_version_id").eq("email", email).single();
    expect(signatureBefore.resolution_version_id).toBe(versionA);

    // The gate does not need to stay open to edit wording.
    await setConfig("resolution_open", "false");

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    // domcontentloaded fires before this client component has hydrated, so a
    // click straight away can land on a button with no React handler
    // attached yet - same gotcha documented in
    // tests/agm-requisition-capture.spec.ts's CSV export test.
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    await page.getByRole("button", { name: "Change wording" }).click();
    await page.locator("#wf-body").fill(`RESOLUTION-${marker}`);
    await page.locator("#wf-declaration").fill(`DECLARATION-${marker}`);
    await page.locator("#wf-consent").fill(`CONSENT-${marker}`);
    // "This wording is final and signing may open" starts checked, since
    // wording A was saved as final - left as-is deliberately.

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(
      "This becomes what people sign from now on. Anyone who already signed keeps the old wording."
    )).toBeVisible();
    await page.getByRole("button", { name: "Yes, save" }).click();

    // The form calls onClose() then router.refresh() on success, which
    // brings back the "Change wording" button - a concrete signal to wait on
    // rather than a fixed delay.
    await expect(page.getByRole("button", { name: "Change wording" })).toBeVisible({ timeout: 15_000 });

    const { data: nowCurrent } = await db()
      .from("agm_resolution_versions").select("id, body").eq("is_current", true).single();
    expect(nowCurrent.body).toBe(`RESOLUTION-${marker}`);
    newId = nowCurrent.id;
    expect(newId).not.toBe(versionA);

    const { data: signatureAfter } = await db()
      .from("agm_signatures").select("resolution_version_id").eq("email", email).single();
    // Printed for the session report - this is the test that distinguishes a
    // wording history from a guarantee.
    console.log("TEST 4 RESULT: wording A =", versionA, "| new current (saved via the admin page) =", newId, "| signature.resolution_version_id after saving =", signatureAfter.resolution_version_id);
    expect(signatureAfter.resolution_version_id).toBe(versionA);
    expect(signatureAfter.resolution_version_id).not.toBe(newId);
  } finally {
    await cleanupSignature(email);
    await deleteVersion(versionA);
    if (newId) await deleteVersion(newId);
    await setConfig("resolution_open", "false");
  }
});

// ---------------------------------------------------------------------------
// 5. Public page renders the current wording's texts. Unaffected by the
//    admin redesign - this is app/resolution/page.tsx, not the admin page.
// ---------------------------------------------------------------------------

test("public page renders the current wording's resolution, declaration and consent text", async ({ page }) => {
  const marker = `P3RENDER${Date.now()}`;
  const id = await insertVersion({
    version_label: "P3 render probe",
    body: `RESOLUTION-${marker}`,
    declaration_text: `DECLARATION-${marker}`,
    consent_text: `CONSENT-${marker}`,
    is_placeholder: false,
  });
  await setCurrentDirect(id);
  await setConfig("resolution_open", "true");

  try {
    await page.goto("/resolution", { waitUntil: "domcontentloaded" });
    // The resolution/declaration/consent block only renders once the
    // shareholder branch is chosen.
    await page.getByRole("radio", { name: "Yes" }).first().check();
    // Scoped to the form, not the whole page.
    const formText = await page.locator("form").innerText();
    expect(formText).toContain(`RESOLUTION-${marker}`);
    expect(formText).toContain(`DECLARATION-${marker}`);
    expect(formText).toContain(`CONSENT-${marker}`);
  } finally {
    await setConfig("resolution_open", "false");
    await deleteVersion(id);
  }
});

// ---------------------------------------------------------------------------
// 6. Supporting statement: present renders, null does not. Unaffected by the
//    admin redesign.
// ---------------------------------------------------------------------------

test("supporting statement renders when set and is absent when null", async ({ page }) => {
  const withStatement = await insertVersion({
    version_label: "P3 statement present",
    body: "Body with statement",
    declaration_text: "Declaration with statement",
    consent_text: "Consent with statement",
    supporting_statement: "UNIQUE-STATEMENT-TEXT-12345",
    is_placeholder: false,
  });
  const withoutStatement = await insertVersion({
    version_label: "P3 statement absent",
    body: "Body without statement",
    declaration_text: "Declaration without statement",
    consent_text: "Consent without statement",
    supporting_statement: null,
    is_placeholder: false,
  });

  await setConfig("resolution_open", "true");
  try {
    await setCurrentDirect(withStatement);
    await page.goto("/resolution", { waitUntil: "domcontentloaded" });
    await page.getByRole("radio", { name: "Yes" }).first().check();
    let formText = await page.locator("form").innerText();
    expect(formText).toMatch(/supporting statement/i);
    expect(formText).toContain("UNIQUE-STATEMENT-TEXT-12345");

    await setCurrentDirect(withoutStatement);
    await page.goto("/resolution", { waitUntil: "domcontentloaded" });
    await page.getByRole("radio", { name: "Yes" }).first().check();
    formText = await page.locator("form").innerText();
    expect(formText).not.toMatch(/supporting statement/i);
  } finally {
    await setConfig("resolution_open", "false");
    await deleteVersion(withStatement);
    await deleteVersion(withoutStatement);
  }
});

// ---------------------------------------------------------------------------
// 7. Placeholder current: nothing signable on the public page, unchanged.
// ---------------------------------------------------------------------------

test("with the placeholder current, the public page offers no signing form regardless of gate state", async ({ page }) => {
  const placeholderId = await getPlaceholderId();
  await setCurrentDirect(placeholderId);
  await setConfig("resolution_open", "true");

  try {
    await page.goto("/resolution", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#fullName")).toHaveCount(0);
    await expect(page.getByText(/not been finalised|not open yet/i).first()).toBeVisible();
  } finally {
    await setConfig("resolution_open", "false");
  }
});

// ---------------------------------------------------------------------------
// 8. The signing state notice reflects gate state and finality correctly on
//    the merged admin page, in the new wording - "Shareholders", not
//    "Members"; "finalised", not "placeholder".
// ---------------------------------------------------------------------------

test("the signing state notice reflects gate and finality on the admin page", async ({ page }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const id = await insertVersion({
    version_label: "P3 notice check",
    body: "Notice check body",
    declaration_text: "Notice check declaration",
    consent_text: "Notice check consent",
    is_placeholder: false,
  });
  try {
    await setCurrentDirect(id);
    await setConfig("resolution_open", "true");
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Signing: OPEN\. Shareholders are signing/i)).toBeVisible();

    await setConfig("resolution_open", "false");
    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Signing: CLOSED\. Gate is closed\./i)).toBeVisible();

    await setCurrentDirect(await getPlaceholderId());
    await setConfig("resolution_open", "true");
    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/wording has not been finalised/i)).toBeVisible();
    await expect(page.getByText(/\bplaceholder\b/i)).toHaveCount(0);
  } finally {
    await setConfig("resolution_open", "false");
    await deleteVersion(id);
  }
});

// ---------------------------------------------------------------------------
// 9. No editable field for the four texts exists anywhere except inside the
//    open wording form - not in the collapsed state, not in the expanded
//    current wording, not in an expanded history entry.
// ---------------------------------------------------------------------------

test("no editable field for the four texts exists outside the wording form", async ({ page }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const marker = `P3HISTORYNOEDIT${Date.now()}`;
  const historyId = await insertVersion({
    version_label: `History check ${marker}`,
    body: `History body ${marker}`,
    declaration_text: "History declaration",
    consent_text: "History consent",
  });
  try {
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    // Nothing expanded yet.
    await expect(page.locator("textarea")).toHaveCount(0);

    // Reading the current wording in full must not introduce one either.
    await page.getByRole("button", { name: "Read in full" }).click();
    await expect(page.locator("textarea")).toHaveCount(0);

    // Nor does reading a history entry.
    await page.getByRole("button", { name: /Wording history/i }).click();
    await page.getByRole("button", { name: new RegExp(marker) }).click();
    await expect(page.getByText(`History body ${marker}`)).toBeVisible();
    await expect(page.locator("textarea")).toHaveCount(0);

    // Only the wording form introduces editable fields, and only while open.
    await page.getByRole("button", { name: "Change wording" }).click();
    await expect(page.locator("textarea")).toHaveCount(4);
  } finally {
    await deleteVersion(historyId);
  }
});

// ---------------------------------------------------------------------------
// 10. The redesign's central vocabulary rule, checked mechanically rather
//     than by eye: none of these words appear anywhere the page can render
//     them, including inside Wording History and the open wording form.
// ---------------------------------------------------------------------------

test("the words version, make current, duplicate, placeholder and activate appear nowhere in the rendered admin page", async ({ page }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  // Must run with a non-placeholder wording current, so the real seeded
  // placeholder sits in Wording History rather than being the (unlabelled)
  // current wording - its own label is exactly what this test has to catch,
  // and that label only ever renders as history-row text. Not guaranteed by
  // whatever a previous test left current: test 8 above deliberately leaves
  // the placeholder current, which would otherwise let this test pass
  // without ever exercising the one row most likely to still say the banned
  // word - see sql/agm-relabel-seed-placeholder.sql.
  const id = await insertVersion({
    version_label: "P3 banned words probe",
    body: "Banned words probe body",
    declaration_text: "Banned words probe declaration",
    consent_text: "Banned words probe consent",
    is_placeholder: false,
  });
  try {
    await setCurrentDirect(id);

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    await page.getByRole("button", { name: "Read in full" }).click();
    await page.getByRole("button", { name: /Wording history/i }).click();
    // The real placeholder must actually be present in that now-expanded
    // history list for this test to mean anything - confirms the setup
    // above worked, not just that the toggle opened.
    await expect(page.getByRole("button", { name: /pre-solicitor/i })).toBeVisible();
    await page.getByRole("button", { name: "Change wording" }).click();

    const bodyText = await page.locator("body").innerText();
    const banned = [/\bversion\b/i, /\bmake current\b/i, /\bduplicate\b/i, /\bplaceholder\b/i, /\bactivate\b/i];
    for (const pattern of banned) {
      expect(bodyText, `banned word matched: ${pattern}`).not.toMatch(pattern);
    }
  } finally {
    await deleteVersion(id);
  }
});
