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

import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function db() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

const TEST_VERSION_LABEL = "Automated test version";
let testVersionId = "";

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
      created_by: "playwright",
    })
    .select("id")
    .single();
  if (error) throw new Error(`create test version: ${error.message}`);

  testVersionId = data.id;
  await setCurrentVersion(testVersionId);
});

test.afterAll(async () => {
  // Restore the placeholder as current, then remove the test version. Order
  // matters: a version with signatures against it cannot be deleted.
  const { data: placeholder } = await db()
    .from("agm_resolution_versions")
    .select("id")
    .eq("is_placeholder", true)
    .maybeSingle();

  if (placeholder) await setCurrentVersion(placeholder.id);
  if (testVersionId) {
    await db().from("agm_signatures").delete().eq("resolution_version_id", testVersionId);
    await db().from("agm_resolution_versions").delete().eq("id", testVersionId);
  }
  await setConfig("agm_capture_signer_metadata", "false");
  await setConfig("resolution_open", "false");
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
// ---------------------------------------------------------------------------

test("resolution version body and label cannot be edited", async () => {
  const { error: bodyErr } = await db()
    .from("agm_resolution_versions")
    .update({ body: "tampered" })
    .eq("id", testVersionId);
  expect(bodyErr).not.toBeNull();

  const { error: labelErr } = await db()
    .from("agm_resolution_versions")
    .update({ version_label: "tampered" })
    .eq("id", testVersionId);
  expect(labelErr).not.toBeNull();

  const { data: unchanged } = await db()
    .from("agm_resolution_versions").select("body, version_label").eq("id", testVersionId).single();
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

test("pre_rebuild rows do not count toward the target", async ({ request }) => {
  const completeEmail = `p2-count-complete-${Date.now()}@example.com`;
  const preEmail      = `p2-count-pre-${Date.now()}@example.com`;
  try {
    expect((await sign(request, validBody(completeEmail))).status()).toBe(200);

    // Insert a pre_rebuild row directly: the API never produces one.
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

    const { data: rows } = await db()
      .from("agm_signatures")
      .select("shareholder_tag, capture_status")
      .in("email", [completeEmail, preEmail]);

    const qualifying = (rows ?? []).filter(
      (r) => r.shareholder_tag === "direct-registered" && r.capture_status === "complete"
    );
    expect(qualifying.length).toBe(1);
  } finally {
    await cleanup(completeEmail);
    await cleanup(preEmail);
  }
});
