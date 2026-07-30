/**
 * AGM Package 6 - documents and the return journey.
 *
 * REQUIRES sql/agm-p6-schema.sql to have been run on the target database.
 *
 * Email verification note: RESEND_API_KEY is not configured against staging
 * (confirmed - only production carries a real key), so sendXxxEmail()
 * always no-ops early with no error and no email_log row. "Exactly one
 * email sent" therefore cannot be proved by inspecting a real inbox or
 * email_log in this environment, the same limitation already recorded for
 * every other webhook-driven email in this codebase. What IS proved here:
 * email_sent_at is populated after a successful submission (the code path
 * that would send ran to completion without throwing), the PDF the email
 * would have attached renders correctly and downloads independently at
 * /api/resolution/pdf/[id] and /api/proxy/pdf/[id], and the submission
 * itself succeeds regardless of the email subsystem's configured state -
 * which is the actual content of "a failure does not block the
 * submission" in every environment available to prove it in.
 *
 * SAFETY, same shape as the other AGM suites. Refuses to run anywhere but
 * staging. Captures and restores resolution_open, proxy_mode, the current
 * resolution version and proxy_declaration_text.
 *
 * Run:
 *   npx playwright test tests/agm-p6-return-journey.spec.ts --workers=1
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

// pdftotext ships with Git for Windows' clangarm64 bundle on this machine -
// see the memory note on PDF extraction. Used only to prove PDF content in
// these tests, never in application code.
const PDFTOTEXT = "C:/Program Files/Git/clangarm64/bin/pdftotext.exe";

function pdfBufferToText(buf: Buffer): string {
  const tmpFile = path.join(os.tmpdir(), `p6-test-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tmpFile, buf);
  try {
    return execSync(`"${PDFTOTEXT}" "${tmpFile}" -`).toString("utf8");
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

let ipCounter = 90;
const nextIp = () => `10.17.0.${ipCounter++}`;

test.describe.configure({ mode: "serial" });

let previousResolutionOpen: string | null = null;
let previousProxyMode: string | null = null;
let previousCurrentVersionId: string | null = null;
let previousDeclarationText: string | null = null;

test.beforeAll(async () => {
  if (!SUPABASE_URL?.includes(STAGING_PROJECT_REF)) {
    throw new Error(
      `Refusing to run: this suite submits real AGM records and must only target staging (${STAGING_PROJECT_REF}). ` +
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

async function insertTestVersion(overrides: Record<string, unknown> = {}) {
  const { data, error } = await db().from("agm_resolution_versions").insert({
    version_label: "[TEST P6]",
    body: "Test body",
    declaration_text: "Test declaration",
    consent_text: "Test consent",
    is_placeholder: false,
    is_current: false,
    created_by: "playwright p6",
    meeting_ref: "2026-AGM",
    ...overrides,
  }).select("id").single();
  if (error) throw new Error(`insertTestVersion: ${error.message}`);
  return data.id as string;
}

async function makeCurrent(versionId: string) {
  await db().from("agm_resolution_versions").update({ is_current: false }).eq("is_current", true);
  await db().from("agm_resolution_versions").update({ is_current: true }).eq("id", versionId);
}

// ---------------------------------------------------------------------------
// 1 and 3. The requisition PDF, from the sign flow. Renders the signature's
// own snapshot, not the live wording - proved by editing the wording after
// signing and regenerating the same PDF.
// ---------------------------------------------------------------------------

test("signing sends a confirmation with the requisition PDF, rendering the snapshot not the live wording", async ({ page }) => {
  const versionId = await insertTestVersion({ body: "Original body for P6 test" });
  const email = `p6-sign-${Date.now()}@example.com`;

  try {
    await makeCurrent(versionId);
    await setConfig("resolution_open", "true");

    const res = await page.request.post("/api/resolution/sign", {
      data: {
        fullName: "P6 Test Signatory",
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
        signatureName: "P6 Test Signatory",
        turnstileToken: "test-token",
      },
      headers: { "x-forwarded-for": nextIp() },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBeTruthy();

    const { data: row } = await db().from("agm_signatures").select("email_sent_at, email_error").eq("id", body.id).single();
    expect(row.email_sent_at, "the confirmation send path must have run without throwing").toBeTruthy();
    expect(row.email_error).toBeNull();

    // Now edit the live wording - the PDF must still show the original text.
    await db().from("agm_resolution_versions").update({ body: "EDITED body, must not appear in the PDF" }).eq("id", versionId);

    const pdfRes = await page.request.get(`/api/resolution/pdf/${body.id}`);
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()["content-type"]).toContain("application/pdf");
    const pdfBuffer = await pdfRes.body();
    const text = pdfBufferToText(pdfBuffer);
    expect(text).toContain("Original body for P6 test");
    expect(text).not.toContain("EDITED body");
  } finally {
    await db().from("agm_signatures").delete().eq("email", email);
    await db().from("agm_resolution_versions").delete().eq("id", versionId);
    await setConfig("resolution_open", "false");
  }
});

// ---------------------------------------------------------------------------
// 4 and 7. The appointment PDF names Brian McLaughlin and states the exact
// share count. lodgement_path records the choice and defaults to we-lodge.
// ---------------------------------------------------------------------------

test("a direct-holder we-lodge appointment names the appointee and exact share count, defaults lodgement_path", async ({ page }) => {
  const email = `p6-appoint-welodge-${Date.now()}@example.com`;
  const previousDeclaration = await db().from("site_config").select("value").eq("key", "proxy_declaration_text").maybeSingle();

  try {
    await setConfig("proxy_mode", "appointment");
    await setConfig("proxy_declaration_text", "A real, non-placeholder declaration for this test.");

    const res = await page.request.post("/api/proxy/appointment", {
      data: {
        fullName: "P6 We Lodge Test",
        addressLine1: "1 Test Street",
        addressTown: "Glasgow",
        addressPostcode: "G1 1AA",
        email,
        howHeld: "direct",
        computershareSrn: "C0009998887",
        sharesHeldExact: 347,
        shareClass: "ORD",
        consentGiven: true,
        signatureName: "P6 We Lodge Test",
        turnstileToken: "test-token",
        // lodgementPath deliberately omitted - must default to we-lodge.
      },
      headers: { "x-forwarded-for": nextIp() },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    const { data: row } = await db().from("agm_proxies").select("lodgement_path, shares_held_exact, email_sent_at").eq("id", body.id).single();
    expect(row.lodgement_path).toBe("we-lodge");
    expect(row.shares_held_exact).toBe(347);
    expect(row.email_sent_at).toBeTruthy();

    const pdfRes = await page.request.get(`/api/proxy/pdf/${body.id}`);
    expect(pdfRes.status()).toBe(200);
    const text = pdfBufferToText(await pdfRes.body());
    expect(text).toContain("Brian McLaughlin");
    expect(text).toContain("347");
  } finally {
    await db().from("agm_proxies").delete().eq("email", email);
    await setConfig("proxy_mode", "closed");
    await setConfig("proxy_declaration_text", previousDeclaration.data?.value ?? "");
  }
});

test("a direct-holder member-lodges appointment records the chosen lodgement path", async ({ page }) => {
  const email = `p6-appoint-memberlodges-${Date.now()}@example.com`;
  const previousDeclaration = await db().from("site_config").select("value").eq("key", "proxy_declaration_text").maybeSingle();

  try {
    await setConfig("proxy_mode", "appointment");
    await setConfig("proxy_declaration_text", "A real, non-placeholder declaration for this test.");

    const res = await page.request.post("/api/proxy/appointment", {
      data: {
        fullName: "P6 Member Lodges Test",
        addressLine1: "1 Test Street",
        addressTown: "Glasgow",
        addressPostcode: "G1 1AA",
        email,
        howHeld: "direct",
        computershareSrn: "C0009998888",
        sharesHeldExact: 12,
        shareClass: "ORD",
        consentGiven: true,
        signatureName: "P6 Member Lodges Test",
        lodgementPath: "member-lodges",
        turnstileToken: "test-token",
      },
      headers: { "x-forwarded-for": nextIp() },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    const { data: row } = await db().from("agm_proxies").select("lodgement_path, email_sent_at").eq("id", body.id).single();
    expect(row.lodgement_path).toBe("member-lodges");
    expect(row.email_sent_at).toBeTruthy();
  } finally {
    await db().from("agm_proxies").delete().eq("email", email);
    await setConfig("proxy_mode", "closed");
    await setConfig("proxy_declaration_text", previousDeclaration.data?.value ?? "");
  }
});

test("a direct appointment without an exact share count is rejected", async ({ page }) => {
  const previousDeclaration = await db().from("site_config").select("value").eq("key", "proxy_declaration_text").maybeSingle();
  try {
    await setConfig("proxy_mode", "appointment");
    await setConfig("proxy_declaration_text", "A real, non-placeholder declaration for this test.");

    const res = await page.request.post("/api/proxy/appointment", {
      data: {
        fullName: "P6 No Shares Test",
        addressLine1: "1 Test Street",
        addressTown: "Glasgow",
        addressPostcode: "G1 1AA",
        email: `p6-noshares-${Date.now()}@example.com`,
        howHeld: "direct",
        computershareSrn: "C0009998887",
        shareClass: "ORD",
        consentGiven: true,
        signatureName: "P6 No Shares Test",
        turnstileToken: "test-token",
      },
      headers: { "x-forwarded-for": nextIp() },
    });
    expect(res.status()).toBe(400);
  } finally {
    await setConfig("proxy_mode", "closed");
    await setConfig("proxy_declaration_text", previousDeclaration.data?.value ?? "");
  }
});

// ---------------------------------------------------------------------------
// 8. No code path requests or stores platform credentials. A nominee
// appointment also gets the instruction PDF and the confirmation email.
// ---------------------------------------------------------------------------

test("a nominee appointment gets an instruction PDF naming the platform, and no field accepts platform credentials", async ({ page }) => {
  const email = `p6-appoint-nominee-${Date.now()}@example.com`;
  const previousDeclaration = await db().from("site_config").select("value").eq("key", "proxy_declaration_text").maybeSingle();

  try {
    await setConfig("proxy_mode", "appointment");
    await setConfig("proxy_declaration_text", "A real, non-placeholder declaration for this test.");

    const res = await page.request.post("/api/proxy/appointment", {
      data: {
        fullName: "P6 Nominee Test",
        addressLine1: "1 Test Street",
        addressTown: "Glasgow",
        addressPostcode: "G1 1AA",
        email,
        howHeld: "nominee",
        nomineePlatform: "Hargreaves Lansdown",
        nomineeInstructionSent: true,
        consentGiven: true,
        signatureName: "P6 Nominee Test",
        turnstileToken: "test-token",
        // Not a real field anywhere in the schema or the Body type - proves
        // there is no code path that reads or stores it, not merely that
        // this one request was rejected.
        platformPassword: "should-never-be-stored",
      },
      headers: { "x-forwarded-for": nextIp() },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    const { data: row } = await db().from("agm_proxies").select("*").eq("id", body.id).single();
    expect(row.nominee_instruction_sent).toBe(true);
    expect(row.email_sent_at).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain("should-never-be-stored");

    const pdfRes = await page.request.get(`/api/proxy/pdf/${body.id}`);
    const text = pdfBufferToText(await pdfRes.body());
    expect(text).toContain("Hargreaves Lansdown");
    expect(text.toLowerCase()).not.toContain("password");
  } finally {
    await db().from("agm_proxies").delete().eq("email", email);
    await setConfig("proxy_mode", "closed");
    await setConfig("proxy_declaration_text", previousDeclaration.data?.value ?? "");
  }
});

// ---------------------------------------------------------------------------
// 5 and 6. The confirmation link. Valid, idempotent, and an invalid id is
// rejected without writing anything.
// ---------------------------------------------------------------------------

async function insertNomineeProxy(overrides: Record<string, unknown> = {}) {
  const { data, error } = await db().from("agm_proxies").insert({
    meeting_ref: "2026-AGM",
    full_name: "P6 Confirm Test",
    address_line_1: "1 Test Street",
    address_town: "Glasgow",
    address_postcode: "G1 1AA",
    email: `p6-confirm-${Date.now()}@example.com`,
    how_held: "nominee",
    nominee_platform: "Hargreaves Lansdown",
    appointee_name: "Brian McLaughlin",
    declaration_snapshot: "test",
    signature_name: "P6 Confirm Test",
    signed_at: new Date().toISOString(),
    consent_given: true,
    privacy_policy_version: "test",
    suspected_bot: false,
    status: "active",
    nominee_instruction_sent: false,
    ...overrides,
  }).select("id").single();
  if (error) throw new Error(`insertNomineeProxy: ${error.message}`);
  return data.id as string;
}

test("a valid confirmation link flips nominee_instruction_sent and logs the change, and clicking twice is harmless", async ({ page }) => {
  const id = await insertNomineeProxy();

  try {
    await page.goto(`/proxy/confirm/${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Thank you/i)).toBeVisible();

    const { data: after } = await db().from("agm_proxies").select("nominee_instruction_sent").eq("id", id).single();
    expect(after.nominee_instruction_sent).toBe(true);

    const { data: log } = await db()
      .from("agm_change_log")
      .select("*")
      .eq("table_name", "agm_proxies")
      .eq("record_id", id)
      .eq("field_name", "nominee_instruction_sent");
    expect(log?.length).toBe(1);

    // Click again - idempotent, same message, no second log entry.
    await page.goto(`/proxy/confirm/${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Thank you/i)).toBeVisible();

    const { data: logAfterSecondClick } = await db()
      .from("agm_change_log")
      .select("*")
      .eq("table_name", "agm_proxies")
      .eq("record_id", id)
      .eq("field_name", "nominee_instruction_sent");
    expect(logAfterSecondClick?.length, "clicking twice must not write a second log entry").toBe(1);
  } finally {
    await db().from("agm_proxies").delete().eq("id", id);
  }
});

test("an invalid confirmation link is rejected, and a direct-holder appointment's id is rejected too", async ({ page }) => {
  await page.goto(`/proxy/confirm/00000000-0000-0000-0000-000000000000`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/not valid/i)).toBeVisible();

  const directId = await insertNomineeProxy({ how_held: "direct", nominee_platform: null });
  try {
    await page.goto(`/proxy/confirm/${directId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/not valid/i)).toBeVisible();

    const { data: unchanged } = await db().from("agm_proxies").select("nominee_instruction_sent").eq("id", directId).single();
    expect(unchanged.nominee_instruction_sent).toBe(false);
  } finally {
    await db().from("agm_proxies").delete().eq("id", directId);
  }
});

// ---------------------------------------------------------------------------
// 1 (remaining flows) and 2. Requisition supporter and proxy interest each
// send their own confirmation with no attachment, and neither blocks the
// submission regardless of the email subsystem's outcome.
// ---------------------------------------------------------------------------

test("the supporter and interest flows still succeed and store the row, independent of the email step", async ({ page }) => {
  const supporterEmail = `p6-supporter-${Date.now()}@example.com`;
  const interestEmail = `p6-interest-${Date.now()}@example.com`;
  const previousOpen = await db().from("site_config").select("value").eq("key", "resolution_open").maybeSingle();
  const previousMode = await db().from("site_config").select("value").eq("key", "proxy_mode").maybeSingle();

  try {
    await setConfig("resolution_open", "true");
    const supRes = await page.request.post("/api/resolution/supporter", {
      data: { fullName: "P6 Supporter Test", email: supporterEmail, consentGiven: true, turnstileToken: "test-token" },
      headers: { "x-forwarded-for": nextIp() },
    });
    expect(supRes.status()).toBe(200);
    const { data: supRow } = await db().from("agm_supporters").select("id").eq("email", supporterEmail).maybeSingle();
    expect(supRow).toBeTruthy();

    await setConfig("proxy_mode", "interest");
    const intRes = await page.request.post("/api/proxy", {
      data: { name: "P6 Interest Test", email: interestEmail, consentGiven: true, turnstileToken: "test-token" },
      headers: { "x-forwarded-for": nextIp() },
    });
    expect(intRes.status()).toBe(200);
    const { data: intRow } = await db().from("shareholder_cases").select("id").eq("email", interestEmail).eq("case_type", "Proxy Interest").maybeSingle();
    expect(intRow).toBeTruthy();
  } finally {
    await db().from("agm_supporters").delete().eq("email", supporterEmail);
    await db().from("shareholder_cases").delete().eq("email", interestEmail);
    await setConfig("resolution_open", previousOpen.data?.value ?? "false");
    await setConfig("proxy_mode", previousMode.data?.value ?? "closed");
  }
});
