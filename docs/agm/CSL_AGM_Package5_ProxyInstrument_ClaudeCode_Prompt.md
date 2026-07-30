# CSL Claude Code Prompt - AGM Package 5, Proxy Instrument

**Date:** 29 July 2026
**Author:** Gary Phinn, Volunteer IT Lead
**Brief version this assumes:** 1.4
**Model:** Sonnet 5. The design decisions are made below, the patterns all exist in the repository,
and the appointee rule is implemented by removing a code path rather than by defending one. Escalate
to Opus only if the scope confirmation raises a design problem, or if something behaves
unexplainably mid-session.

**Reference for anything signatory-facing:** `docs/agm/reference/` per brief section 2b, plus
**Celtic plc's own Notice of AGM and proxy form** from the 2025 cycle, at
`https://cdn.celticfc.com/assets/AGM_Notice_2025.pdf`. Our appointment has to be acceptable to the
same registrar that processes theirs, so their form is the practical standard for what a Celtic
proxy looks like. Read it before writing any proxy wording, and say what you took from it.

---

## 1. Session instruction

Read `CLAUDE.md`, then `docs/agm/CSL_AGM_Programme_ClaudeCode_Briefing.md`, then
`docs/2026-07-27_Proxy_Requisition_Audit.md` sections 4 and 5, then `docs/AGM_Build_Status.md`.
Standing rules live in the brief and are not repeated here.

Confirm scope in about 200 words plus blockers before writing code.

Work on `develop`. Commit as `AGM P5: proxy appointment instrument`.

---

## 2. Proportionality, read this before anything else

CSL is a volunteer-led not-for-profit, not a financial services company. Earlier packages in this
programme set a precedent of heavy engineering that was right for the requisition, where a
signature has to be provable years later. **Do not carry all of it across.**

What stays, because the registrar rejects otherwise or because the record is the point:

- The appointee is locked to a named natural person and validated server side.
- The record stores who was appointed, so we can show what each member actually authorised.
- Server-side validation, because client-only rules produce wrong data rather than because of
  attackers.

What does not:

- No version table, no immutability trigger, no admin version management for the proxy. A single
  text snapshot column on the record is enough and is specified below.
- No IP or user agent capture.
- No encryption, no additional identity verification, no multi-layer checks.
- No drawn signature canvas. A typed name is what we are using.

If you find yourself building infrastructure rather than a form, stop and ask. The people
operating this are two volunteers, and a process they cannot run unaided is worse than a simpler
one.

---

## 3. Two flows, three states

A proxy is specific to one meeting and can only be appointed after Celtic issues the Notice of
AGM. Before that, the page records an intention. Both are wanted, and the page stays publicly
open throughout, because CSL wants members and non-members to see it is serious about the AGM.

Replace the binary `proxy_open` with a single `site_config` key, `proxy_mode`, with three values:

| Mode | Page behaviour |
|---|---|
| `closed` | Explainer only, no capture. The current closed state |
| `interest` | Expression of interest capture. Not an appointment |
| `appointment` | Full proxy appointment. Only after the Notice of AGM |

Read it through the same uncached helper as the other gates, and fail closed on a read error. The
admin control becomes a three-way selector rather than a toggle, in the same place as the others,
and the effective-state notice must say which mode is live and what it means.

**The interest flow already exists.** `app/proxy/ProxyForm.tsx` captures name, email, shares, year
and source into `shareholder_cases`. Keep it. Three changes only: rename the case type from
`Proxy Assignment` to `Proxy Interest` so nobody later mistakes those rows for appointments, store
the consent value rather than discarding it (audit Finding 5), and add `meeting_ref`.

Set `proxy_mode` to `interest` at the end of your session on staging. Leave production `closed`
until Gary says otherwise.

---

## 4. The appointee rule

The most important thing in this package to get right, though not something to build defensively
around. CSL will run a small pilot in production, ten records or so, export them, and have them
reviewed before any volume campaign. That pilot catches a wrong appointee immediately, which is
better protection than anything designed in advance. Build it correctly and simply, and let the
pilot verify it.

The appointee is **Brian McLaughlin**, a named natural person. It must never be blank, null,
defaulted to the Chairman of the meeting, or substituted by the user. Celtic's own form defaults
to the Chairman. The Celtic Trust had proxies rejected in 2025 for naming an organisation rather
than a person.

Implementation, kept deliberately simple:

- The name lives in one place, in configuration rather than scattered through the code. The
  existing `lib/agm-appointee.ts` from Package 1 is the right home. It may change, so one edit
  should be sufficient.
- The server sets it. **Never read an appointee value from the request body.** If the client
  cannot supply it, it cannot be substituted, and no validation is required to prevent something
  that has no code path.
- Store `appointee_name` on every row, so the record shows who was appointed rather than relying
  on a config value that may change later.
- One test asserts a stored appointment carries the correct name. One test asserts that a request
  attempting to supply its own appointee is ignored rather than honoured.

That is the whole rule. Do not add layers to it.

---

## 5. Schema: `agm_proxies`

New table, separate from `shareholder_cases`. Interest is a lead, an appointment is an instrument,
and they do not belong together.

| Column | Null | Notes |
|---|---|---|
| `id` | no | |
| `meeting_ref` | no | Read live from `current_meeting_ref`, not from the column default. Legally necessary: a proxy is specific to one meeting |
| `full_name` | no | |
| `address_line_1`, `address_town`, `address_postcode` | no | |
| `address_line_2` | yes | |
| `email` | no | Unique with `meeting_ref`, not alone |
| `computershare_srn` | yes | Required when `how_held` is direct |
| `how_held` | no | `direct` or `nominee` |
| `nominee_platform`, `nominee_platform_other` | yes | Required when nominee. Reuse the Package 2 config list |
| `shares_held` | yes | Reuse the Package 2 config bands |
| `share_class` | yes | Reuse the Package 2 enum including `UNSURE` if present |
| `appointee_name` | no | Server-set. See section 4 |
| `declaration_snapshot` | no | Copy of the appointment wording shown at signing. A plain text column, not a version table |
| `signature_name` | no | Typed |
| `signed_at` | no | Server-generated |
| `consent_given` | no | Stored as submitted |
| `privacy_policy_version` | no | |
| `lodgement_path` | no | Default `we-lodge` |
| `nominee_instruction_sent` | yes | The "I have sent this" confirmation |
| `status` | no | `active` or `revoked`, default `active`. See section 5a |
| `revoked_at`, `revoked_reason` | yes | Set when status becomes `revoked` |
| `created_at` | no | |

RLS matching `agm_signatures`: insert only for `anon` and `authenticated`, no select, update or
delete policy, all reads through the service role client. Include the GRANT in the same script.

Write the SQL, Gary runs it. Rehearse on staging before production, per the brief.

---

## 5a. Revocation, built in from the start

A member can revoke a proxy before the meeting. That is their right, not a favour, and it will
happen. The requisition flow was built without any way to remove a signature and that is now logged
as a gap; do not repeat it here.

Build it as a status change, not a delete: an admin action setting `status` to `revoked` with a
timestamp and a short reason, the row excluded from all counts and marked in the export, and the
record retained. You want the evidence that a revocation happened, and CSL may need to show the
registrar which appointments in a lodged block are no longer live.

Confirm before revoking, and name the person in the confirmation. One click, no workflow.

---

## 5b. Consent and data sharing on the proxy page

The proxy page currently has a consent tick and **no statement anywhere of what happens to the
data**, so members are agreeing to something the page never describes. The consent value is also not
stored, which is audit Finding 5.

Fix both. Store the consent as submitted, with a privacy policy version, exactly as the requisition
flow does. And state plainly what happens to the details, which differs by branch:

- **Direct holders on the we-lodge path:** their name, address, shareholding details and signature
  are provided to Computershare as part of the proxy appointment.
- **Nominee holders:** their details go to their own platform, sent by them, and CSL retains a
  record that they said they had sent it.

Two branches, two statements, no shared string. The requisition flow made this mistake and it took
a session to unpick: one static sentence rendered on both paths contradicted the consent above it.

---

## 6. Direct and nominee branches

**Direct holders.** The flow produces a completed appointment naming Brian McLaughlin. Default
`lodgement_path` to `we-lodge`, meaning CSL lodges the block with Computershare. Build only that
path. Do not build a member-lodges path; it is a configuration value now and can be built if the
solicitor requires it.

**Nominee holders.** The flow produces a pre-filled instruction addressed to their platform, which
they send through their own account. Then they tick "I have sent this" so the vote can be expected.
**Never ask for platform credentials**, and do not build anything that would accept them.

The instruction can be plain text they copy, rendered on the confirmation page. It does not need
to be a PDF; that is Package 7 and may not be needed at all.

**Both branches finish with a Join CSL prompt.** A Celtic shareholder appointing a proxy who is
not yet a member is the conversion you most want.

---

## 7. Admin register, and the export in particular

**Mirror the redesigned AGM Resolution page**, at `/member-portal/admin/resolution`, not the older
tracker it replaced. That page has been through several rounds of simplification with Gary and its
shape is settled: a meeting reference in the heading, one status banner, one headline figure with a
quiet qualifier line beneath it, the primary object in a card, and detail in collapsed disclosures
at the foot with their own exports.

Follow it closely, including the language rules. No internal vocabulary on screen: a volunteer must
never see `proxy_mode`, `interest`, `appointment` or `active`. The three states are described in
plain sentences, in the same way the resolution page describes its three closed states.

Table of appointments with an `is_admin` guard, in a collapsed disclosure. Counts split by direct
and nominee, as one quiet line rather than KPI cards.

**The CSV export is the most important deliverable in this package after the appointee rule, and
it should be built first rather than last.** CSL will run a pilot of roughly ten proxies in
production and send the export to the solicitor for review. That export is therefore the quality
control for the entire flow, and it is what CSL works from when lodging with Computershare.

It has to be readable by a solicitor, not just complete. One row per appointment, with
`appointee_name`, the declaration snapshot, `how_held`, SRN, share class and count,
`lodgement_path`, `nominee_instruction_sent`, consent, and full ISO timestamps. Include the row id
so a specific record can be discussed unambiguously.

Write a test asserting the exact column list, following the pattern the requisition export test
now uses.

---

## 8. Public copy

The public wording is a director decision and Brian has not settled it. **Use clearly marked TBD
placeholder text** wherever a real sentence is needed, and list every location in your report so
it can be replaced in one pass.

Do not invent persuasive copy. Do write Brian's name where the appointee is named, since that is
settled.

Flag in your report that TBD text cannot survive go-live if `proxy_mode` is `interest` on
production, since the page will be public.

---

## 8a. Honeypot: replace reject-and-log with store-and-flag

The resolution form was recently changed to reject a filled honeypot silently and log the email.
That is the wrong shape and it applies to the proxy form too, which still uses the original
`website` field.

The problem is that a hidden field is exactly what a browser autofill or password manager will
populate, so a real shareholder can be told they signed while no row is written, and they will
never report it because as far as they know it worked. Logging does not solve this either, because
`console.error` on Vercel has short log retention and a 2am trigger in September will be gone
before anyone looks.

Change both forms, resolution and proxy, to the same pattern: **write the row as normal with a
`suspected_bot` flag set, and exclude flagged rows from every count, tracker and export.** Keep
the silent success response to the client. Surface flagged rows in the admin view so they can be
reviewed and either released or purged.

A bot's row then sits there harmlessly. A real person's signature is never lost, and recovering it
is a click rather than a reconstruction from a log line.

The membership checkout uses the same `website` honeypot and has the same defect, where a silently
discarded submission is a lost signup. That is out of scope here, it is a go-live item rather than
an AGM one, but note it in your report so it is not forgotten.

---

## 9. Tests

Test what this package touches, per the brief, and note that the brief's rule means the behaviour
you changed rather than the files you edited. Changing `proxy_open` to `proxy_mode` touches every
existing test that references it.

1. A stored appointment carries `appointee_name` of Brian McLaughlin.
2. A request supplying its own appointee value is ignored, and the stored value is still correct.
3. Each of the three `proxy_mode` values produces the right page behaviour and the right API
   response. Prove the mode changes on a deployed Preview, per the standing rule on runtime
   controls.
4. A direct submission without an SRN is rejected. A nominee submission without a platform is
   rejected.
5. `signed_at` is server-generated and a client-supplied value is ignored.
6. Consent is stored as submitted on both the appointment and the interest flows. The interest
   flow currently discards it, which is audit Finding 5.
7. `meeting_ref` is written from config, not from the column default.
8. Existing proxy tests still pass after the `proxy_mode` change.

9. A submission with the honeypot filled is stored with `suspected_bot` set and does not appear in
   counts, tracker or export.
10. The proxy CSV export contains the exact column list from section 7.
11. A revoked appointment is excluded from the counts, marked in the export, and still present in
    the table.
12. Consent is stored on both branches, with a privacy policy version, and the direct and nominee
    data-sharing statements are different strings.

Tests 1 and 2 are the ones that matter. Keep the rest proportionate.

**Run all four AGM test files at the end**, not only the ones you touched: `site-gates.spec.ts`,
`agm-requisition-capture.spec.ts`, `agm-p3-resolution-content.spec.ts` and whatever you add here.
Three separate stale-test defects surfaced in one week because contract changes were never
re-verified against suites nobody had edited. The full run takes under two minutes.

Capture and restore whatever gate, mode and version state exists before your run. Staging should
end with `resolution_open` true, the draft version current, and `proxy_mode` set to `interest`.

---

## 10. Report back

Per the brief section 5. In addition:

1. Every location containing TBD placeholder copy.
2. Confirmation that no code path reads an appointee value from a request body.
3. The `proxy_mode` value on staging and production at the end of your session.
4. Anything in section 2 you thought was over-engineered and simplified, or wanted to and did not.
