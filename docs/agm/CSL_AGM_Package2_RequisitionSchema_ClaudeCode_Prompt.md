# CSL Claude Code Prompt - AGM Package 2, Requisition Schema and Capture

**Date:** 28 July 2026
**Author:** Gary Phinn, Volunteer IT Lead
**Brief version this assumes:** 1.1
**Source:** `docs/2026-07-27_Proxy_Requisition_Audit.md` Package 2 and Section 3 gap table, and the
director brief of 27 July 2026 Section 3.1.

---

## 1. Session instruction

Read `CLAUDE.md`, then `docs/agm/CSL_AGM_Programme_ClaudeCode_Briefing.md`, then the audit. If the
brief version above does not match the repository copy, stop and tell me.

Confirm the scope back to me before writing code.

Work directly on `develop`. No feature branch. Commit as `AGM P2: rebuild requisition capture
schema`. Do not merge to `main`.

**The requisition gate stays closed throughout.** Nothing in this package opens it, and it should
be closed when you finish.

---

## 2. What this package is

The requisition is the Companies Act 2006 section 338 instrument that puts a CSL resolution onto
the Celtic plc AGM agenda. It needs 100 qualifying shareholders and has to reach the company in
early to mid October.

The existing capture at `/resolution` is roughly half built against the director brief. Package 2
rebuilds the data model and the form so every field the brief specifies is captured, in a shape
that can be reconciled against Celtic's share register before lodgement.

**Staging data is disposable. Production `agm_signatures` is not.** Correcting an earlier
instruction and the audit, which both described these as test data.

Production holds **two real records** from real people, both CSL members. One is a shareholder,
one is not. They must not be silently destroyed. Section 4a says exactly what to do with them.

Staging can be dropped and recreated freely. Do not write migration or backfill logic for staging.

**Out of scope, do not build:** the resolution text block and its rendering, which is Package 3.
PDF output and email-out, which is Package 7. Reconciliation against the register, which is
Package 8. Anything to do with the proxy instrument. Package 2 creates the columns that Package 3
will write to, and stops there.

---

## 3. The target schema

Recreate `agm_signatures`. Every field below comes from the director brief Section 3.1 unless
noted.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid pk | | |
| `full_name` | text | yes | |
| `address_line_1` | text | yes | Four discrete fields, not one blob. The audit found a single textarea, which cannot be reconciled against the register |
| `address_line_2` | text | no | |
| `address_town` | text | yes | |
| `address_postcode` | text | yes | |
| `email` | text unique | yes | |
| `computershare_srn` | text | conditional | **Mandatory when `how_held` is direct.** Optional for nominee holders, who do not have one |
| `how_held` | enum | yes | `direct` or `nominee` |
| `nominee_platform` | text | conditional | Required when `how_held` is nominee. Constrained list plus Other, see section 5 |
| `nominee_platform_other` | text | no | Free text, only when platform is Other |
| `year_of_purchase` | text | no | Config-driven dropdown, see section 5 |
| `shares_held` | text | no | Config-driven band dropdown, see section 5 |
| `share_class` | enum | yes | `ORD`, `CCP` or `BOTH`. Absent from the codebase entirely today |
| `eligibility_confirmed` | boolean | yes | Discrete tick, its own field, not folded into a combined declaration |
| `resolution_supported` | boolean | yes | Discrete tick. Package 3 renders the text this refers to |
| `resolution_version_id` | uuid or text | yes | **See section 4.** Nullable at database level only because Package 3 has not landed; the API must reject a null once it has |
| `signature_name` | text | yes | Typed e-signature |
| `signed_at` | timestamptz | yes | **Server-generated.** Never accept a client-supplied value |
| `consent_given` | boolean | yes | Recorded from the submitted value, not hardcoded |
| `privacy_policy_version` | text | yes | Which version of the policy the consent points at |
| `signer_ip` | inet | no | See section 6 |
| `signer_user_agent` | text | no | See section 6 |
| `created_at` | timestamptz | yes | Default now |

Derived, not submitted: keep whatever tag the admin tracker uses to identify direct registered
holders. The audit confirms the counting logic is correct and counts only direct holders toward
the 100. **Do not change the counting logic.** It is the one part of this flow that was already
right.

RLS: preserve the current posture, which the audit assessed as sound. Insert only for `anon` and
`authenticated`, no select, update or delete policy, all reads through the service-role client
behind an `is_admin` guard.

---

## 4. Resolution version binding

This is the part of Package 2 that cannot be fixed later, so build it deliberately.

A signature is only defensible if we can prove what the person actually agreed to. If the
solicitor amends the wording after collection has started and the text is a single mutable value,
every prior signature becomes unprovable. That is not a theoretical risk: the wording is with the
solicitor now and is expected to change.

So the resolution text must be versioned, and each signature must record which version it was
signed against. Package 2 creates the version table and the foreign key. Package 3 builds the
editing and rendering and starts writing real values.

Create a table along these lines, name it as you see fit:

| Field | Notes |
|---|---|
| `id` | Referenced by `agm_signatures.resolution_version_id` |
| `body` | The resolution wording |
| `version_label` | Human readable, for the admin view and the export |
| `created_at` | |
| `created_by` | |
| `is_current` | Exactly one row true at a time |

Versions are **append only**. Editing the wording creates a new row, it never updates an existing
one. Enforce that a version which has signatures against it can never be modified or deleted, at
the database level rather than in application code, because application code is where this rule
will eventually be bypassed by accident.

Seed one placeholder version so the schema is exercisable before the solicitor's wording arrives.

---

## 4a. The two real production records

Before touching production, **export both rows to a file and hand it to me.** Do not put it in the
repository, it is personal data. That export is the safety net for everything below.

Then preserve them into the rebuilt table. They cannot satisfy the new required fields, because
the old form never collected a discrete address, share class, or a resolution version, so:

- Add a `capture_status` column, values along the lines of `complete` and `pre_rebuild`.
- Insert both records as `pre_rebuild`, mapping across every field that does exist, leaving the
  rest null. Relax the not-null constraints so this is possible, and enforce completeness in the
  API for new submissions instead. Say plainly in your report which constraints you relaxed.
- **Records marked `pre_rebuild` must be excluded from the qualifying count toward 100** and shown
  separately in the admin view as needing completion, in the same way nominee and non-shareholder
  rows are already shown separately.
- The non-shareholder of the two does not belong in `agm_signatures` under section 7. Move it to
  `agm_supporters` rather than deleting it, preserving name, email, consent and timestamp.

**Why the shareholder record cannot count toward the 100 as it stands.** Audit Finding 2 records
that no resolution wording appears anywhere on the signing page, and that the declaration reads "I
support Celtic Supporters Limited requisitioning a resolution at the next Celtic plc Annual
General Meeting" with no resolution attached. A section 338 request has to specify the resolution.
A signature supporting an unspecified future resolution almost certainly does not satisfy it, and
there is no version stamp to prove otherwise.

So that person will need to sign again once the wording is locked. They are a CSL member and
reachable, so this is a short conversation rather than a lost signature. What we are preserving is
the contact, the consent record and the evidence of willingness, not a usable signature. Do not
let the preserved row be counted as though it were one.

---

## 4b. CSV export

The Export CSV on the admin Resolution Progress page produces the working document for
reconciliation and eventually for lodgement, so it has to follow the schema rather than lag it.
The audit found it at `ResolutionAdminClient.tsx:92-117` exporting 13 columns, missing the row
`id`, the raw `created_at` timestamp (it exports date only, via `fmtDate`), and any audit fields.

Update it in this package:

- Every new field from section 3, including the four address fields and share class.
- Row `id` and full ISO `created_at` and `signed_at` timestamps, not formatted dates. This is a
  reconciliation file, not a report.
- `resolution_version_id` and its human readable label, so an export states which wording each
  person signed.
- `capture_status`, so incomplete pre-rebuild rows are visibly distinct.
- `signer_ip` and `signer_user_agent` columns present, empty while the capture flag is off.
- Keep RFC 4180 quoting, which the audit confirms is already correct.

---

## 5. Config-driven option lists

Year of purchase, share bands and the nominee platform list all need constrained values, and the
authoritative values depend on the share register which has not arrived from David.

Build all three reading their options from `site_config`, seeded with placeholder values, so the
real values can be dropped in without a code change or a deploy. Use the same `site_config`
pattern the gates use, and read them through the existing uncached helper from
`lib/site-gates.ts` or its equivalent, so a change to the options takes effect immediately.

Validate server side against the configured list. A submission carrying a value not in the list is
rejected, otherwise the constraint is decorative.

The nominee platform list needs an Other option with a free text field, per the director brief.
Seed it with the platforms you would expect for UK retail shareholdings, and say in your report
what you seeded so I can correct it.

---

## 6. IP address and user agent

The brief asks for a per-person audit trail. IP and user agent add corroborating weight to a typed
e-signature, but they are personal data and collecting them "just in case" is exactly what data
minimisation prohibits. Brian has not yet decided.

So: create the columns, and put the capture behind a `site_config` flag defaulting to **off**,
read through the same uncached helper as the gates. Nothing is captured until the flag is turned
on. Prove it by flipping the flag on a deployed Preview and confirming capture starts and stops,
per the standing rule on runtime controls.

---

## 7. Non-shareholders

The director brief says the requisition is open to members and non-members, but only if they are
Celtic shareholders. The current form lets someone answer "No" to the shareholder question and
still submit, and stores them in `agm_signatures` tagged as a non-shareholder. That mixes people
who cannot sign into the signature record.

**Decision: the requisition rejects non-shareholders, and offers them something else instead.**

- `agm_signatures` accepts only shareholders. A submission where the person is not a shareholder
  is rejected by the API with a clear message, not stored in this table.
- Create a separate lightweight `agm_supporters` table, name it as you prefer: name, email,
  consent, privacy policy version, timestamp. No SRN, no share fields, no signature.
- The form, on selecting "I am not a Celtic plc shareholder", switches to the supporter path
  rather than dead-ending. The wording should make clear that they cannot sign the requisition but
  that their support is wanted, and it should route to Join CSL.

This keeps the instrument clean while keeping the campaign contact, which is the whole point of
having them on the page.

---

## 8. Validation

Enforce every rule server side as well as client side. The audit found several rules that existed
only in the browser, including the consent tick on the proxy form which was required to submit and
then never stored.

Specifically:

- SRN required when `how_held` is direct. This is the main threat to a verifiable 100: the audit
  found SRN optional and the form actively inviting people to leave it blank, which produces rows
  that cannot be reconciled against the register.
- Nominee platform required when `how_held` is nominee.
- All three ticks true: eligibility, resolution supported, consent.
- `signed_at` server-generated, client value ignored if supplied.
- Dropdown values must be members of their configured list.
- Duplicate handling: keep the existing behaviour on email uniqueness. The audit raises at Finding
  13 that email is a weak identity basis, but changing it is a solicitor question and is not in
  this package. Leave it and note it.

---

## 9. How this is proved

Test what this package touches. Do not run the full regression suite. Run against the `develop`
Preview, not localhost, not production.

Extend `tests/site-gates.spec.ts` only where gate behaviour changes. Otherwise create a
requisition capture test file covering:

1. A valid direct holder submission with all fields succeeds and writes exactly the values
   submitted, including consent as submitted rather than hardcoded true.
2. A direct holder submission with no SRN is rejected.
3. A nominee submission with no platform is rejected.
4. A submission with a share class outside the enum is rejected.
5. A submission with a dropdown value not in the configured list is rejected.
6. A non-shareholder submission does not write to `agm_signatures`, and the supporter path writes
   to `agm_supporters`.
7. `signed_at` is server-generated: submit a client value and confirm it is ignored.
8. With the IP capture flag off, no IP or user agent is stored. Flip it on, confirm capture
   starts. Flip it off, confirm it stops. On the deployed Preview.
9. A signature records a `resolution_version_id`, and the referenced version cannot then be
   modified or deleted.
10. A `pre_rebuild` row is excluded from the count toward 100 and appears separately in the admin
    view.
11. The CSV export contains every column listed in section 4b, and a `pre_rebuild` row is
    distinguishable in it.

Item 9 is the one that matters most. Everything else in this package is recoverable.

**Before any production write:** report the current production row count, state what you are about
to change, and wait for me to confirm. Do not apply the production rebuild in the same step as the
staging one.

Do not poll `vercel ls` while waiting for the Preview. Poll the endpoint.

---

## 10. Report back

Per the programme brief section 5. In addition:

1. The final schema as created, so I can check it against the brief field by field.
2. What you seeded into each of the three config option lists.
3. Whether the version immutability is enforced at the database level or only in application code,
   and if only in application code, why.
4. Anything in the director brief Section 3.1 you could not implement, and what is blocking it.

Leave the requisition gate closed. State the gate states at the end of your session.

No em dashes. Cite file paths for every claim.
