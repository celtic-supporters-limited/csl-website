# Proxy and Requisition Build Audit

**Date:** 27 July 2026
**Prepared by:** Volunteer IT Lead
**Type:** Read-only audit. No application code was changed in this session.
**Audited against:** Director brief of 27 July 2026 (two instruments: Companies Act 2006 s.338 requisition, and AGM proxy appointment)
**Branch:** `develop` at commit `84e6b7f`

---

## 1. Summary

1. The requisition instrument is roughly half built and is **already live to the public** with a "Sign Resolution" link in the main site navigation. It is collecting real signatures today, with no gate and no solicitor sign-off.
2. **The resolution wording does not appear anywhere on the signing page.** People are currently signing a declaration to support a resolution whose text they are never shown, and the wording each person agreed to is not recorded against their signature.
3. The proxy instrument is **not built**. What exists at `/proxy` is a marketing page plus a five-field mailing-list capture. It has no address, no SRN, no share class, no signature, no date, and no appointee field of any kind.
4. **The public proxy page currently promises the exact thing the registrar rejects.** It tells shareholders in two places that CSL, the company, will be named as their proxy holder. The brief requires a named natural person and cites the Celtic Trust's 2025 rejection. 57 people have already registered on that promise.
5. The good news: the admin signature tracker counts correctly. It counts only direct registered holders toward the 100 and excludes nominee holders, which matches the statutory position in the brief.

---

## 2. Inventory

| Area | Route or file | What it does | State |
|---|---|---|---|
| Requisition public page | `app/resolution/page.tsx` | Hero, two explainer cards, live signature counter, renders the form. Reads `agm_signatures` and `site_config` via service-role client. `force-dynamic`. | Partial |
| Requisition form | `app/resolution/ResolutionForm.tsx` | 12-field client form, honeypot, Turnstile, prefill from session, success state with join CSL link | Partial |
| Requisition API | `app/api/resolution/sign/route.ts` | Rate limit 3/hour/IP, Turnstile verify, field validation, disposable-email check, duplicate check by email, derives shareholder and member tags, inserts | Partial |
| Requisition table | `sql/add-agm-signatures.sql` | `agm_signatures`, 16 columns, RLS insert-only for anon and authenticated, seeds `resolution_target = 100` | Partial |
| Requisition admin | `app/member-portal/admin/resolution/page.tsx` | `is_admin` guard, loads all signatures plus target, wraps in `PortalShell` | Built |
| Requisition admin UI | `app/member-portal/admin/resolution/ResolutionAdminClient.tsx` | Six KPI cards, progress bar, sortable table, RFC 4180 CSV export | Built |
| Nav entry (public) | `components/Nav.tsx:13` | `{ href: "/resolution", label: "Sign Resolution" }` under Take Action | Built |
| Nav entry (admin) | `components/PortalShell.tsx:173,231` and `app/member-portal/PortalClient.tsx:2275,2347` | "AGM Resolution Progress" sidebar item, duplicated across both nav sources | Built |
| Proxy public page | `app/proxy/page.tsx` | Hero, explainer, stats panel, 4-step process, renders form | Partial (marketing only) |
| Proxy form | `app/proxy/ProxyForm.tsx` | 5 fields: name, email, numShares, yearPurchased, source. Consent checkbox, honeypot, Turnstile | Missing (as a proxy instrument) |
| Proxy API | `app/api/proxy/route.ts` | Rate limit 5/10min/IP, Turnstile, validation, inserts to `shareholder_cases` with `case_type = 'Proxy Assignment'`, fires Resend notification and Zoho stub | Missing (as a proxy instrument) |
| Proxy table | none | Reuses `shareholder_cases` (`sql/phase-5-schema.sql`). Shares and year of purchase are concatenated into the free-text `notes` column at `app/api/proxy/route.ts:96-101` | Missing |
| Proxy tests | `tests/proxy-workflow.spec.ts` | 22 tests covering page structure, client validation, submission, API validation, rate limit, honeypot | Built (for the intent form only) |
| Requisition tests | none found | No test file references `/resolution` or `agm_signatures`. `tests/nav-labels.spec.ts:21,26` only asserts the admin sidebar label string | Missing |
| PDF generation | `@react-pdf/renderer` 4.5.1 in `package.json` | Present and in use, but only for membership and operations reporting (`components/MembershipReportPdf.tsx`, `components/OperationsReportPdf.tsx`). Nothing for proxy or requisition | Missing |
| Email out | `lib/resend.ts` | 16 exported senders. None relate to signatures, proxies or requisitions | Missing |
| Feature gate | none for either flow | Gate pattern exists and is proven elsewhere: `site_config` key plus admin toggle (`components/MembershipGateToggle.tsx`, `components/PortalGateToggle.tsx`, `POST /api/admin/site-config`) | Missing |

### Live data as at 27 July 2026

Read-only query against production via the service-role key:

- `agm_signatures`: **3 rows**. One direct-registered, one nominee-platform, one non-shareholder. All three tagged `member`. The single direct row has an SRN. Two of three supplied a share count. This looks like test data.
- `shareholder_cases` with `case_type = 'Proxy Assignment'`: **57 rows**.
- `site_config`: `resolution_target = 100`, `agm_date = NULL`, `membership_open = true`, `portal_open = true`, `active_members = 505`, `shares_represented = 15000`.

---

## 3. Requisition gap table (against Section 3.1)

| Requirement | Status | Evidence | Effort | Notes |
|---|---|---|---|---|
| Full name | Built | `ResolutionForm.tsx:176-186`; `agm_signatures.full_name` | - | Required client and server side |
| Address as four discrete fields | Partial | `ResolutionForm.tsx:201-214` single `<textarea name="postalAddress">`; `add-agm-signatures.sql:8` `postal_address TEXT` | M | Stored as one blob. Cannot be reliably split for registrar reconciliation. Requires schema change plus a migration of the 3 existing rows |
| Email | Built | `ResolutionForm.tsx:188-199`; unique constraint at `add-agm-signatures.sql:7` | - | Duplicate handled at `route.ts:125-136` and via 23505 fallback at `route.ts:177-182` |
| Celtic plc SRN | Partial | `ResolutionForm.tsx:265-280`; `route.ts:165` | S | Captured, but **optional**, and only shown when "direct" is selected. Label at `ResolutionForm.tsx:272` explicitly says "Leave blank if you don't have it to hand". A direct holder can sign with no SRN, which blocks reconciliation against the register |
| How held: direct or nominee platform | Partial | `ResolutionForm.tsx:238-263`; `add-agm-signatures.sql:10` | S | Two radios only |
| Nominee platform: dropdown plus Other | Missing | `ResolutionForm.tsx:283-294` free-text `<input>` | S | Free text, no list, no Other option. Not a database table, not a hardcoded array. Will produce inconsistent values ("HL", "Hargreaves", "Hargreaves Lansdown") |
| Year of purchase | Missing | Not present in `ResolutionForm.tsx`, `route.ts` or `add-agm-signatures.sql` | S | Exists on the proxy intent form as free text (`ProxyForm.tsx:199-210`) but not here. Dropdown values depend on the share register from David |
| Number of shares: dropdown | Partial | `ResolutionForm.tsx:296-308` `<input type="number">`; `add-agm-signatures.sql:13` `approximate_shares INTEGER` | S | Free numeric entry, not a constrained dropdown. Labelled "Approximate" and optional. Banding values depend on the share register from David |
| Share class: ORD, CCP, or both | Missing | No occurrence anywhere in `app/`, `lib/`, `components/` or `sql/` | S | Not captured in any form |
| Eligibility tick | Partial | `ResolutionForm.tsx:332-346` | S | Folded into the single combined declaration checkbox rather than a discrete tick. The separate "Are you a Celtic plc shareholder?" radio at `ResolutionForm.tsx:216-236` permits "No" and the submission still succeeds and is stored as `non-shareholder` (`route.ts:140-141`) |
| Resolution text shown in full, with a support tick | **Missing** | No resolution wording anywhere in `app/resolution/page.tsx` or `ResolutionForm.tsx`. No `resolution_text` or version column in `add-agm-signatures.sql` | M | See Finding 2. This is the largest single gap in the requisition flow |
| Resolution text as one editable block | Missing | No `site_config` key, no database column, no constant | S | The `site_config` pattern used for `resolution_target` (`add-agm-signatures.sql:35-37`) would serve directly |
| E-signature and date | Built | `ResolutionForm.tsx:348-366`; `route.ts:168-169` | - | Typed name. Date is server-generated (`new Date().toISOString()` at `route.ts:169`), not client-supplied. Good |
| Data consent tick tied to privacy policy, Article 6(1)(a) | Partial | `ResolutionForm.tsx:332-346`; privacy link at `ResolutionForm.tsx:393` | S | Consent text sits inside the combined declaration; the privacy policy link is in separate fine print below the button, not in the tick itself. Stored value is hardcoded `declaration_accepted: true` at `route.ts:170` rather than recorded from input, and no privacy policy version is stored |
| Not publicly signable until wording locked | **Missing** | `components/Nav.tsx:13` links it publicly; no gate in `app/resolution/page.tsx` | S | See Finding 1 |
| Downloadable PDF | Missing | No PDF component for this flow | M | `@react-pdf/renderer` already in the dependency tree and running inside Vercel serverless for reporting exports, so the pattern is proven |
| Email-out of the completed instrument | Missing | No sender in `lib/resend.ts` | M | |
| Join CSL prompt after completion | Built | `ResolutionForm.tsx:145-150` links to `/membership` | - | |
| CSV export with SRN and audit fields | Partial | `ResolutionAdminClient.tsx:92-117` | S | Exports 13 columns including SRN, signature date and both tags. Does not include `id`, raw `created_at` timestamp (date only, via `fmtDate` at `line 94`), IP or user agent |

---

## 4. Proxy gap table (against Section 3.2)

The existing `/proxy` flow is an expression of interest. Measured as a proxy appointment instrument, almost nothing is built.

| Requirement | Status | Evidence | Effort | Notes |
|---|---|---|---|---|
| **Appointee locked to a named natural person** | **Missing** | No appointee field, constant or default exists anywhere. The only occurrence of the director's name in the codebase is `app/our-team/page.tsx:31` | M | See Findings 3 and 4. Highest severity item in this audit |
| Full name | Built | `ProxyForm.tsx:153-168` | - | Labelled "as registered with Computershare" |
| Email | Built | `ProxyForm.tsx:170-184` | - | |
| Address, four discrete fields | Missing | Not present in `ProxyForm.tsx`; `shareholder_cases` has no address column | M | |
| SRN | Missing | Not present in `ProxyForm.tsx` or `app/api/proxy/route.ts` | S | |
| How held: direct or nominee with platform | Missing | Not present | S | |
| Number of shares | Partial | `ProxyForm.tsx:186-197` free text, placeholder "e.g. 500 Ordinary + 500 Preference" | S | Concatenated into the `notes` text column at `route.ts:96-101`. Not queryable, not countable |
| Share class | Missing | No dedicated field. Members are informally encouraged to type it into the shares free-text box | S | |
| E-signature | Missing | Not present | S | |
| Date | Missing | Only `shareholder_cases.created_at` | S | |
| Consent | Partial | `ProxyForm.tsx:228-246` | S | Client-side gate only. `route.ts:103-112` inserts `contact_name`, `email`, `case_type`, `enquiry_source`, `notes`, `status`. **The consent tick is never stored.** No column exists for it |
| Activation gate pending Notice of AGM | Missing | No gate in `app/proxy/page.tsx`; `site_config.agm_date` is `NULL` | S | |
| Separate proxy table | Missing | Shares `shareholder_cases` with share tracing enquiries | M | |
| Downloadable PDF | Missing | - | M | |
| Email-out | Partial | `lib/resend.ts` `sendProxyNotification()` called at `route.ts:122-131` | M | This notifies volunteers of a new enquiry. It does not send a completed instrument to the member |
| Nominee platform instruction letter | Missing | - | M | |
| "I have sent this" confirmation state | Missing | No column, no UI | S | |
| We-lodge vs member-lodges path | Missing | No such concept in the code | M | |
| Join CSL prompt after completion | Built | `ProxyForm.tsx:121-126` | - | |
| Per-person audit trail and admin export | Missing | No admin view for proxy records. `shareholder_cases` surfaces in the member portal My Enquiries tab and the admin cases view, not as a proxy register | M | |
| Tests asserting the appointee | Missing | `tests/proxy-workflow.spec.ts` has 22 tests, none reference an appointee | S | |

---

## 5. Findings and risks

**Finding 1 - The requisition page is live to the public with no gate and no locked wording. Severity: High.**
Ref Section 3.1 constraint and Section 4.2 item 7. `components/Nav.tsx:13` publishes "Sign Resolution" in the main Take Action menu. `app/resolution/page.tsx` has no activation check. Commit `32aa904` ("make resolution page public with site layout and nav link") deliberately published it. Anyone can sign right now. The brief states the page must not be publicly signable until the wording is confirmed as locked. Three signatures are already stored.

**Finding 2 - The resolution text is not shown to signatories and is not recorded against their signature. Severity: High.**
Ref Section 4.5 item 17. There is no resolution wording anywhere in `app/resolution/page.tsx` or `app/resolution/ResolutionForm.tsx`. The declaration at `ResolutionForm.tsx:342` reads "I support Celtic Supporters Limited requisitioning a resolution at the next Celtic plc Annual General Meeting", with no resolution attached. `agm_signatures` has no column for resolution text or version (`sql/add-agm-signatures.sql:4-20`). Consequence: we cannot currently prove what any individual agreed to, and if the solicitor changes the wording after collection there is no version boundary in the data. Recorded, not fixed, per session instruction.

**Finding 3 - Public proxy copy names CSL as the proxy holder, which is the form the registrar rejects. Severity: High.**
Ref Section 3.2. Three places state or imply it:
- `app/proxy/page.tsx:121` - "CSL sends you the official Proxy Form naming Celtic Supporters Limited as your proxy holder."
- `app/proxy/page.tsx:62-66` - "By assigning your proxy to CSL, you direct your shares' votes to us."
- `app/proxy/ProxyForm.tsx:117-120` - success state, "We'll send you the official proxy form ahead of the next Celtic PLC AGM."

The brief is explicit that the appointee must be a named natural person and must never be CSL or the CSL Chair as an entity, citing the Celtic Trust rejection in 2025. 57 people have registered proxy intent against this promise and are expecting a form naming CSL.

**Finding 4 - No appointee field exists in any code path, so every current record has a null appointee. Severity: High.**
Ref Section 4.4 items 13, 14 and 15. There is no field, constant, default or server-side validation naming a proxy appointee anywhere in `app/`, `lib/` or `components/`. The director's name appears once in the entire codebase, as biography content at `app/our-team/page.tsx:31`. No automated test asserts an appointee value. In mitigation, no proxy is actually lodged today, so the null appointee is not currently reaching a registrar. The risk is that the appointee rule has no implementation to inherit and must be built from zero, with the locking and server-side validation designed in from the start rather than added later.

**Finding 5 - Consent on the proxy form is a client-side gate and is never stored. Severity: High.**
Ref Section 4.8 item 30. `ProxyForm.tsx:228-246` requires the tick before submit, but `app/api/proxy/route.ts:103-112` does not send it and `shareholder_cases` has no column for it. For all 57 existing proxy records we hold personal data with no stored evidence of the Article 6(1)(a) consent that is our stated lawful basis. On the requisition side the position is better but still weak: `route.ts:170` writes a hardcoded `declaration_accepted: true` rather than the submitted value, and no privacy policy version is recorded.

**Finding 6 - Direct registered status is entirely self-declared and SRN is optional. Severity: High.**
Ref Section 4.6 items 20 and 21. `app/api/resolution/sign/route.ts:139-146` derives `shareholder_tag` purely from what the signatory selected. `computershareSrn` is optional at `route.ts:165` and the form actively invites leaving it blank (`ResolutionForm.tsx:272`). Consequence: the headline count toward 100 can include people who believe they are on the register but are not, and rows with no SRN cannot be reconciled against the register before lodgement. The 100 could be reached on paper and fail on verification.

**Finding 7 - No append-only protection on signature data. Severity: Medium.**
Ref Section 4.5 item 18. `sql/add-agm-signatures.sql:22-32` grants `ALL` on the table to `service_role`. There is no update or delete trigger, no revision history and no `updated_at` column. Any code path or operator holding the service-role key can silently amend or remove a signature with no trace. For an instrument that may be produced as evidence to a registrar, that is a weak evidential position.

**Finding 8 - No IP address or user agent captured at signature time. Severity: Medium.**
Ref Section 4.5 item 19. `app/api/resolution/sign/route.ts:159-173` stores none. The request IP is read at `route.ts:14` for rate limiting only and discarded. Typed-name e-signatures carry more weight with corroborating request metadata.

**Finding 9 - The two instruments are separate, but the proxy side has no instrument at all. Severity: Medium.**
Ref Section 4.2 item 5. Positive finding on separation: requisition and proxy use different routes (`/resolution` vs `/proxy`), different APIs, and different tables (`agm_signatures` vs `shareholder_cases`). They share nothing except common infrastructure (Turnstile, the disposable-email blocklist, the rate-limiter pattern, prefill from session). The risk is the reverse of merging: `shareholder_cases` is a general enquiry table shared with Share Tracing, so proxy records sit alongside unrelated casework with no proxy-specific columns and no proxy admin register.

**Finding 10 - Share data is stored in a form that cannot support a value test. Severity: Medium.**
Ref Section 4.6 item 22. On the requisition side `approximate_shares` is an optional integer with no share class, so an ORD and a CCP holding cannot be distinguished. On the proxy side the share count is free text concatenated into `shareholder_cases.notes` at `app/api/proxy/route.ts:96-101` and is not queryable at all. If the solicitor specifies any per-member value test, neither dataset can currently answer it.

**Finding 11 - No test coverage on the requisition flow. Severity: Medium.**
Ref Section 4.1 item 3. No test file references `/resolution`, `/api/resolution/sign` or `agm_signatures`. `tests/nav-labels.spec.ts:21,26` asserts only the admin sidebar label. The proxy intent form by contrast has 22 tests in `tests/proxy-workflow.spec.ts`, all passing at last run per commit `e22599e`. The instrument with legal effect is the untested one. I did not execute the Playwright suite in this session, so "passing" is taken from the commit message, not verified.

**Finding 12 - Nominee platform captured as free text. Severity: Low.**
Ref Section 4.3 item 11. `ResolutionForm.tsx:283-294`. No canonical list, so reconciliation and any future bulk instruction to a platform will require manual cleanup.

**Finding 13 - Duplicate control is by email only. Severity: Low.**
`sql/add-agm-signatures.sql:7` puts a unique constraint on email. One household with one shared email address cannot register two separate registered holders. Conversely one person can sign twice using two email addresses. Flagged for the solicitor to confirm what identity basis the count must stand on.

**Finding 14 - Counting logic is correct and conservative. Severity: none, positive finding.**
Ref Section 4.6 items 20 and 21. Both the public counter (`app/resolution/page.tsx:28-30`) and the admin tracker (`ResolutionAdminClient.tsx:72,78`) compute progress as `shareholder_tag === "direct-registered"` divided by `resolution_target`. Nominee and non-shareholder signatures are counted and displayed separately and are excluded from the progress figure. The public page explains the distinction correctly at `app/resolution/page.tsx:82-89`. The concern raised in the brief, that nominee holders might be inflating the qualifying total, does not apply. The overstatement risk that does apply is Finding 6, self-declaration without verification.

**Finding 15 - Supabase region not verifiable from the codebase. Severity: Low, unresolved.**
Ref Section 4.8 item 31. `.env.local` gives the project URL `https://mixwriunejiaxbpgxqmp.supabase.co`. The project reference does not encode the region. `CLAUDE.md` states EU West (Ireland) and records EU data residency as confirmed. I could not verify this from code and did not check the Supabase dashboard. Treat as asserted, not audited.

### Data protection position, summarised

Ref Section 4.8 item 29. SRN is stored in plain text at `add-agm-signatures.sql:11`, with no encryption and no column-level restriction. RLS on `agm_signatures` is sound: `add-agm-signatures.sql:25-32` grants INSERT only to `anon` and `authenticated`, with no SELECT, UPDATE or DELETE policy, so those operations are blocked for both roles. The anon key cannot read the signature table. All reads go through the service-role client (`getSupabase()`), used in `app/resolution/page.tsx:15` for counts and `app/member-portal/admin/resolution/page.tsx:15` behind an `is_admin` guard. The weakness is not the read path, it is the unrestricted service-role write path described in Finding 7.

---

## 6. Open questions for the director or solicitor

1. Do we take the "Sign Resolution" link out of the public navigation now, and treat the three existing signatures as test data to be cleared, or does the page stay up while wording is finalised?
2. Must every signatory be shown the exact resolution text and tick a specific "I support this resolution" box, separate from the general declaration? Assumed yes from Section 3.1, and it drives the schema.
3. If the wording changes after signatures are collected, do earlier signatories have to re-sign, or does a recorded version stamp against each signature suffice? This determines whether we need a versioned resolution record or a hard reset of the signature table at wording lock.
4. Is an SRN mandatory for a direct registered holder, or may they sign without one and be reconciled by name and address? Currently optional, which is the main threat to a verifiable 100.
5. What is the identity basis for the count of 100: one email address, one natural person, or one entry on the register? This affects the duplicate rule in Finding 13.
6. For the proxy, is the appointee always the same named director, or is a fallback second natural person required if he cannot attend? A locked single value is simpler and safer, but has no fallback.
7. What exact wording should replace the current public statements that CSL will be named as proxy holder (`app/proxy/page.tsx:62-66` and `:121`)? These are live and contradict the brief.
8. What do we tell the 57 people who have already registered proxy intent, and when?
9. We-lodge or member-lodges as the default for direct holders? The brief says default to we-lodge until the solicitor confirms. Confirming early avoids building both paths at once.
10. Does CSL bulk-lodging to Computershare require anything from the signatory beyond the completed appointment, such as a wet signature or a posted original?
11. Is share class required on the requisition, or only on the proxy? It is absent from both today.
12. Do we need the signatory's IP address and user agent stored as corroborating evidence? This is a data protection trade-off and should be a deliberate decision, not a default.
13. Which privacy policy version should each consent record point to, and do we need to version the policy itself to support that?

---

## 7. Proposed build sequence

No calendar dates. Effort only.

**Dependency A:** final resolution wording from the solicitor.
**Dependency B:** share register from David, needed for the year-of-purchase and share-count dropdown values.
**Dependency C:** Celtic plc Notice of AGM, needed before any proxy can be lodged.

### Package 1 - Stop the bleed. Effort: S. No dependencies.
Add a `site_config` gate for the requisition flow (`resolution_open`) and one for the proxy flow (`proxy_open`), following the proven `membership_open` pattern: `site_config` key, admin toggle component, `POST /api/admin/site-config`. Gate both the page and the API route, not just the page. Remove or hide the public nav link while closed. Correct the two `app/proxy/page.tsx` statements and the `ProxyForm.tsx` success text that name CSL as proxy holder. This package is the prerequisite for everything else and should not wait on any input.

### Package 2 - Requisition schema and evidential integrity. Effort: M. Depends on decisions in Section 6 items 2, 3, 4.
Four discrete address fields, share class, year of purchase, constrained share bands, mandatory SRN for direct holders, discrete eligibility tick, resolution text plus version recorded against each signature, consent recorded as submitted data with a privacy policy version, IP and user agent if approved. Includes a migration path for the 3 existing rows. Build the schema before the wording lands so only the text has to drop in.

### Package 3 - Resolution text as one editable block. Effort: S. Depends on A.
Single `site_config`-backed block rendered in full above the declaration, with the support tick. Version identifier stamped onto every signature at insert. Testable immediately with placeholder text.

### Package 4 - Requisition test coverage. Effort: M. No dependencies.
Mirror `tests/proxy-workflow.spec.ts` for `/resolution` and `/api/resolution/sign`. Must include: gate closed blocks submission, resolution version is stamped, SRN required for direct holders, tag derivation, duplicate handling, consent stored.

### Package 5 - Proxy instrument. Effort: L. Depends on decisions in Section 6 items 6, 9, 10.
New `agm_proxies` table, separate from `shareholder_cases`. Full identity block, SRN, how held, share class, share count, e-signature, server-generated date, stored consent. Appointee locked and pre-filled to the named director, with server-side validation rejecting any submission whose appointee is blank, null or substituted, and a test asserting it. Direct and nominee branches. Admin register with CSV export matching the requisition tracker.

### Package 6 - Nominee path and confirmation state. Effort: M. Follows Package 5.
Pre-filled platform instruction addressed to the member's platform, with an "I have sent this" state on the record so the vote can be expected. No platform credentials requested or stored at any point.

### Package 7 - PDF output and email-out, both flows. Effort: M. Follows Packages 3 and 5.
`@react-pdf/renderer` is already a dependency and already runs inside Vercel serverless limits for the membership and operations exports, so the pattern is proven. Add a Resend sender for each instrument.

### Package 8 - Reconciliation tooling. Effort: M. Depends on B.
Match stored SRNs against the share register, flag self-declared direct holders who do not appear, and produce a verified qualifying count distinct from the raw self-declared count. This is what turns Finding 6 from a risk into a managed process, and it is what makes the 100 defensible.

### Package 9 - Canonical nominee platform list. Effort: S. Can run alongside anything.
Replace the free-text platform input with a constrained list plus Other, used by both flows.

### Package 10 - Proxy activation. Effort: S. Depends on C.
Flip the proxy gate once the Notice of AGM is issued and the director gives the word. No build work beyond the gate from Package 1, provided Packages 5 to 7 have landed.

Not in scope, per the brief: automated submission to Computershare. Manual lodgement only.
