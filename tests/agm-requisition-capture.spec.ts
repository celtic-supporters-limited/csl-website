/**
 * AGM requisition capture - Package 2 schema and validation.
 *
 * Covers POST /api/resolution/sign and POST /api/resolution/supporter against
 * the rebuilt agm_signatures schema.
 *
 * REQUIRES sql/agm-p2-requisition-schema.sql to have been run on the target
 * database. Without it every test fails at the first insert.
 *
 * These tests need a non-placeholder current resolution version, because the
 * API refuses to collect signatures while the placeholder is current. Setup
 * creates one, teardown removes it and restores the placeholder.
 *
 * SAFETY, read before changing beforeAll.
 *
 * beforeAll opens the requisition gate AND makes a non-placeholder version
 * current. Between those two statements and afterAll, the public form is live
 * and will accept real signatures against the test wording. The placeholder
 * guard does NOT cover this window, because the whole point of the setup is to
 * move off the placeholder.
 *
 * If the process is killed mid-run the target environment is left signable.
 * Recovery is two writes: set site_config.resolution_open = 'false', and set
 * is_current back to the placeholder version.
 *
 * The mitigation is that this suite refuses to run against production at all,
 * see the guard in beforeAll. On staging a stray open gate is recoverable and
 * the data is disposable.
 *
 * Gate state is global. Run with --workers=1 and not in parallel with
 * tests/site-gates.spec.ts.
 *
 * Run:
 *   npx playwright test tests/agm-requisition-capture.spec.ts --workers=1
 */

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.TEST_USER_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_USER_PASSWORD;

function db() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

// Prefixed so a row left behind by an interrupted run is identifiable on the
// admin Versions page, same convention as tests/agm-p3-resolution-content.spec.ts
// and tests/site-gates.spec.ts.
const TEST_VERSION_LABEL = "[TEST] Automated test version";
let testVersionId = "";
let previousGateValue: string | null = null;
let previousCurrentVersionId: string | null = null;

async function setConfig(key: string, value: string) {
  const { error } = await db()
    .from("site_config")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`setConfig ${key}: ${error.message}`);
}

async function setCurrentVersion(id: string) {
  // Partial unique index allows only one current row, so clear before setting.
  await db().from("agm_resolution_versions").update({ is_current: false }).eq("is_current", true);
  const { error } = await db().from("agm_resolution_versions").update({ is_current: true }).eq("id", id);
  if (error) throw new Error(`setCurrentVersion: ${error.message}`);
}

let ipCounter = 20;
const nextIp = () => `10.11.0.${ipCounter++}`;

function validBody(email: string, overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Gate Test Signatory",
    addressLine1: "12 Example Street",
    addressLine2: "",
    addressTown: "Glasgow",
    addressPostcode: "G1 1AA",
    email,
    howHeld: "direct",
    computershareSrn: "C0001234567",
    shareClass: "ORD",
    yearOfPurchase: "1994 or 1995 (flotation)",
    sharesHeld: "101-500",
    eligibilityConfirmed: true,
    resolutionSupported: true,
    consentGiven: true,
    signatureName: "Gate Test Signatory",
    turnstileToken: "test-token",
    ...overrides,
  };
}

async function sign(request: APIRequestContext, body: Record<string, unknown>) {
  return request.post("/api/resolution/sign", {
    data: body,
    headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
  });
}

async function fetchByEmail(email: string) {
  const { data } = await db().from("agm_signatures").select("*").eq("email", email).maybeSingle();
  return data;
}

async function cleanup(email: string) {
  await db().from("agm_signatures").delete().eq("email", email);
  await db().from("agm_supporters").delete().eq("email", email);
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
  // Wait for the redirect to settle before firing page.request.* calls - the
  // session cookie is not reliably attached until the client has actually
  // navigated to /member-portal.
  await page.waitForURL(/\/member-portal/, { timeout: 20_000 });
}

/** Reads the direct registered shareholder count from the admin redesign's
 * count block - see ResolutionAdminClient.tsx. The number and its "direct
 * registered shareholders" label are two separate lines now ("N of 100
 * needed to lodge" / "direct registered shareholders"), not one combined
 * sentence, so the number is read off the first line alone. There is no
 * longer a separate "Complete signatures" figure to read; that KPI card was
 * deleted in the redesign (docs/agm/CSL_AGM_AdminRedesign_ClaudeCode_Prompt.md
 * section 4), so this is the one number this test can still track. */
async function readDirectCount(page: Page): Promise<number> {
  const text = await page.getByText(/[\d,]+ of [\d,]+ needed to lodge/i).innerText();
  const match = text.match(/^([\d,]+) of/);
  if (!match) throw new Error(`Could not parse direct count from "${text}"`);
  return Number(match[1].replace(/,/g, ""));
}

/** Reads the completion count from the quiet qualifier line under the count
 * ("N record(s) need(s) completion · M supporter(s)..."). The clause is
 * omitted entirely when there is nothing to complete, so absence means 0 -
 * not a parse failure. Staging is never guaranteed to be at zero pre_rebuild
 * rows when this test starts, so the assertion this feeds has to be "went up
 * by exactly one", the same style already used for readDirectCount. */
async function readCompletionCount(page: Page): Promise<number> {
  const supporterLine = page.getByText(/supporters? recorded, who cannot sign/i);
  const text = await supporterLine.innerText();
  const match = text.match(/^([\d,]+) record/);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}

test.describe.configure({ mode: "serial" });

// Staging project ref. Not a secret: it is part of NEXT_PUBLIC_SUPABASE_URL and
// ships in the client bundle. An allowlist rather than a production deny-list,
// so that if the ref ever changes this fails loudly instead of quietly running
// somewhere it should not.
const STAGING_PROJECT_REF = "mixwriunejiaxbpgxqmp";

test.beforeAll(async () => {
  // This suite opens the requisition gate and moves off the placeholder
  // version, which makes the target briefly signable by the public. That is
  // acceptable on staging, where the data is disposable, and unacceptable
  // anywhere else.
  if (!SUPABASE_URL?.includes(STAGING_PROJECT_REF)) {
    throw new Error(
      `Refusing to run: this suite opens the requisition gate and must only target staging (${STAGING_PROJECT_REF}). ` +
      `Got ${SUPABASE_URL ?? "no NEXT_PUBLIC_SUPABASE_URL"}. ` +
      `If the staging project ref has changed, update STAGING_PROJECT_REF in this file.`
    );
  }

  // Capture whatever staging had before this suite touches it, so afterAll can
  // restore it rather than assuming a closed gate and a placeholder version -
  // staging may be mid-review with the gate open and a draft current.
  const { data: gateRow } = await db()
    .from("site_config")
    .select("value")
    .eq("key", "resolution_open")
    .maybeSingle();
  previousGateValue = gateRow?.value ?? null;

  const { data: currentVersion } = await db()
    .from("agm_resolution_versions")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  previousCurrentVersionId = currentVersion?.id ?? null;

  await setConfig("resolution_open", "true");
  await setConfig("agm_capture_signer_metadata", "false");

  const { data, error } = await db()
    .from("agm_resolution_versions")
    .insert({
      body:
        "AUTOMATED TEST VERSION - NOT A RESOLUTION. Created by " +
        "tests/agm-requisition-capture.spec.ts. If this text is visible on a " +
        "public page, a test run was interrupted: close the requisition gate " +
        "and make the placeholder version current again.",
      version_label: TEST_VERSION_LABEL,
      is_placeholder: false,
      // NOT NULL since Package 3. This suite predates that migration and
      // never picked up the new columns - the same staleness class as the
      // rest of this gap-fill session.
      declaration_text:
        "AUTOMATED TEST VERSION - NOT A DECLARATION. See body field.",
      consent_text: "AUTOMATED TEST VERSION - NOT A CONSENT STATEMENT. See body field.",
      created_by: "playwright",
    })
    .select("id")
    .single();
  if (error) throw new Error(`create test version: ${error.message}`);

  testVersionId = data.id;
  await setCurrentVersion(testVersionId);
});

test.afterAll(async () => {
  // Restore whatever was current before this suite ran, then remove the test
  // version. Order matters: a version with signatures against it cannot be
  // deleted. Falls back to the placeholder only if nothing was captured
  // (e.g. beforeAll itself failed before capture).
  let restoreId = previousCurrentVersionId;
  if (!restoreId) {
    const { data: placeholder } = await db()
      .from("agm_resolution_versions")
      .select("id")
      .eq("is_placeholder", true)
      .maybeSingle();
    restoreId = placeholder?.id ?? null;
  }
  if (restoreId) await setCurrentVersion(restoreId);

  if (testVersionId) {
    await db().from("agm_signatures").delete().eq("resolution_version_id", testVersionId);
    await db().from("agm_resolution_versions").delete().eq("id", testVersionId);
  }
  await setConfig("agm_capture_signer_metadata", "false");
  await setConfig("resolution_open", previousGateValue ?? "false");
});

// ---------------------------------------------------------------------------
// 1. Valid submission stores exactly what was submitted
// ---------------------------------------------------------------------------

test("valid direct holder submission stores the submitted values", async ({ request }) => {
  const email = `p2-valid-${Date.now()}@example.com`;
  try {
    const res = await sign(request, validBody(email));
    expect(res.status()).toBe(200);

    const row = await fetchByEmail(email);
    expect(row).toBeTruthy();
    expect(row.address_line_1).toBe("12 Example Street");
    expect(row.address_town).toBe("Glasgow");
    expect(row.address_postcode).toBe("G1 1AA");
    expect(row.share_class).toBe("ORD");
    expect(row.how_held).toBe("direct");
    expect(row.computershare_srn).toBe("C0001234567");
    expect(row.shareholder_tag).toBe("direct-registered");
    expect(row.capture_status).toBe("complete");
    // Consent recorded from the submitted value, not hardcoded.
    expect(row.consent_given).toBe(true);
    expect(row.eligibility_confirmed).toBe(true);
    expect(row.resolution_supported).toBe(true);
    // Item 9: the signature is bound to a resolution version.
    expect(row.resolution_version_id).toBe(testVersionId);
    expect(row.privacy_policy_version).toBeTruthy();
  } finally {
    await cleanup(email);
  }
});

// ---------------------------------------------------------------------------
// 2-5. Validation
// ---------------------------------------------------------------------------

test("direct holder with no SRN is rejected", async ({ request }) => {
  const email = `p2-nosrn-${Date.now()}@example.com`;
  const res = await sign(request, validBody(email, { computershareSrn: "" }));
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/reference number is required/i);
  expect(await fetchByEmail(email)).toBeNull();
});

test("nominee holder with no platform is rejected", async ({ request }) => {
  const email = `p2-noplat-${Date.now()}@example.com`;
  const res = await sign(request, validBody(email, {
    howHeld: "nominee", computershareSrn: "", nomineePlatform: "",
  }));
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/select the platform/i);
  expect(await fetchByEmail(email)).toBeNull();
});

test("share class outside the enum is rejected", async ({ request }) => {
  const email = `p2-badclass-${Date.now()}@example.com`;
  const res = await sign(request, validBody(email, { shareClass: "PREF" }));
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/share class/i);
  expect(await fetchByEmail(email)).toBeNull();
});

test("dropdown value outside the configured list is rejected", async ({ request }) => {
  const email = `p2-badyear-${Date.now()}@example.com`;
  const res = await sign(request, validBody(email, { yearOfPurchase: "1066" }));
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/select a year from the list/i);
  expect(await fetchByEmail(email)).toBeNull();
});

test("nominee platform outside the configured list is rejected", async ({ request }) => {
  const email = `p2-badplat-${Date.now()}@example.com`;
  const res = await sign(request, validBody(email, {
    howHeld: "nominee", computershareSrn: "", nomineePlatform: "Not A Real Broker",
  }));
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/select a platform from the list/i);
  expect(await fetchByEmail(email)).toBeNull();
});

// ---------------------------------------------------------------------------
// 6. Non-shareholders never reach agm_signatures
// ---------------------------------------------------------------------------

test("supporter path writes to agm_supporters and not agm_signatures", async ({ request }) => {
  const email = `p2-supporter-${Date.now()}@example.com`;
  try {
    const res = await request.post("/api/resolution/supporter", {
      data: { fullName: "Not A Shareholder", email, consentGiven: true, turnstileToken: "test-token" },
      headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
    });
    expect(res.status()).toBe(200);

    expect(await fetchByEmail(email)).toBeNull();

    const { data: supporter } = await db()
      .from("agm_supporters").select("*").eq("email", email).maybeSingle();
    expect(supporter).toBeTruthy();
    expect(supporter.consent_given).toBe(true);
  } finally {
    await cleanup(email);
  }
});

test("supporter path requires consent", async ({ request }) => {
  const email = `p2-noconsent-${Date.now()}@example.com`;
  const res = await request.post("/api/resolution/supporter", {
    data: { fullName: "No Consent", email, consentGiven: false, turnstileToken: "test-token" },
    headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
  });
  expect(res.status()).toBe(400);

  // Every other validation test in this file confirms rejection means no row
  // written. This one only checked the status code.
  const { data: supporter } = await db()
    .from("agm_supporters").select("id").eq("email", email).maybeSingle();
  expect(supporter).toBeNull();
});

// ---------------------------------------------------------------------------
// 7. signed_at is server-generated
// ---------------------------------------------------------------------------

test("client-supplied signedAt is ignored", async ({ request }) => {
  const email = `p2-signedat-${Date.now()}@example.com`;
  try {
    const before = Date.now();
    const res = await sign(request, validBody(email, { signedAt: "1999-01-01T00:00:00.000Z" }));
    expect(res.status()).toBe(200);

    const row = await fetchByEmail(email);
    const stored = new Date(row.signed_at).getTime();
    expect(stored).toBeGreaterThanOrEqual(before - 60_000);
    expect(new Date(row.signed_at).getUTCFullYear()).not.toBe(1999);
  } finally {
    await cleanup(email);
  }
});

// ---------------------------------------------------------------------------
// 8. Signer metadata capture flag
// ---------------------------------------------------------------------------

test("signer metadata is captured only while the flag is on", async ({ request }) => {
  const offEmail = `p2-ipoff-${Date.now()}@example.com`;
  const onEmail  = `p2-ipon-${Date.now()}@example.com`;
  try {
    await setConfig("agm_capture_signer_metadata", "false");
    await new Promise((r) => setTimeout(r, 1500));
    expect((await sign(request, validBody(offEmail))).status()).toBe(200);
    const offRow = await fetchByEmail(offEmail);
    expect(offRow.signer_ip).toBeNull();
    expect(offRow.signer_user_agent).toBeNull();

    await setConfig("agm_capture_signer_metadata", "true");
    await new Promise((r) => setTimeout(r, 1500));
    expect((await sign(request, validBody(onEmail))).status()).toBe(200);
    const onRow = await fetchByEmail(onEmail);
    expect(onRow.signer_ip).not.toBeNull();
  } finally {
    await setConfig("agm_capture_signer_metadata", "false");
    await cleanup(offEmail);
    await cleanup(onEmail);
  }
});

// ---------------------------------------------------------------------------
// 9. Version immutability. The one that matters most.
//
// version_label is deliberately excluded from this test's immutability
// assertion. The AGM admin redesign carved version_label out of the
// immutability trigger (sql/agm-p3-amend-editable-label.sql, run against
// staging) because it is metadata nobody signs, not evidence of what a
// signatory saw - the redesign later deleted the inline label-edit interface
// entirely, but the trigger amendment underneath it was not reverted, so a
// label remains editable at the database level even with no UI to edit it
// through. body is what a signature is evidence of and stays immutable and
// unconditional, exactly as before.
// ---------------------------------------------------------------------------

test("resolution version body cannot be edited; label can", async () => {
  const { error: bodyErr } = await db()
    .from("agm_resolution_versions")
    .update({ body: "tampered" })
    .eq("id", testVersionId);
  expect(bodyErr).not.toBeNull();

  const { error: labelErr } = await db()
    .from("agm_resolution_versions")
    .update({ version_label: "tampered" })
    .eq("id", testVersionId);
  expect(labelErr).toBeNull();

  // Restore, so later tests and reports in this file keep seeing the label
  // they expect.
  await db()
    .from("agm_resolution_versions")
    .update({ version_label: TEST_VERSION_LABEL })
    .eq("id", testVersionId);

  const { data: unchanged } = await db()
    .from("agm_resolution_versions").select("body, version_label").eq("id", testVersionId).single();
  expect(unchanged.body).not.toBe("tampered");
  expect(unchanged.version_label).toBe(TEST_VERSION_LABEL);
});

test("a version with signatures against it cannot be deleted", async ({ request }) => {
  const email = `p2-fk-${Date.now()}@example.com`;
  try {
    expect((await sign(request, validBody(email))).status()).toBe(200);

    const { error } = await db()
      .from("agm_resolution_versions").delete().eq("id", testVersionId);
    expect(error).not.toBeNull();

    const { data: still } = await db()
      .from("agm_resolution_versions").select("id").eq("id", testVersionId).maybeSingle();
    expect(still).toBeTruthy();
  } finally {
    await cleanup(email);
  }
});

test("is_current can still flip", async () => {
  const { data: placeholder } = await db()
    .from("agm_resolution_versions").select("id").eq("is_placeholder", true).maybeSingle();
  expect(placeholder).toBeTruthy();

  await setCurrentVersion(placeholder.id);
  const { data: nowCurrent } = await db()
    .from("agm_resolution_versions").select("id").eq("is_current", true).single();
  expect(nowCurrent.id).toBe(placeholder.id);

  await setCurrentVersion(testVersionId);
});

// ---------------------------------------------------------------------------
// 10. Placeholder guard
// ---------------------------------------------------------------------------

test("no signature can be collected while the placeholder is current", async ({ request }) => {
  const email = `p2-placeholder-${Date.now()}@example.com`;
  const { data: placeholder } = await db()
    .from("agm_resolution_versions").select("id").eq("is_placeholder", true).maybeSingle();

  try {
    await setCurrentVersion(placeholder.id);
    await new Promise((r) => setTimeout(r, 1000));

    const res = await sign(request, validBody(email));
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toMatch(/not been finalised|not open yet/i);
    expect(await fetchByEmail(email)).toBeNull();
  } finally {
    await setCurrentVersion(testVersionId);
    await cleanup(email);
  }
});

// ---------------------------------------------------------------------------
// 11. pre_rebuild rows are excluded from the qualifying count
// ---------------------------------------------------------------------------

test("pre_rebuild rows do not count toward the target, per the rendered admin page", async ({ page, request }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const completeEmail = `p2-count-complete-${Date.now()}@example.com`;
  const preEmail      = `p2-count-pre-${Date.now()}@example.com`;
  try {
    // Baseline from the actual rendered page, before either row exists, so
    // the assertion is "went up by exactly one", not a hardcoded absolute
    // count that depends on whatever else is on staging.
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    const directBefore = await readDirectCount(page);
    const completionBefore = await readCompletionCount(page);

    expect((await sign(request, validBody(completeEmail))).status()).toBe(200);

    // Insert a pre_rebuild row directly: the API never produces one. Carries
    // an SRN deliberately, so the row's own gap is the wording-version
    // binding it predates, not a missing SRN - see rowStatus() in
    // ResolutionAdminClient.tsx, which checks SRN first and would otherwise
    // report the wrong reason.
    const { error } = await db().from("agm_signatures").insert({
      full_name: "Preserved Row",
      email: preEmail,
      how_held: "direct",
      computershare_srn: "C0009999999",
      consent_given: true,
      signature_name: "Preserved Row",
      signed_at: new Date().toISOString(),
      capture_status: "pre_rebuild",
      shareholder_tag: "direct-registered",
      member_tag: "member",
    });
    expect(error).toBeNull();

    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });

    // Both rows are direct-registered, but only the complete one may count.
    // This reads the app's own count, via the rendered page, rather than
    // re-deriving the filter in the test and asserting on the test's own
    // arithmetic - it fails if the app's counting logic changes. There is no
    // separate "complete signatures" figure any more - that KPI card was
    // deleted in the admin redesign - so direct count is the only number
    // this test can still track.
    expect(await readDirectCount(page)).toBe(directBefore + 1);

    // The completion count is a quiet qualifier line under the count now,
    // not a banner - see the redesign's "Delete" list section 4. Read as a
    // delta, the same style as directCount above, since staging is not
    // guaranteed to start this test at zero pre_rebuild rows.
    expect(await readCompletionCount(page)).toBe(completionBefore + 1);

    // The table is a collapsed disclosure by default - expand it before
    // looking for row content. domcontentloaded fires before this client
    // component has hydrated, so a click straight away can land on a button
    // with no React handler attached yet - same gotcha as the CSV export
    // test below.
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    await page.getByRole("button", { name: /Who has signed/i }).click();

    // Each row's own Status cell is specific to what is actually wrong with
    // it, not a generic "needs completion" - the preserved row has an SRN,
    // so what is wrong is that it predates the wording binding and the
    // person has to sign again; the fresh row is simply complete.
    const preRow = page.locator("tr", { hasText: preEmail });
    await expect(preRow.getByText("Needs to re-sign")).toBeVisible();

    const completeRow = page.locator("tr", { hasText: completeEmail });
    await expect(completeRow.getByText("Complete", { exact: true })).toBeVisible();
  } finally {
    await cleanup(completeEmail);
    await cleanup(preEmail);
  }
});

// ---------------------------------------------------------------------------
// 12. CSV export - Package 2 spec item 11, never written until now.
// ---------------------------------------------------------------------------

test("CSV export contains every schema column and distinguishes pre_rebuild rows", async ({ page, request }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const completeEmail = `p2-csv-complete-${Date.now()}@example.com`;
  const preEmail      = `p2-csv-pre-${Date.now()}@example.com`;
  try {
    expect((await sign(request, validBody(completeEmail))).status()).toBe(200);

    const { error } = await db().from("agm_signatures").insert({
      full_name: "CSV Preserved Row",
      email: preEmail,
      how_held: "direct",
      computershare_srn: "C0008888888",
      consent_given: true,
      signature_name: "CSV Preserved Row",
      signed_at: new Date().toISOString(),
      capture_status: "pre_rebuild",
      shareholder_tag: "direct-registered",
      member_tag: "member",
    });
    expect(error).toBeNull();

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    // Capture the Blob passed to URL.createObjectURL instead of waiting for a
    // real browser download: downloadCsv() builds the CSV entirely client-side
    // via a Blob + a synthetic anchor click, and some Chromium builds (this
    // sandbox included) never surface that as a "download" event even though
    // the click and the Blob are completely real. Installed before navigation
    // so it is in place before the page's own scripts run.
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      (window as unknown as { __capturedBlob?: Blob }).__capturedBlob = undefined;
      URL.createObjectURL = (obj: Blob) => {
        (window as unknown as { __capturedBlob?: Blob }).__capturedBlob = obj;
        return orig(obj);
      };
    });

    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    // domcontentloaded fires before this client component has hydrated, so a
    // click straight away can land on a button with no React handler attached
    // yet. Every other test in this file only reads already-rendered text and
    // never needed to wait for hydration; this is the first one that clicks
    // something.
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    // There are now two "Export CSV" buttons on the page - Who has signed's
    // and Registered Support's - so a bare role query is ambiguous. The
    // signature export's button is the sibling of the "Who has signed"
    // toggle in the same row.
    await page.getByRole("button", { name: /^Who has signed/ })
      .locator("xpath=following-sibling::button[1]")
      .click();

    const csv = await page.evaluate(async () => {
      const blob = (window as unknown as { __capturedBlob?: Blob }).__capturedBlob;
      if (!blob) throw new Error("Export CSV did not create a Blob via URL.createObjectURL");
      return blob.text();
    });

    const lines = csv.split("\r\n").filter(Boolean);
    const [headerLine, ...dataLines] = lines;
    const headers = headerLine.split(",");

    // Every column ResolutionAdminClient.tsx's downloadCsv() emits, in order.
    // Package 2 spec item 11 asked for this list; this is the first time it
    // has been asserted against.
    expect(headers).toEqual([
      "id", "capture_status", "created_at", "signed_at", "full_name", "email",
      "address_line_1", "address_line_2", "address_town", "address_postcode",
      "how_held", "computershare_srn", "nominee_platform", "nominee_platform_other",
      "year_of_purchase", "shares_held", "share_class", "eligibility_confirmed",
      "resolution_supported", "consent_given", "privacy_policy_version",
      "resolution_version_id", "resolution_version_label", "signature_name",
      "signer_ip", "signer_user_agent", "shareholder_tag", "member_tag",
    ]);

    const emailIdx = headers.indexOf("email");
    const captureStatusIdx = headers.indexOf("capture_status");

    // Plain split, not an RFC 4180 parser: none of the values in this test
    // contain a comma or a quote, so it is not needed here.
    const rows = dataLines.map((line) => line.split(","));
    const preRow = rows.find((cols) => cols[emailIdx] === preEmail);
    const completeRow = rows.find((cols) => cols[emailIdx] === completeEmail);

    expect(preRow).toBeTruthy();
    expect(completeRow).toBeTruthy();
    // Scoped to the capture_status column specifically, not a whole-row
    // substring check, so this cannot pass because some other column
    // happened to contain the word.
    expect(preRow![captureStatusIdx]).toBe("pre_rebuild");
    expect(completeRow![captureStatusIdx]).toBe("complete");
  } finally {
    await cleanup(completeEmail);
    await cleanup(preEmail);
  }
});

// ---------------------------------------------------------------------------
// 13. Registered Support - a non-shareholder supporter appears in the
//     Registered Support list and its own export, and never in the
//     signature export. That export is the lodgement document and must
//     contain only people who have actually signed the requisition.
// ---------------------------------------------------------------------------

test("a supporter appears in Registered Support and its export, never in the signature export", async ({ page, request }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const supporterEmail = `p2-regsupport-${Date.now()}@example.com`;
  try {
    const res = await request.post("/api/resolution/supporter", {
      data: { fullName: "Registered Support Check", email: supporterEmail, consentGiven: true, turnstileToken: "test-token" },
      headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
    });
    expect(res.status()).toBe(200);

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      (window as unknown as { __capturedBlob?: Blob }).__capturedBlob = undefined;
      URL.createObjectURL = (obj: Blob) => {
        (window as unknown as { __capturedBlob?: Blob }).__capturedBlob = obj;
        return orig(obj);
      };
    });

    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    // Expand Registered Support and confirm the row is visible - the point
    // of this feature is that a volunteer can see who this person is, not
    // just a count.
    await page.getByRole("button", { name: /^Registered Support/ }).click();
    const supporterRow = page.locator("tr", { hasText: supporterEmail });
    await expect(supporterRow).toBeVisible();
    await expect(supporterRow.getByText("Registered Support Check")).toBeVisible();

    // Registered Support's own export contains the supporter.
    await page.getByRole("button", { name: /^Registered Support/ })
      .locator("xpath=following-sibling::button[1]")
      .click();
    const supportersCsv = await page.evaluate(async () => {
      const blob = (window as unknown as { __capturedBlob?: Blob }).__capturedBlob;
      if (!blob) throw new Error("Registered Support export did not create a Blob via URL.createObjectURL");
      return blob.text();
    });
    expect(supportersCsv).toContain(supporterEmail);
    expect(supportersCsv).toContain("Registered Support Check");
    // Exactly the columns Registered Support has data for - no shareholding
    // fields exist to include.
    const supportersHeaders = supportersCsv.split("\r\n")[0].split(",");
    expect(supportersHeaders).toEqual([
      "id", "created_at", "full_name", "email", "consent_given", "privacy_policy_version",
    ]);

    // The signature export - a separate download, a separate file - never
    // contains this person. Reset the capture before triggering it, so a
    // stale supporters Blob from the click above cannot be misread as the
    // signature export succeeding.
    await page.evaluate(() => {
      (window as unknown as { __capturedBlob?: Blob }).__capturedBlob = undefined;
    });
    await page.getByRole("button", { name: /^Who has signed/ })
      .locator("xpath=following-sibling::button[1]")
      .click();
    const signaturesCsv = await page.evaluate(async () => {
      const blob = (window as unknown as { __capturedBlob?: Blob }).__capturedBlob;
      if (!blob) throw new Error("Export CSV did not create a Blob via URL.createObjectURL");
      return blob.text();
    });
    expect(signaturesCsv).not.toContain(supporterEmail);
  } finally {
    await db().from("agm_supporters").delete().eq("email", supporterEmail);
  }
});
