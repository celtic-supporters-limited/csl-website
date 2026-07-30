/**
 * AGM Package 5 - proxy appointment instrument.
 *
 * Covers POST /api/proxy/appointment against agm_proxies, the appointee rule
 * (section 4 of the Package 5 brief - the one that matters most), revocation,
 * the suspected_bot store-and-flag pattern, and the admin register's export.
 *
 * REQUIRES sql/agm-p5-schema.sql to have been run on the target database.
 * Without it every test here fails at the first insert.
 *
 * SAFETY, same shape as tests/agm-requisition-capture.spec.ts. This suite
 * opens proxy_mode to "appointment" for its own run and restores whatever
 * value existed before. Refuses to run anywhere but staging.
 *
 * Run:
 *   npx playwright test tests/agm-proxy.spec.ts --workers=1
 */

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.TEST_USER_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_USER_PASSWORD;

// Same allowlist as the other AGM suites. Not a secret: part of
// NEXT_PUBLIC_SUPABASE_URL, ships in the client bundle.
const STAGING_PROJECT_REF = "mixwriunejiaxbpgxqmp";

const REAL_APPOINTEE = "Brian McLaughlin";

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

let ipCounter = 40;
const nextIp = () => `10.12.0.${ipCounter++}`;

function validAppointmentBody(email: string, overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Proxy Test Appointee",
    addressLine1: "12 Example Street",
    addressTown: "Glasgow",
    addressPostcode: "G1 1AA",
    email,
    howHeld: "direct",
    computershareSrn: "C0009998888",
    shareClass: "ORD",
    sharesHeld: "101-500",
    sharesHeldExact: 250,
    consentGiven: true,
    signatureName: "Proxy Test Appointee",
    turnstileToken: "test-token",
    ...overrides,
  };
}

async function postAppointment(request: APIRequestContext, body: Record<string, unknown>) {
  return request.post("/api/proxy/appointment", {
    data: body,
    headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
  });
}

async function fetchProxyByEmail(email: string) {
  const { data } = await db().from("agm_proxies").select("*").eq("email", email).maybeSingle();
  return data;
}

async function cleanupProxy(email: string) {
  await db().from("agm_proxies").delete().eq("email", email);
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

let previousProxyMode: string | null = null;
let previousDeclarationText: string | null = null;

// A real-looking value for the suite's duration. Staging's actual value is
// the seeded "TBD - ..." placeholder (Brian's wording has not arrived), which
// the new declaration lock (item 1 of the Package 5 close-out) now correctly
// refuses to sign against - every postAppointment() call in this file
// expecting 200 would otherwise fail with 503 the moment that lock exists.
// Deliberately contains a comma, matching the shape of the real seeded text -
// the CSV export test below relies on a comma appearing inside
// declaration_snapshot to exercise its RFC 4180 quoting.
const TEST_DECLARATION_TEXT =
  "I hereby appoint the above-named person as my proxy, to vote on my behalf at the Annual General Meeting.";

test.beforeAll(async () => {
  if (!SUPABASE_URL?.includes(STAGING_PROJECT_REF)) {
    throw new Error(
      `Refusing to run: this suite opens proxy appointment and must only target staging (${STAGING_PROJECT_REF}). ` +
      `Got ${SUPABASE_URL ?? "no NEXT_PUBLIC_SUPABASE_URL"}.`
    );
  }

  const { data: modeRow } = await db().from("site_config").select("value").eq("key", "proxy_mode").maybeSingle();
  previousProxyMode = modeRow?.value ?? null;

  const { data: declarationRow } = await db().from("site_config").select("value").eq("key", "proxy_declaration_text").maybeSingle();
  previousDeclarationText = declarationRow?.value ?? null;

  await setConfig("proxy_mode", "appointment");
  await setConfig("proxy_declaration_text", TEST_DECLARATION_TEXT);
});

test.afterAll(async () => {
  await setConfig("proxy_mode", previousProxyMode ?? "closed");
  await setConfig(
    "proxy_declaration_text",
    previousDeclarationText ??
      "TBD - proxy appointment declaration wording, pending director approval. Placeholder only: do not rely on this text for a real appointment."
  );
});

// ---------------------------------------------------------------------------
// 1-2. The appointee rule - the one that matters most
// ---------------------------------------------------------------------------

test("a stored appointment carries the real appointee name", async ({ request }) => {
  const email = `p5-appointee-${Date.now()}@example.com`;
  try {
    const res = await postAppointment(request, validAppointmentBody(email));
    expect(res.status()).toBe(200);

    const row = await fetchProxyByEmail(email);
    expect(row.appointee_name).toBe(REAL_APPOINTEE);
  } finally {
    await cleanupProxy(email);
  }
});

test("a request supplying its own appointee value is ignored", async ({ request }) => {
  const email = `p5-appointee-override-${Date.now()}@example.com`;
  try {
    const res = await postAppointment(
      request,
      // appointeeName is not a field the route reads at all - there is no
      // code path from this key to the stored value. Sent anyway to prove
      // that, not because the route does anything with it.
      validAppointmentBody(email, { appointeeName: "The Board of Celtic plc" })
    );
    expect(res.status()).toBe(200);

    const row = await fetchProxyByEmail(email);
    expect(row.appointee_name).toBe(REAL_APPOINTEE);
    expect(row.appointee_name).not.toBe("The Board of Celtic plc");
  } finally {
    await cleanupProxy(email);
  }
});

// ---------------------------------------------------------------------------
// 4. Direct/nominee validation
// ---------------------------------------------------------------------------

test("direct holder with no SRN is rejected", async ({ request }) => {
  const email = `p5-nosrn-${Date.now()}@example.com`;
  const res = await postAppointment(request, validAppointmentBody(email, { computershareSrn: "" }));
  expect(res.status()).toBe(400);
  expect(await fetchProxyByEmail(email)).toBeNull();
});

test("nominee holder with no platform is rejected", async ({ request }) => {
  const email = `p5-noplatform-${Date.now()}@example.com`;
  const res = await postAppointment(request, validAppointmentBody(email, { howHeld: "nominee", computershareSrn: undefined }));
  expect(res.status()).toBe(400);
  expect(await fetchProxyByEmail(email)).toBeNull();
});

test("nominee holder who has not confirmed sending the instruction is rejected", async ({ request }) => {
  const email = `p5-noinstruction-${Date.now()}@example.com`;
  const res = await postAppointment(request, validAppointmentBody(email, {
    howHeld: "nominee", computershareSrn: undefined, nomineePlatform: "Hargreaves Lansdown", nomineeInstructionSent: false,
  }));
  expect(res.status()).toBe(400);
  expect(await fetchProxyByEmail(email)).toBeNull();
});

test("nominee appointment with a confirmed instruction succeeds", async ({ request }) => {
  const email = `p5-nominee-ok-${Date.now()}@example.com`;
  try {
    const res = await postAppointment(request, validAppointmentBody(email, {
      howHeld: "nominee", computershareSrn: undefined, nomineePlatform: "Hargreaves Lansdown", nomineeInstructionSent: true,
    }));
    expect(res.status()).toBe(200);
    const row = await fetchProxyByEmail(email);
    expect(row.how_held).toBe("nominee");
    expect(row.nominee_platform).toBe("Hargreaves Lansdown");
    expect(row.nominee_instruction_sent).toBe(true);
  } finally {
    await cleanupProxy(email);
  }
});

// ---------------------------------------------------------------------------
// 5. signed_at is server-generated
// ---------------------------------------------------------------------------

test("client-supplied signedAt is ignored", async ({ request }) => {
  const email = `p5-signedat-${Date.now()}@example.com`;
  try {
    const before = Date.now();
    const res = await postAppointment(request, validAppointmentBody(email, { signedAt: "1999-01-01T00:00:00.000Z" }));
    expect(res.status()).toBe(200);

    const row = await fetchProxyByEmail(email);
    const stored = new Date(row.signed_at).getTime();
    expect(stored).toBeGreaterThanOrEqual(before - 60_000);
    expect(new Date(row.signed_at).getUTCFullYear()).not.toBe(1999);
  } finally {
    await cleanupProxy(email);
  }
});

// ---------------------------------------------------------------------------
// 6. Consent stored as submitted
// ---------------------------------------------------------------------------

test("consent and privacy policy version are stored on the appointment", async ({ request }) => {
  const email = `p5-consent-${Date.now()}@example.com`;
  try {
    const res = await postAppointment(request, validAppointmentBody(email));
    expect(res.status()).toBe(200);
    const row = await fetchProxyByEmail(email);
    expect(row.consent_given).toBe(true);
    expect(row.privacy_policy_version).toBeTruthy();
  } finally {
    await cleanupProxy(email);
  }
});

test("an appointment without consent is rejected", async ({ request }) => {
  const email = `p5-noconsent-${Date.now()}@example.com`;
  const res = await postAppointment(request, validAppointmentBody(email, { consentGiven: false }));
  expect(res.status()).toBe(400);
  expect(await fetchProxyByEmail(email)).toBeNull();
});

// ---------------------------------------------------------------------------
// 7. meeting_ref read live, not from the column default
// ---------------------------------------------------------------------------

test("meeting_ref is written from config", async ({ request }) => {
  const email = `p5-meetingref-${Date.now()}@example.com`;
  try {
    const { data: expectedRef } = await db().from("site_config").select("value").eq("key", "current_meeting_ref").maybeSingle();
    const res = await postAppointment(request, validAppointmentBody(email));
    expect(res.status()).toBe(200);
    const row = await fetchProxyByEmail(email);
    expect(row.meeting_ref).toBe(expectedRef?.value ?? "2026-AGM");
  } finally {
    await cleanupProxy(email);
  }
});

test("the same email can appoint for a different meeting", async ({ request }) => {
  const email = `p5-secondmeeting-${Date.now()}@example.com`;
  try {
    expect((await postAppointment(request, validAppointmentBody(email))).status()).toBe(200);

    // Same email, different meeting_ref - direct DB insert (snake_case
    // column names, not the camelCase API body shape) to simulate a future
    // AGM without needing a second current_meeting_ref flip mid-test.
    const { error } = await db().from("agm_proxies").insert({
      full_name: "Proxy Test Appointee",
      address_line_1: "12 Example Street",
      address_town: "Glasgow",
      address_postcode: "G1 1AA",
      email,
      how_held: "direct",
      computershare_srn: "C0009998888",
      share_class: "ORD",
      appointee_name: REAL_APPOINTEE,
      declaration_snapshot: "test",
      signature_name: "Proxy Test Appointee",
      signed_at: new Date().toISOString(),
      consent_given: true,
      privacy_policy_version: "1",
      meeting_ref: "2027-EGM-TEST",
    });
    expect(error).toBeNull();

    const { data: rows } = await db().from("agm_proxies").select("meeting_ref").eq("email", email);
    expect(rows?.length).toBe(2);
  } finally {
    await cleanupProxy(email);
  }
});

// ---------------------------------------------------------------------------
// 9. Honeypot - store-and-flag
// ---------------------------------------------------------------------------

test("a submission with the honeypot filled is stored with suspected_bot set, and excluded from the admin count and export", async ({ page, request }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const email = `p5-honeypot-${Date.now()}@example.com`;
  try {
    const res = await postAppointment(request, validAppointmentBody(email, { hpField: "http://spam.example.com" }));
    expect(res.status()).toBe(200);

    const row = await fetchProxyByEmail(email);
    expect(row).toBeTruthy();
    expect(row.suspected_bot).toBe(true);

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/proxy", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    // Visible in the table, badged.
    await page.getByRole("button", { name: /^Appointments/ }).click();
    const row1 = page.locator("tr", { hasText: email });
    await expect(row1.getByText("Suspected bot")).toBeVisible();

    // Excluded from the export.
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      (window as unknown as { __capturedBlob?: Blob }).__capturedBlob = undefined;
      URL.createObjectURL = (obj: Blob) => {
        (window as unknown as { __capturedBlob?: Blob }).__capturedBlob = obj;
        return orig(obj);
      };
    });
    await page.goto("/member-portal/admin/proxy", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    await page.getByRole("button", { name: /^Appointments/ })
      .locator("xpath=following-sibling::button[1]")
      .click();
    const csv = await page.evaluate(async () => {
      const blob = (window as unknown as { __capturedBlob?: Blob }).__capturedBlob;
      if (!blob) throw new Error("Export did not create a Blob via URL.createObjectURL");
      return blob.text();
    });
    expect(csv).not.toContain(email);
  } finally {
    await cleanupProxy(email);
  }
});

// ---------------------------------------------------------------------------
// 10-11. Admin register: export columns, revocation
// ---------------------------------------------------------------------------

test("the appointments export has the documented column list, and a revoked appointment is excluded from counts but marked in the export", async ({ page, request }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const email = `p5-revoke-${Date.now()}@example.com`;
  try {
    expect((await postAppointment(request, validAppointmentBody(email))).status()).toBe(200);
    const created = await fetchProxyByEmail(email);

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/proxy", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    const directBeforeText = await page.getByText(/proxy appointment.*recorded/i).innerText();
    const directBefore = Number(directBeforeText.match(/^([\d,]+)/)![1].replace(/,/g, ""));

    // Revoke via the admin action.
    await page.getByRole("button", { name: /^Appointments/ }).click();
    const row1 = page.locator("tr", { hasText: email });
    await row1.getByRole("button", { name: "Revoke" }).click();
    await row1.getByPlaceholder("Reason").fill("Test revocation");
    await row1.getByRole("button", { name: "Yes, revoke" }).click();
    await expect(page.getByText(/Revoked \d/)).toBeVisible({ timeout: 15_000 });

    // Count went down by one - a revocation excludes the row from every
    // count, per section 5a.
    await page.goto("/member-portal/admin/proxy", { waitUntil: "domcontentloaded" });
    const afterText = await page.getByText(/proxy appointment.*recorded/i).innerText();
    const after = Number(afterText.match(/^([\d,]+)/)![1].replace(/,/g, ""));
    expect(after).toBe(directBefore - 1);

    // Still present in the table, and in the export - marked, not removed.
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      (window as unknown as { __capturedBlob?: Blob }).__capturedBlob = undefined;
      URL.createObjectURL = (obj: Blob) => {
        (window as unknown as { __capturedBlob?: Blob }).__capturedBlob = obj;
        return orig(obj);
      };
    });
    await page.goto("/member-portal/admin/proxy", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    await page.getByRole("button", { name: /^Appointments/ })
      .locator("xpath=following-sibling::button[1]")
      .click();
    const csv = await page.evaluate(async () => {
      const blob = (window as unknown as { __capturedBlob?: Blob }).__capturedBlob;
      if (!blob) throw new Error("Export did not create a Blob via URL.createObjectURL");
      return blob.text();
    });

    const lines = csv.split("\r\n").filter(Boolean);
    // declaration_snapshot is the live proxy_declaration_text config value,
    // which contains a literal comma ("TBD - ... wording, pending director
    // approval..."). toCsv() quotes it correctly per RFC 4180; a plain
    // split(",") does not respect that quoting and misaligns every column
    // after it for that row, so this parses each line properly instead.
    function parseCsvLine(line: string): string[] {
      const fields: string[] = [];
      let field = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
          if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
          else if (c === '"') { inQuotes = false; }
          else { field += c; }
        } else if (c === '"') {
          inQuotes = true;
        } else if (c === ",") {
          fields.push(field);
          field = "";
        } else {
          field += c;
        }
      }
      fields.push(field);
      return fields;
    }

    const headers = parseCsvLine(lines[0]);
    expect(headers).toEqual([
      "id", "created_at", "signed_at", "full_name", "email",
      "address_line_1", "address_line_2", "address_town", "address_postcode",
      "how_held", "computershare_srn", "nominee_platform", "nominee_platform_other",
      "shares_held", "share_class", "appointee_name", "declaration_snapshot",
      "signature_name", "consent_given", "privacy_policy_version",
      "lodgement_path", "nominee_instruction_sent", "status", "revoked_at", "revoked_reason",
    ]);

    const idIdx = headers.indexOf("id");
    const statusIdx = headers.indexOf("status");
    const revokedAtIdx = headers.indexOf("revoked_at");
    const dataRow = lines.slice(1).map(parseCsvLine).find((cols) => cols[idIdx] === created.id);
    expect(dataRow).toBeTruthy();
    // Package 5a folds the proxy-specific "revoked" value into the shared
    // active/withdrawn/voided scheme - see sql/agm-p5a-editable-records.sql.
    expect(dataRow![statusIdx]).toBe("withdrawn");
    expect(dataRow![revokedAtIdx]).not.toBe("");
  } finally {
    await cleanupProxy(email);
  }
});

// ---------------------------------------------------------------------------
// 13. Package 5 close-out item 1: declaration lock
// ---------------------------------------------------------------------------

test("an appointment is refused while proxy_declaration_text is empty or still TBD", async ({ request }) => {
  const email = `p5-declaration-lock-${Date.now()}@example.com`;
  try {
    await setConfig("proxy_declaration_text", "TBD - still pending director approval.");
    let res = await postAppointment(request, validAppointmentBody(email));
    expect(res.status()).toBe(503);
    expect(await fetchProxyByEmail(email)).toBeNull();

    await setConfig("proxy_declaration_text", "");
    res = await postAppointment(request, validAppointmentBody(email));
    expect(res.status()).toBe(503);
    expect(await fetchProxyByEmail(email)).toBeNull();
  } finally {
    await setConfig("proxy_declaration_text", TEST_DECLARATION_TEXT);
    await cleanupProxy(email);
  }
});

test("the admin banner explains the declaration is not finalised when mode is appointment but the wording is still TBD", async ({ page }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  try {
    await setConfig("proxy_declaration_text", "TBD - still pending director approval.");
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/proxy", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    await expect(page.getByText(/declaration wording below is still a placeholder/i)).toBeVisible();
  } finally {
    await setConfig("proxy_declaration_text", TEST_DECLARATION_TEXT);
  }
});

// ---------------------------------------------------------------------------
// 14. Package 5 close-out item 2: interest flow honeypot store-and-flag
// ---------------------------------------------------------------------------

test("an interest submission with the honeypot filled is stored with suspected_bot set, and excluded from the admin count and export", async ({ page, request }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  const email = `p5-interest-honeypot-${Date.now()}@example.com`;
  const { data: modeRow } = await db().from("site_config").select("value").eq("key", "proxy_mode").maybeSingle();
  const modeBefore = modeRow?.value ?? null;

  try {
    await setConfig("proxy_mode", "interest");

    const res = await request.post("/api/proxy", {
      data: { name: "Interest Honeypot Test", email, consentGiven: true, turnstileToken: "test-token", hpField: "http://spam.example.com" },
      headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
    });
    expect(res.status()).toBe(200);

    const { data: row } = await db().from("shareholder_cases").select("*").eq("email", email).eq("case_type", "Proxy Interest").maybeSingle();
    expect(row).toBeTruthy();
    expect(row!.suspected_bot).toBe(true);

    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto("/member-portal/admin/proxy", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    await page.getByRole("button", { name: /^Registered interest/ }).click();
    const flaggedRow = page.locator("tr", { hasText: email });
    await expect(flaggedRow.getByText("Suspected bot")).toBeVisible();

    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      (window as unknown as { __capturedBlob?: Blob }).__capturedBlob = undefined;
      URL.createObjectURL = (obj: Blob) => {
        (window as unknown as { __capturedBlob?: Blob }).__capturedBlob = obj;
        return orig(obj);
      };
    });
    await page.goto("/member-portal/admin/proxy", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    await page.getByRole("button", { name: /^Registered interest/ })
      .locator("xpath=following-sibling::button[1]")
      .click();
    const csv = await page.evaluate(async () => {
      const blob = (window as unknown as { __capturedBlob?: Blob }).__capturedBlob;
      if (!blob) throw new Error("Export did not create a Blob via URL.createObjectURL");
      return blob.text();
    });
    expect(csv).not.toContain(email);
  } finally {
    await db().from("shareholder_cases").delete().eq("email", email).eq("case_type", "Proxy Interest");
    await setConfig("proxy_mode", modeBefore ?? "appointment");
  }
});

// ---------------------------------------------------------------------------
// 12. Direct vs nominee data-sharing statements are different strings
// ---------------------------------------------------------------------------

test("the direct and nominee consent statements on the appointment form are different strings", async ({ page }) => {
  await page.goto("/proxy", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#fullName", { timeout: 20_000 });

  await page.getByRole("radio", { name: /Directly on the Celtic share register/i }).check();
  const directText = await page.locator("body").innerText();
  expect(directText).toMatch(/provided to Computershare Investor Services PLC/i);

  await page.getByRole("radio", { name: /Through a nominee, broker, ISA, SIPP or platform/i }).check();
  const nomineeText = await page.locator("body").innerText();
  expect(nomineeText).toMatch(/not sent to Celtic plc/i);
  expect(nomineeText).not.toMatch(/provided to Computershare Investor Services PLC/i);
});
