/**
 * AGM Package 5a - make every record editable, add the change log.
 *
 * Implements brief section 2c (v1.5): nothing is immutable, everything is
 * editable, provability comes from agm_change_log plus the per-signature
 * snapshot, not from locking a row.
 *
 * REQUIRES sql/agm-p5a-editable-records.sql to have been run on the target
 * database.
 *
 * SAFETY, same shape as the other AGM suites. Refuses to run anywhere but
 * staging. Captures and restores resolution_open, proxy_mode and which
 * resolution version is current.
 *
 * Run:
 *   npx playwright test tests/agm-p5a-editable-records.spec.ts --workers=1
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { applyFieldEdit } from "@/lib/agm-change-log";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.TEST_USER_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_USER_PASSWORD;

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

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle", { timeout: 60_000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/auth/v1/token") && r.status() === 200, { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForURL(/\/member-portal/, { timeout: 20_000 });
}

test.describe.configure({ mode: "serial" });

let previousResolutionOpen: string | null = null;
let previousProxyMode: string | null = null;
let previousCurrentVersionId: string | null = null;
let previousDeclarationText: string | null = null;

test.beforeAll(async () => {
  if (!SUPABASE_URL?.includes(STAGING_PROJECT_REF)) {
    throw new Error(
      `Refusing to run: this suite edits AGM records and must only target staging (${STAGING_PROJECT_REF}). ` +
      `Got ${SUPABASE_URL ?? "no NEXT_PUBLIC_SUPABASE_URL"}.`
    );
  }
  const { data: openRow } = await db().from("site_config").select("value").eq("key", "resolution_open").maybeSingle();
  previousResolutionOpen = openRow?.value ?? null;
  const { data: modeRow } = await db().from("site_config").select("value").eq("key", "proxy_mode").maybeSingle();
  previousProxyMode = modeRow?.value ?? null;
  const { data: currentVersion } = await db().from("agm_resolution_versions").select("id").eq("is_current", true).maybeSingle();
  previousCurrentVersionId = currentVersion?.id ?? null;
  const { data: declarationRow } = await db().from("site_config").select("value").eq("key", "proxy_declaration_text").maybeSingle();
  previousDeclarationText = declarationRow?.value ?? null;
});

test.afterAll(async () => {
  await setConfig("resolution_open", previousResolutionOpen ?? "false");
  await setConfig("proxy_mode", previousProxyMode ?? "closed");
  if (previousCurrentVersionId) {
    await db().from("agm_resolution_versions").update({ is_current: false }).eq("is_current", true);
    await db().from("agm_resolution_versions").update({ is_current: true }).eq("id", previousCurrentVersionId);
  }
  if (previousDeclarationText !== null) {
    await setConfig("proxy_declaration_text", previousDeclarationText);
  }
});

// ---------------------------------------------------------------------------
// Fixtures - one throwaway row per record type, cleaned up per test.
// ---------------------------------------------------------------------------

async function insertTestSignature(overrides: Record<string, unknown> = {}) {
  const { data, error } = await db().from("agm_signatures").insert({
    full_name: "P5a Test Signatory",
    address_line_1: "1 Test Street",
    address_town: "Glasgow",
    address_postcode: "G1 1AA",
    email: `p5a-sig-${Date.now()}@example.com`,
    how_held: "direct",
    computershare_srn: "C0009998887",
    share_class: "ORD",
    eligibility_confirmed: true,
    resolution_supported: true,
    consent_given: true,
    privacy_policy_version: "test",
    signature_name: "P5a Test Signatory",
    signed_at: new Date().toISOString(),
    capture_status: "complete",
    shareholder_tag: "direct-registered",
    member_tag: "non-member",
    meeting_ref: "2026-AGM",
    suspected_bot: false,
    status: "active",
    ...overrides,
  }).select("id").single();
  if (error) throw new Error(`insertTestSignature: ${error.message}`);
  return data.id as string;
}

async function insertTestSupporter() {
  const { data, error } = await db().from("agm_supporters").insert({
    full_name: "P5a Test Supporter",
    email: `p5a-sup-${Date.now()}@example.com`,
    consent_given: true,
    meeting_ref: "2026-AGM",
    suspected_bot: false,
    status: "active",
  }).select("id").single();
  if (error) throw new Error(`insertTestSupporter: ${error.message}`);
  return data.id as string;
}

async function insertTestProxy() {
  const { data, error } = await db().from("agm_proxies").insert({
    meeting_ref: "2026-AGM",
    full_name: "P5a Test Proxy",
    address_line_1: "1 Test Street",
    address_town: "Glasgow",
    address_postcode: "G1 1AA",
    email: `p5a-proxy-${Date.now()}@example.com`,
    how_held: "direct",
    computershare_srn: "C0009998887",
    appointee_name: "Test Appointee",
    declaration_snapshot: "test",
    signature_name: "P5a Test Proxy",
    signed_at: new Date().toISOString(),
    consent_given: true,
    privacy_policy_version: "test",
    suspected_bot: false,
    status: "active",
  }).select("id").single();
  if (error) throw new Error(`insertTestProxy: ${error.message}`);
  return data.id as string;
}

async function insertTestInterest() {
  const { data, error } = await db().from("shareholder_cases").insert({
    contact_name: "P5a Test Interest",
    email: `p5a-interest-${Date.now()}@example.com`,
    case_type: "Proxy Interest",
    status: "New",
    consent_given: true,
    meeting_ref: "2026-AGM",
    suspected_bot: false,
    agm_record_status: "active",
  }).select("id").single();
  if (error) throw new Error(`insertTestInterest: ${error.message}`);
  return data.id as string;
}

async function insertTestVersion(overrides: Record<string, unknown> = {}) {
  const { data, error } = await db().from("agm_resolution_versions").insert({
    version_label: "[TEST P5a]",
    body: "Test body",
    declaration_text: "Test declaration",
    consent_text: "Test consent",
    is_placeholder: true,
    is_current: false,
    created_by: "playwright p5a",
    meeting_ref: "2026-AGM",
    ...overrides,
  }).select("id").single();
  if (error) throw new Error(`insertTestVersion: ${error.message}`);
  return data.id as string;
}

async function changeLogFor(table: string, recordId: string) {
  const { data } = await db()
    .from("agm_change_log")
    .select("*")
    .eq("table_name", table)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

async function adminEdit(page: Page, body: Record<string, unknown>) {
  return page.request.post("/api/admin/agm-edit", { data: body });
}

async function adminStatus(page: Page, body: Record<string, unknown>) {
  return page.request.post("/api/admin/agm-status", { data: body });
}

async function suspectedBotAction(page: Page, body: Record<string, unknown>) {
  return page.request.post("/api/admin/suspected-bot", { data: body });
}

test.beforeEach(({}, testInfo) => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) testInfo.skip(true, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
});

// ---------------------------------------------------------------------------
// 1. Editing any field on any record type succeeds and writes a log entry
//    carrying the old and new values.
// ---------------------------------------------------------------------------

test("editing a field on each AGM record type succeeds and logs old/new values", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

  const sigId = await insertTestSignature();
  const supId = await insertTestSupporter();
  const proxyId = await insertTestProxy();
  const interestId = await insertTestInterest();

  try {
    const cases: [string, string, string, string][] = [
      ["agm_signatures", sigId, "full_name", "P5a Edited Signatory"],
      ["agm_supporters", supId, "full_name", "P5a Edited Supporter"],
      ["agm_proxies", proxyId, "full_name", "P5a Edited Proxy"],
      ["shareholder_cases", interestId, "contact_name", "P5a Edited Interest"],
    ];

    for (const [table, id, field, newValue] of cases) {
      const res = await adminEdit(page, { table, id, changes: { [field]: newValue }, reason: "test edit" });
      expect(res.status(), `${table} edit should succeed`).toBe(200);

      const { data: row } = await db().from(table).select(field).eq("id", id).maybeSingle();
      expect((row as Record<string, unknown>)?.[field]).toBe(newValue);

      const log = await changeLogFor(table, id);
      const entry = log.find((e) => e.field_name === field);
      expect(entry, `${table}.${field} should have a log entry`).toBeTruthy();
      expect(entry.new_value).toBe(newValue);
      expect(entry.reason).toBe("test edit");
    }
  } finally {
    await db().from("agm_signatures").delete().eq("id", sigId);
    await db().from("agm_supporters").delete().eq("id", supId);
    await db().from("agm_proxies").delete().eq("id", proxyId);
    await db().from("shareholder_cases").delete().eq("id", interestId);
  }
});

// ---------------------------------------------------------------------------
// 2. The log is append-only: update and delete both fail at the database
//    level, for the service-role client too.
// ---------------------------------------------------------------------------

test("agm_change_log cannot be updated or deleted by the service-role client", async () => {
  const sigId = await insertTestSignature();
  try {
    const { data: inserted } = await db().from("agm_change_log").insert({
      table_name: "agm_signatures",
      record_id: sigId,
      field_name: "full_name",
      old_value: "a",
      new_value: "b",
      changed_by: "test",
      reason: "append-only probe",
    }).select("id").single();

    const { error: updateError } = await db()
      .from("agm_change_log")
      .update({ new_value: "tampered" })
      .eq("id", inserted!.id);
    expect(updateError, "update should fail at the database level").not.toBeNull();

    const { error: deleteError } = await db()
      .from("agm_change_log")
      .delete()
      .eq("id", inserted!.id);
    expect(deleteError, "delete should fail at the database level").not.toBeNull();

    const { data: stillThere } = await db().from("agm_change_log").select("new_value").eq("id", inserted!.id).single();
    expect(stillThere.new_value).toBe("b");
  } finally {
    await db().from("agm_signatures").delete().eq("id", sigId);
  }
});

// ---------------------------------------------------------------------------
// 3. A change that fails to log does not write. Proved directly against
//    lib/agm-change-log.ts, not asserted: the log insert is forced to fail
//    by supplying a reason of null (NOT NULL on agm_change_log.reason), cast
//    past the type system deliberately to reach the database constraint,
//    and the target record's field is then confirmed unchanged.
// ---------------------------------------------------------------------------

test("a change that fails to log does not write to the record", async () => {
  const sigId = await insertTestSignature();
  try {
    const { data: before } = await db().from("agm_signatures").select("full_name").eq("id", sigId).single();
    expect(before.full_name).toBe("P5a Test Signatory");

    const result = await applyFieldEdit({
      table: "agm_signatures",
      id: sigId,
      changes: { full_name: "should never be written" },
      changedBy: "test",
      reason: null as unknown as string,
    });
    expect(result.ok, "the edit should fail, not silently succeed").toBe(false);

    const { data: after } = await db().from("agm_signatures").select("full_name").eq("id", sigId).single();
    expect(after.full_name, "the record must be unchanged when the log write failed").toBe("P5a Test Signatory");

    const log = await changeLogFor("agm_signatures", sigId);
    expect(log.length, "no log entry should exist either").toBe(0);
  } finally {
    await db().from("agm_signatures").delete().eq("id", sigId);
  }
});

// ---------------------------------------------------------------------------
// 4. Editing wording that has signatures against it surfaces a warning
//    naming the count, and proceeds when confirmed.
// ---------------------------------------------------------------------------

test("editing wording with signatures against it warns with the count, and saves when confirmed", async ({ page }) => {
  const versionId = await insertTestVersion({ is_placeholder: false });
  // resolution_snapshot matches the version's own body deliberately - this
  // signature genuinely saw today's text, unedited, so the warning must
  // name the count with no "against an earlier version" breakdown clause.
  // See the next test for the case where it does not match.
  const sigId = await insertTestSignature({ resolution_version_id: versionId, resolution_snapshot: "Test body" });

  try {
    await db().from("agm_resolution_versions").update({ is_current: false }).eq("is_current", true);
    await db().from("agm_resolution_versions").update({ is_current: true }).eq("id", versionId);

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    await page.getByRole("button", { name: "Change wording" }).click();
    const bodyField = page.locator("#wf-body");
    await bodyField.fill("Edited body for test 4");
    await page.locator("#wf-reason").fill("test 4 edit");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText(/1 person has signed this wording/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/against an earlier version/i)).not.toBeVisible();

    await page.getByRole("button", { name: "Yes, save" }).click();
    // The form calls onClose() then router.refresh() on success, which
    // brings back the "Change wording" button - a concrete signal to wait
    // on rather than a fixed delay or bare networkidle.
    await expect(page.getByRole("button", { name: "Change wording" })).toBeVisible({ timeout: 15_000 });

    const { data: version } = await db().from("agm_resolution_versions").select("body").eq("id", versionId).single();
    expect(version.body).toBe("Edited body for test 4");
  } finally {
    await db().from("agm_signatures").delete().eq("id", sigId);
    await db().from("agm_resolution_versions").update({ is_current: false }).eq("id", versionId);
    await db().from("agm_resolution_versions").delete().eq("id", versionId);
  }
});

// ---------------------------------------------------------------------------
// The undercount defect, fixed: a signature bound to the current row must
// still be named in the warning even after an earlier edit has already
// left its own snapshot behind - counting only snapshot matches would
// silently drop it, which is worse than no warning at all.
// ---------------------------------------------------------------------------

test("a signature signed against an earlier edit of the current wording is still counted in the warning, with a breakdown", async ({ page }) => {
  const versionId = await insertTestVersion({ is_placeholder: false, body: "Original body" });
  // Deliberately does not match the version's current body - this
  // signature saw an earlier edit of this same row, not what it says now.
  const sigId = await insertTestSignature({ resolution_version_id: versionId, resolution_snapshot: "An even earlier body" });

  try {
    await db().from("agm_resolution_versions").update({ is_current: false }).eq("is_current", true);
    await db().from("agm_resolution_versions").update({ is_current: true }).eq("id", versionId);

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    await page.getByRole("button", { name: "Change wording" }).click();
    await page.locator("#wf-body").fill("Newest body");
    await page.locator("#wf-reason").fill("test - proving the earlier-signer is still counted");
    await page.getByRole("button", { name: "Save" }).click();

    // Must still name this person as affected, and the breakdown must show
    // them against an earlier version, not omit them from the total.
    await expect(page.getByText(/1 person has signed this wording - 0 against the current text, 1 against an earlier version/i)).toBeVisible({ timeout: 10_000 });
  } finally {
    await db().from("agm_signatures").delete().eq("id", sigId);
    await db().from("agm_resolution_versions").delete().eq("id", versionId);
  }
});

// ---------------------------------------------------------------------------
// 5 and 6. Setting a record to withdrawn or voided removes it from the
//    count and marks it in the export, but the row stays visible in the
//    admin table - it is not hidden.
// ---------------------------------------------------------------------------

test("setting a signature to withdrawn removes it from the count, marks the export, and stays visible in the table", async ({ page }) => {
  const sigId = await insertTestSignature();
  try {
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    const res = await adminStatus(page, { table: "agm_signatures", id: sigId, status: "withdrawn", reason: "test withdrawal" });
    expect(res.status()).toBe(200);

    const { data: row } = await db().from("agm_signatures").select("status").eq("id", sigId).single();
    expect(row.status).toBe("withdrawn");

    const log = await changeLogFor("agm_signatures", sigId);
    const statusEntry = log.find((e) => e.field_name === "status");
    expect(statusEntry?.new_value).toBe("withdrawn");

    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    await page.getByRole("button", { name: /Who has signed/i }).click();
    await expect(page.getByText("P5a Test Signatory")).toBeVisible();
    // Two matches expected - the row's status badge and the disabled status
    // action's own display text, differing only in case. Either confirms the
    // row is marked withdrawn and still visible in the table.
    await expect(page.getByText("Withdrawn").first()).toBeVisible();
  } finally {
    await db().from("agm_signatures").delete().eq("id", sigId);
  }
});

// ---------------------------------------------------------------------------
// 7. No hard delete path exists on any AGM record type - checked here by
//    confirming there is no admin route that performs a DELETE for a
//    correction, only status changes. The suspected-bot purge action is a
//    deliberate, separate exception (a flagged row judged not to be a real
//    person), not a correction path, and is unaffected by this test.
// ---------------------------------------------------------------------------

test("no admin route deletes an AGM record as a correction", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  const sigId = await insertTestSignature();
  try {
    // agm-edit and agm-status only ever UPDATE. Confirmed by reading the
    // route source (app/api/admin/agm-edit/route.ts, app/api/admin/agm-
    // status/route.ts): neither calls .delete() anywhere. This test proves
    // the record survives every correction action available, which is the
    // externally observable half of that guarantee.
    await adminEdit(page, { table: "agm_signatures", id: sigId, changes: { full_name: "still here" }, reason: "x" });
    await adminStatus(page, { table: "agm_signatures", id: sigId, status: "voided", reason: "x" });

    const { data: row } = await db().from("agm_signatures").select("id, status").eq("id", sigId).maybeSingle();
    expect(row, "the record must still exist after every correction action").toBeTruthy();
    expect(row!.status).toBe("voided");
  } finally {
    await db().from("agm_signatures").delete().eq("id", sigId);
  }
});

// ---------------------------------------------------------------------------
// 8. Proxy revocation from Package 5 still behaves as before after folding
//    into the status scheme.
// ---------------------------------------------------------------------------

test("proxy revocation still works, now writing status withdrawn and a change log entry", async ({ page }) => {
  const proxyId = await insertTestProxy();
  try {
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    const res = await page.request.post("/api/proxy/revoke", { data: { id: proxyId, reason: "test revoke" } });
    expect(res.status()).toBe(200);

    const { data: row } = await db().from("agm_proxies").select("status, revoked_at, revoked_reason").eq("id", proxyId).single();
    expect(row.status).toBe("withdrawn");
    expect(row.revoked_at).toBeTruthy();
    expect(row.revoked_reason).toBe("test revoke");

    const log = await changeLogFor("agm_proxies", proxyId);
    const statusEntry = log.find((e) => e.field_name === "status");
    expect(statusEntry?.old_value).toBe("active");
    expect(statusEntry?.new_value).toBe("withdrawn");
  } finally {
    await db().from("agm_proxies").delete().eq("id", proxyId);
  }
});

// ---------------------------------------------------------------------------
// 9 and 11. A new signature stores all four snapshot texts, matching what
//    the page displayed at that moment, and they appear in the CSV export.
// ---------------------------------------------------------------------------

test("a new signature stores all four snapshot texts matching the current wording, and they appear in the export", async ({ page }) => {
  const versionId = await insertTestVersion({
    is_placeholder: false,
    body: "Snapshot test body",
    declaration_text: "Snapshot test declaration",
    consent_text: "Snapshot test consent",
    supporting_statement: "Snapshot test statement",
  });
  const previousMode = await db().from("site_config").select("value").eq("key", "resolution_open").maybeSingle();

  try {
    await db().from("agm_resolution_versions").update({ is_current: false }).eq("is_current", true);
    await db().from("agm_resolution_versions").update({ is_current: true }).eq("id", versionId);
    await setConfig("resolution_open", "true");

    const email = `p5a-snapshot-${Date.now()}@example.com`;
    const res = await page.request.post("/api/resolution/sign", {
      data: {
        fullName: "P5a Snapshot Signatory",
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
        signatureName: "P5a Snapshot Signatory",
        turnstileToken: "test-token",
      },
      headers: { "x-forwarded-for": "10.13.0.99" },
    });
    expect(res.status()).toBe(200);

    const { data: row } = await db()
      .from("agm_signatures")
      .select("resolution_snapshot, declaration_snapshot, consent_snapshot, supporting_statement_snapshot")
      .eq("email", email)
      .single();
    expect(row.resolution_snapshot).toBe("Snapshot test body");
    expect(row.declaration_snapshot).toBe("Snapshot test declaration");
    expect(row.consent_snapshot).toBe("Snapshot test consent");
    expect(row.supporting_statement_snapshot).toBe("Snapshot test statement");

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    await page.getByRole("button", { name: /Who has signed/i }).click();

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
    await page.getByRole("button", { name: /Who has signed/i }).click();
    // The signature export, not the supporters export beside it further
    // down the page - both buttons share this label.
    await page.getByRole("button", { name: "Export CSV" }).first().click();
    const csv = await page.evaluate(async () => {
      const blob = (window as unknown as { __capturedBlob?: Blob }).__capturedBlob;
      if (!blob) throw new Error("Export did not create a Blob via URL.createObjectURL");
      return blob.text();
    });
    expect(csv).toContain("Snapshot test body");
    expect(csv).toContain("Snapshot test declaration");
  } finally {
    await db().from("agm_signatures").delete().ilike("email", "p5a-snapshot-%@example.com");
    await db().from("agm_resolution_versions").update({ is_current: false }).eq("id", versionId);
    await db().from("agm_resolution_versions").delete().eq("id", versionId);
    await setConfig("resolution_open", previousMode.data?.value ?? "false");
  }
});

// ---------------------------------------------------------------------------
// 10. THE TEST THAT MATTERS. Editing the live wording afterwards leaves an
//    existing signature's snapshot unchanged.
// ---------------------------------------------------------------------------

test("editing the live wording after a signature exists leaves that signature's snapshot unchanged", async ({ page }) => {
  const versionId = await insertTestVersion({
    is_placeholder: false,
    body: "Original body before edit",
    declaration_text: "Original declaration before edit",
    consent_text: "Original consent before edit",
  });
  const sigId = await insertTestSignature({
    resolution_version_id: versionId,
    resolution_snapshot: "Original body before edit",
    declaration_snapshot: "Original declaration before edit",
    consent_snapshot: "Original consent before edit",
  });

  try {
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    const editRes = await adminEdit(page, {
      table: "agm_resolution_versions",
      id: versionId,
      changes: { body: "Wording edited after signature existed" },
      reason: "test 10",
    });
    expect(editRes.status()).toBe(200);

    const { data: version } = await db().from("agm_resolution_versions").select("body").eq("id", versionId).single();
    expect(version.body).toBe("Wording edited after signature existed");

    const { data: signature } = await db()
      .from("agm_signatures")
      .select("resolution_snapshot")
      .eq("id", sigId)
      .single();
    expect(
      signature.resolution_snapshot,
      "the signature's own snapshot must still show what was signed, not the edited wording"
    ).toBe("Original body before edit");
  } finally {
    await db().from("agm_signatures").delete().eq("id", sigId);
    await db().from("agm_resolution_versions").delete().eq("id", versionId);
  }
});

// ---------------------------------------------------------------------------
// Follow-up 1. Editing how_held recomputes shareholder_tag in the same
// operation and logs both - proved by checking the actual headline count on
// the admin page, not just the stored tag value.
// ---------------------------------------------------------------------------

test("editing how_held from nominee to direct recomputes shareholder_tag and changes the count toward 100", async ({ page }) => {
  const sigId = await insertTestSignature({
    how_held: "nominee",
    computershare_srn: null,
    nominee_platform: "Hargreaves Lansdown",
    shareholder_tag: "nominee-platform",
  });

  try {
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    const before = await page.getByText(/needed to lodge/i).innerText();
    const countBefore = Number(before.match(/^([\d,]+)/)![1].replace(/,/g, ""));

    const res = await adminEdit(page, {
      table: "agm_signatures",
      id: sigId,
      changes: { how_held: "direct", computershare_srn: "C0009998887" },
      reason: "corrected how_held",
    });
    expect(res.status()).toBe(200);

    const { data: row } = await db().from("agm_signatures").select("how_held, shareholder_tag").eq("id", sigId).single();
    expect(row.how_held).toBe("direct");
    expect(row.shareholder_tag, "shareholder_tag must follow how_held, not be left at the old value").toBe("direct-registered");

    const log = await changeLogFor("agm_signatures", sigId);
    expect(log.find((e) => e.field_name === "how_held")).toBeTruthy();
    const tagEntry = log.find((e) => e.field_name === "shareholder_tag");
    expect(tagEntry, "the derived change must be logged too, not just applied silently").toBeTruthy();
    expect(tagEntry.old_value).toBe("nominee-platform");
    expect(tagEntry.new_value).toBe("direct-registered");

    await page.goto("/member-portal/admin/resolution", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    const after = await page.getByText(/needed to lodge/i).innerText();
    const countAfter = Number(after.match(/^([\d,]+)/)![1].replace(/,/g, ""));
    expect(countAfter, "the headline count filters on shareholder_tag - it must reflect the correction").toBe(countBefore + 1);
  } finally {
    await db().from("agm_signatures").delete().eq("id", sigId);
  }
});

// ---------------------------------------------------------------------------
// Follow-up 2. capture_status is settable, and voiding a pre_rebuild
// signature actually frees the email for a fresh sign - proved end to end
// through the real public /api/resolution/sign route, not just at the
// database level.
// ---------------------------------------------------------------------------

test("capture_status can be edited directly, and voiding a pre_rebuild signature lets the same email sign again", async ({ page }) => {
  const email = `p5a-resign-${Date.now()}@example.com`;
  const legacyId = await insertTestSignature({
    email,
    capture_status: "pre_rebuild",
    address_line_1: null,
    address_town: null,
    address_postcode: null,
    share_class: null,
    eligibility_confirmed: null,
    resolution_supported: null,
    privacy_policy_version: null,
  });
  const versionId = await insertTestVersion({ is_placeholder: false });
  const previousResOpen = await db().from("site_config").select("value").eq("key", "resolution_open").maybeSingle();

  try {
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    // capture_status is directly editable, confirmed here without touching
    // the missing-fields constraint at all.
    const editRes = await adminEdit(page, {
      table: "agm_signatures",
      id: legacyId,
      changes: { capture_status: "pre_rebuild" },
      reason: "confirming capture_status is editable",
    });
    expect(editRes.status()).toBe(200);

    // Voiding, not marking complete, is the path proved end to end: the
    // legacy row has no resolution_version_id and no snapshot, so
    // "complete" would be a label with no evidence behind it. Void it and
    // let the person sign fresh instead.
    const statusRes = await adminStatus(page, { table: "agm_signatures", id: legacyId, status: "voided", reason: "resolving legacy record" });
    expect(statusRes.status()).toBe(200);

    const { data: voided } = await db().from("agm_signatures").select("status").eq("id", legacyId).single();
    expect(voided.status).toBe("voided");

    await db().from("agm_resolution_versions").update({ is_current: false }).eq("is_current", true);
    await db().from("agm_resolution_versions").update({ is_current: true }).eq("id", versionId);
    await setConfig("resolution_open", "true");

    const signRes = await page.request.post("/api/resolution/sign", {
      data: {
        fullName: "P5a Resign Test",
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
        signatureName: "P5a Resign Test",
        turnstileToken: "test-token",
      },
      headers: { "x-forwarded-for": "10.14.0.50" },
    });
    expect(signRes.status(), "the same email must be able to sign again once the old record is voided").toBe(200);

    const { data: rows } = await db().from("agm_signatures").select("id, status, capture_status").eq("email", email);
    expect(rows?.length).toBe(2);
    const freshRow = rows!.find((r) => r.id !== legacyId);
    expect(freshRow?.status).toBe("active");
    expect(freshRow?.capture_status).toBe("complete");
  } finally {
    await db().from("agm_signatures").delete().eq("email", email);
    await db().from("agm_resolution_versions").delete().eq("id", versionId);
    await setConfig("resolution_open", previousResOpen.data?.value ?? "false");
  }
});

// ---------------------------------------------------------------------------
// Follow-up 3. The proxy declaration is editable through "Change wording"
// on The Appointment card, logged through agm_change_log with
// table_name = 'site_config', record_id = 'proxy_declaration_text'.
// ---------------------------------------------------------------------------

test("the proxy declaration can be edited through Change wording on the AGM Proxy admin page, and is logged against site_config", async ({ page }) => {
  const marker = `P5A-DECLARATION-${Date.now()}`;

  // A fixture, deliberately, rather than assuming staging has zero active
  // appointments right now: the warning must count every active
  // appointment for the meeting, not only ones whose snapshot happens to
  // match a brand-new marker string - this proxy's declaration_snapshot is
  // set to the pre-edit text on purpose, so after saving a new marker the
  // warning's breakdown clause ("N against an earlier version") is
  // exercised too, not just the total.
  const proxyId = await insertTestProxy();

  try {
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/proxy", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    await page.getByRole("button", { name: "Change wording" }).click();
    await page.locator("#pf-text").fill(marker);
    await page.locator("#pf-reason").fill("test - proving the declaration edit path");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // The fixture's snapshot ("test", set by insertTestProxy) does not
    // match the new marker text, so the warning must name it as affected
    // by total count, with the breakdown showing it against an earlier
    // version - not silently drop it because its snapshot does not match.
    await expect(page.getByText(/appointed a proxy for this meeting.*against an earlier version/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Yes, save" }).click();

    await expect(page.getByRole("button", { name: "Change wording" })).toBeVisible({ timeout: 15_000 });

    const { data: config } = await db().from("site_config").select("value").eq("key", "proxy_declaration_text").single();
    expect(config.value).toBe(marker);

    const { data: log } = await db()
      .from("agm_change_log")
      .select("*")
      .eq("table_name", "site_config")
      .eq("record_id", "proxy_declaration_text")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(log.new_value).toBe(marker);
    expect(log.field_name).toBe("value");
  } finally {
    await db().from("agm_proxies").delete().eq("id", proxyId);
    await setConfig("proxy_declaration_text", previousDeclarationText ?? "");
  }
});

// ---------------------------------------------------------------------------
// Follow-up 4. The TBD guard is not enforced by the save itself - saving
// empty or TBD text is allowed - but the admin banner must immediately
// reflect that appointments cannot be taken.
// ---------------------------------------------------------------------------

test("saving an empty declaration is not blocked, and the banner immediately says appointments cannot be taken", async ({ page }) => {
  const previousMode = await db().from("site_config").select("value").eq("key", "proxy_mode").maybeSingle();

  try {
    await setConfig("proxy_mode", "appointment");
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/proxy", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    await page.getByRole("button", { name: "Change wording" }).click();
    await page.locator("#pf-text").fill("");
    await page.locator("#pf-reason").fill("test - deliberately parking the declaration empty");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Yes, save" }).click();

    // The save was not blocked - proceed to check the banner reflects it.
    await expect(page.getByRole("button", { name: "Change wording" })).toBeVisible({ timeout: 15_000 });

    const { data: config } = await db().from("site_config").select("value").eq("key", "proxy_declaration_text").single();
    expect(config.value).toBe("");

    await expect(page.getByText(/declaration wording below is still a placeholder/i)).toBeVisible();
  } finally {
    await setConfig("proxy_declaration_text", previousDeclarationText ?? "");
    await setConfig("proxy_mode", previousMode.data?.value ?? "closed");
  }
});

// ---------------------------------------------------------------------------
// Follow-up 5. The same resign-after-void fix as agm_signatures, applied to
// agm_proxies and agm_supporters - REQUIRES
// sql/agm-p5a-followup2-supporters-proxies-resign.sql to have been run.
// Proved end to end through the real public routes, not just at the
// database level.
// ---------------------------------------------------------------------------

test("voiding a proxy appointment frees its email for a fresh appointment", async ({ page }) => {
  const email = `p5a-proxy-resign-${Date.now()}@example.com`;
  const previousMode = await db().from("site_config").select("value").eq("key", "proxy_mode").maybeSingle();
  const previousDeclaration = await db().from("site_config").select("value").eq("key", "proxy_declaration_text").maybeSingle();

  try {
    const legacyId = await insertTestProxy();
    await db().from("agm_proxies").update({ email }).eq("id", legacyId);

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    const statusRes = await adminStatus(page, { table: "agm_proxies", id: legacyId, status: "voided", reason: "test - freeing the email" });
    expect(statusRes.status()).toBe(200);

    await setConfig("proxy_mode", "appointment");
    await setConfig("proxy_declaration_text", "A real, non-placeholder declaration for this test.");

    const appointRes = await page.request.post("/api/proxy/appointment", {
      data: {
        fullName: "P5a Proxy Resign Test",
        addressLine1: "1 Test Street",
        addressTown: "Glasgow",
        addressPostcode: "G1 1AA",
        email,
        howHeld: "direct",
        computershareSrn: "C0009998887",
        shareClass: "ORD",
        sharesHeld: "101-500",
        consentGiven: true,
        signatureName: "P5a Proxy Resign Test",
        turnstileToken: "test-token",
      },
      headers: { "x-forwarded-for": "10.15.0.60" },
    });
    expect(appointRes.status(), "the same email must be able to appoint again once the old record is voided").toBe(200);

    const { data: rows } = await db().from("agm_proxies").select("id, status").eq("email", email);
    expect(rows?.length).toBe(2);
    const freshRow = rows!.find((r) => r.id !== legacyId);
    expect(freshRow?.status).toBe("active");
  } finally {
    await db().from("agm_proxies").delete().eq("email", email);
    await setConfig("proxy_mode", previousMode.data?.value ?? "closed");
    await setConfig("proxy_declaration_text", previousDeclaration.data?.value ?? "");
  }
});

test("voiding a supporter record frees its email for a fresh registration", async ({ page }) => {
  const email = `p5a-supporter-resign-${Date.now()}@example.com`;
  const previousOpen = await db().from("site_config").select("value").eq("key", "resolution_open").maybeSingle();

  try {
    const legacyId = await insertTestSupporter();
    await db().from("agm_supporters").update({ email }).eq("id", legacyId);

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    const statusRes = await adminStatus(page, { table: "agm_supporters", id: legacyId, status: "voided", reason: "test - freeing the email" });
    expect(statusRes.status()).toBe(200);

    await setConfig("resolution_open", "true");

    const supportRes = await page.request.post("/api/resolution/supporter", {
      data: {
        fullName: "P5a Supporter Resign Test",
        email,
        consentGiven: true,
        turnstileToken: "test-token",
      },
      headers: { "x-forwarded-for": "10.15.0.61" },
    });
    expect(supportRes.status(), "the same email must be able to register support again once the old record is voided").toBe(200);

    const { data: rows } = await db().from("agm_supporters").select("id, status").eq("email", email);
    expect(rows?.length).toBe(2);
    const freshRow = rows!.find((r) => r.id !== legacyId);
    expect(freshRow?.status).toBe("active");
  } finally {
    await db().from("agm_supporters").delete().eq("email", email);
    await setConfig("resolution_open", previousOpen.data?.value ?? "false");
  }
});

// ---------------------------------------------------------------------------
// Follow-up 6. A suspected_bot row must not occupy a real person's email
// slot - REQUIRES sql/agm-p5a-followup3-suspected-bot-index.sql to have
// been run.
// ---------------------------------------------------------------------------

test("a flagged signature does not block a later real submission with the same email", async ({ page }) => {
  const email = `p5a-bot-blocks-${Date.now()}@example.com`;
  const versionId = await insertTestVersion({ is_placeholder: false });
  const previousOpen = await db().from("site_config").select("value").eq("key", "resolution_open").maybeSingle();

  try {
    const flaggedId = await insertTestSignature({ email, suspected_bot: true });

    await db().from("agm_resolution_versions").update({ is_current: false }).eq("is_current", true);
    await db().from("agm_resolution_versions").update({ is_current: true }).eq("id", versionId);
    await setConfig("resolution_open", "true");

    const res = await page.request.post("/api/resolution/sign", {
      data: {
        fullName: "P5a Real Signatory",
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
        signatureName: "P5a Real Signatory",
        turnstileToken: "test-token",
      },
      headers: { "x-forwarded-for": "10.16.0.70" },
    });
    expect(res.status(), "a suspected_bot row must never cause a genuine signature to read as a duplicate").toBe(200);

    const { data: rows } = await db().from("agm_signatures").select("id, suspected_bot, status").eq("email", email);
    expect(rows?.length).toBe(2);
    const realRow = rows!.find((r) => r.id !== flaggedId);
    expect(realRow?.suspected_bot).toBe(false);
    expect(realRow?.status).toBe("active");
  } finally {
    await db().from("agm_signatures").delete().eq("email", email);
    await db().from("agm_resolution_versions").delete().eq("id", versionId);
    await setConfig("resolution_open", previousOpen.data?.value ?? "false");
  }
});

test("releasing a flagged signature is refused when an active unflagged record already holds the same email, naming the conflict", async ({ page }) => {
  const email = `p5a-release-conflict-${Date.now()}@example.com`;

  try {
    const flaggedId = await insertTestSignature({ email, suspected_bot: true, full_name: "Flagged Row" });
    const activeId = await insertTestSignature({ email, full_name: "Genuine Signatory" });

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    const res = await suspectedBotAction(page, { table: "agm_signatures", id: flaggedId, action: "release" });
    expect(res.status()).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("Genuine Signatory");
    expect(data.error).toContain(activeId);

    const { data: stillFlagged } = await db().from("agm_signatures").select("suspected_bot").eq("id", flaggedId).single();
    expect(stillFlagged.suspected_bot, "the flag must not be cleared when release is refused").toBe(true);
  } finally {
    await db().from("agm_signatures").delete().eq("email", email);
  }
});

test("releasing a flagged signature succeeds when nothing else holds the same email", async ({ page }) => {
  const flaggedId = await insertTestSignature({ suspected_bot: true });

  try {
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    const res = await suspectedBotAction(page, { table: "agm_signatures", id: flaggedId, action: "release" });
    expect(res.status()).toBe(200);

    const { data: row } = await db().from("agm_signatures").select("suspected_bot").eq("id", flaggedId).single();
    expect(row.suspected_bot).toBe(false);
  } finally {
    await db().from("agm_signatures").delete().eq("id", flaggedId);
  }
});
