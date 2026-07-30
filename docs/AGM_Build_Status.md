# AGM Build Status

One entry per package, appended at the end of each. Factual record for building
director updates against, not a narrative. If something here turns out wrong,
correct the entry rather than layering a note on top of it.

---

## Package 1 - Launch gates and proxy holder copy correction

**Landed:** Two new `site_config` gates, `resolution_open` and `proxy_open`,
seeded closed, read through one uncached helper (`lib/agm-gates.ts`, later
generalised - see hotfix below) and enforced on both the public pages and
their API routes. Corrected the public `/proxy` copy: nine instances stating
or implying CSL the company would be the proxy holder, replaced via a single
`APPOINTEE_LABEL` constant so the director's name drops in later without
restructuring. Added both gates as toggles on the admin Operations page and as
cards in the operations export PDF.

**Verified:** Gate flip proven in both directions, page and API, on the
deployed `develop` Preview. 12/12 in `tests/site-gates.spec.ts`.

**Hotfix (same package, follow-on session):** `membership_open` was being
served from the Next.js Data Cache and from a statically-rendered
`/membership` page, so flipping it in the admin UI had no visible effect.
Generalised the gate helper (now `lib/site-gates.ts`) to cover all four site
gates - `membership_open`, `portal_open`, `resolution_open`, `proxy_open` - on
one client forcing `cache: "no-store"`. `portal_open` keeps a deliberate
fail-open default (a missing key or failed read must not sign out every
member); the other three fail closed. Also found and fixed in the same
session: the "Sign Resolution" nav link was hidden while its gate was closed,
inconsistent with "Proxy Assignment" which was always shown regardless of its
own gate - both are now always visible, since hiding a nav link was never
real access control.

**Operations report (unrelated maintenance, same window):** The operational
status PDF had spilled onto two pages. Capped backup history to the 3 most
recent rows with a one-line summary of the rest, bounded the service-status
card grid so it stays two rows tall as gates are added rather than growing a
row per gate, tightened section spacing. Verified at one page for today's
data, 20 backup rows, 6 gate cards, and all three combined.

**Deferred:** none specific to this package. See the shared list at the end.

---

## Package 2 - Requisition capture schema

**Landed:** Rebuilt `agm_signatures` to the director brief: four discrete
address fields, `share_class`, `how_held`, SRN mandatory for direct holders,
three discrete ticks stored as submitted (not hardcoded), server-generated
`signed_at`, `capture_status` distinguishing `complete` from `pre_rebuild`.
Added `agm_resolution_versions` (append-only, database-enforced immutability
trigger, placeholder guard blocking all signing while the current version is a
placeholder) and `agm_supporters` (non-shareholders rejected from
`agm_signatures` by a CHECK constraint, routed to their own table). Config-
driven option lists - nominee platforms, year of purchase, share bands - read
through the uncached helper, validated server-side.

**Verified:** Production migration rehearsed end to end on staging against
synthetic old-shaped rows before running for real. The rehearsal caught a real
defect: a bare `ALTER TABLE ... RENAME` does not move indexes or constraints,
so the schema step would have collided and aborted partway on production.
Production preserve then ran cleanly: both real rows preserved with
`capture_status = 'pre_rebuild'`, correctly excluded from the qualifying count
toward 100. The one real preserved shareholder record has no SRN, so it could
not have qualified toward the 100 even before the wording problem - direct
evidence for audit Finding 6.

**Design changes from spec:** Completeness enforced as a database CHECK
constraint, not only API validation, per review. RLS on
`agm_resolution_versions` is service-role only with no anon policy at all,
since only the application ever reads it.

**Deferred:** PDF and email output (Package 7). Reconciliation against the
share register (Package 8). Resolution text rendering, moved into Package 3.

---

## Package 3 - Versioned resolution content and version management

**Landed:** `agm_resolution_versions` gained `declaration_text`,
`consent_text` (NOT NULL) and `supporting_statement` (nullable), added by
deleting and re-seeding the catalogue rather than backfilling, since nothing
had signed against anything yet. Immutability trigger extended to the new
columns. Public `/resolution` page renders the current version's four texts
in full. Consent text is two separate blocks in the source for the
shareholder and supporter paths, never shared, since only the shareholder
version may disclose that details are provided to Celtic plc. Added
`meeting_ref` to all three AGM tables and `site_config.current_meeting_ref`,
read live at insert time so a future AGM is a config change rather than a
migration. New admin surface at `/member-portal/admin/resolution/versions`:
list with signature count per version, create, make-current with a
confirmation that shows the version's full content before the action, no
edit affordance anywhere.

**Verified:** 9/9 in `tests/agm-p3-resolution-content.spec.ts`, including that
activating a different version does not alter `resolution_version_id` on an
existing signature - the test that distinguishes a version history from a
guarantee. Run locally against staging, not the deployed Preview: the sign
endpoint's rate limit is shared across all requests from one IP on a deployed
environment, which makes full-suite Preview runs impractical (documented
constraint, not a defect).

**Found and fixed within the package, not deferred:** the first schema
migration script omitted `version_label` from an INSERT column list and
aborted cleanly inside its own transaction on the first run; fixed and
re-run. Three test-locator bugs surfaced while running the suite against
staging - a case-sensitive match against CSS-uppercased text, a missing
post-login redirect wait causing false 401s, and a whole-page text check that
matched the portal's own unrelated "Edit Profile" nav link - all fixed. A
fourth, a whole-row `toContainText("1")` check that passed only because the
row's own timestamp-based label happened to contain the digit `1`, was found
in the post-wrap-up review and fixed to check the specific Signatures cell.

**Follow-on within the same package:** version content display restyled to
match the accordion pattern on the My Membership portal tab (chevron, left
accent bar), and an AGM column added showing `meeting_ref`. A four-colour
section scheme was tried and then dropped after review found amber already
meant "gate closed" elsewhere on the same screen; sections are now
distinguished by icon and label only, one neutral card treatment throughout.

**Deferred:** see the shared list below.

---

## Gap-fill session - stale tests, server-side honeypot, meeting-scoped uniqueness

**Landed:** Refreshed `tests/site-gates.spec.ts`'s `validBody()` to the sign
route's current field shape (it still sent Package 1 fields two packages
after the route moved on - the concrete case that prompted the standing rule
below). Strengthened "validation still applies when open" to blank
`signatureName`, the last field checked, rather than `fullName`, the first -
blanking the first field only proves the first check fires. Rewrote the
pre-rebuild count test to read the actual rendered admin page rather than
re-deriving the filter and asserting on its own arithmetic. Added the
supporter-consent-rejection test's missing assertion that no row was written.
Wrote the CSV export test Package 2 spec item 11 asked for and nobody had
written. Implemented the server-side honeypot on both `/api/resolution/sign`
and `/api/resolution/supporter` (previously checked client-side only, so a
direct POST bypassed it entirely) and made a missing `TURNSTILE_SECRET_KEY`
log loudly instead of silently skipping verification. Wrote
`sql/agm-gap-fill-meeting-scoped-email.sql`, making signature/supporter email
uniqueness composite with `meeting_ref` instead of a bare `UNIQUE(email)` -
without it, nobody could ever sign again for a second AGM under the same
email, which defeats the meeting-scoping added in Package 3.

**Found and fixed within the session, not asked for:** the same test file's
own `beforeAll` inserted resolution versions without `declaration_text`/
`consent_text`, NOT NULL since Package 3 - the identical staleness class the
session was about, discovered while verifying the named fixes rather than
being one of them. Also fixed: stale `#postalAddress`/`#typedSignature`
locators, and "Who should sign" copy that had become "Who can sign".

**Verified:** 39/39 across all three AGM test files that existed at the time.
The CSV test needed two non-obvious fixes: this sandbox's Chromium never
fires a `download` event for Blob-URL downloads at all (confirmed with a
minimal page with no app code involved), so the test captures the Blob via
a `URL.createObjectURL` interception instead; and a click straight after
`domcontentloaded` can land before React has hydrated the handler.

**Deferred:** the composite-uniqueness SQL was written but not run this
session. Confirmed run against both staging and production during the
pre-Package-5 catch-up (see below) - both now enforce
`UNIQUE(email, meeting_ref)`.

---

## Package 3 amendment - duplicate/edit/delete workflow, autofill-safe honeypot

**Landed:** "Duplicate and edit" on the (then-separate) versions page,
pre-filling the create form from an existing version so a wording amendment
no longer means retyping four text blocks. Delete, enabled only for versions
with zero signatures that are not current - the database's `ON DELETE
RESTRICT` already made the zero-signatures half safe, this just exposed it;
confirmation names the version. `version_label` made editable
(`sql/agm-p3-amend-editable-label.sql`, dropping it from the immutability
trigger) with an inline edit control - metadata nobody signs, unlike `body`/
`declaration_text`/`consent_text`/`supporting_statement`/`is_placeholder`,
which stayed immutable and unconditional. Honeypot field renamed from
`website` (exactly what autofill and password managers target unprompted) to
`hp_field`, with every rejection logged with email and timestamp instead of
discarded silently.

**Verified:** 39/39 across all three AGM files. The "no edit action exists"
test's own premise had just become false by design (a "Duplicate and edit"
button now existed) - rewritten to assert the four immutable content fields
still have no in-place edit affordance, while the label control does.

**Found and fixed within the session:** the relabel SQL script initially
tried disabling and re-enabling the immutability trigger inline rather than
depending on `agm-p3-amend-editable-label.sql` having been run first - wrong
scope, since nothing else needed the trigger toggled. Corrected to a plain
`UPDATE` that depends on the amendment script, with no working
disable-the-trigger example left in the repository.

**Deferred:** the label-editable SQL amendment was written and, per a later
verification, was already applied to staging in this window but not
confirmed on production until the pre-Package-5 catch-up.

---

## Admin redesign - one page, resolution instrument as the primary object

**Landed:** Retired `/member-portal/admin/resolution/versions` and the
version/make-current/duplicate/placeholder/activate vocabulary from the
interface entirely, merging into one route. First pass: signing state,
direct-registered count, supporters line, current wording behind a single
"Change wording" save flow, six-column signature table with a specific
per-row Status, a collapsed wording history. Fixed a real horizontal-overflow
defect in the same window - `PortalShell.tsx`'s grid item had no `min-width:
0`, so the table's `whitespace-nowrap` columns forced the content column
wider than its track and made `overflow-x-auto` dead; the amber "excluded
from the count toward 10" (should read "100") banner was the visible symptom.
De-duplicated the admin sidebar entry (`AGM Resolution` appeared twice, once
per page, in `PortalClient.tsx` and `PortalShell.tsx`) and fixed a consent-copy
contradiction between the shareholder and supporter paths on `/resolution`.

**Second pass, after a rejected mockup:** a first mockup (own interpretation)
was rejected; a second, built directly from
`docs/agm/CSL_AGM_AdminRedesign_ClaudeCode_Prompt.md`'s approved ASCII layout,
was approved and built. Deleted the Wording History disclosure entirely (not
merely collapsed - the doc's own prose and its delete-list briefly
contradicted each other on this point; the delete list won). Heading now
states the meeting (`AGM Resolution` / `{meetingRef}`), plain text for one
meeting, a selector reserved for when a second exists but never bound to
`current_meeting_ref` - switching the live meeting stays a deliberate
no-interface config action. Banner rewritten to name the meeting, not the
auto-generated document label, collapsed from four closed-state messages to
exactly three (gate not open / no wording saved / wording not finalised -
"gate closed and also not finalised" was never a fourth action a volunteer
takes). Count became three lines: headline, what it measures, one quiet
qualifier line joining the completion count and the supporter note with
correct singular/plural agreement in both halves, no separate banner box.
"THE REQUISITION" card: Final/Not final badge, single "Show full text" toggle
for all four texts together. "Who has signed" became a collapsed disclosure
with Export CSV beside the toggle. CSV filename gained the meeting reference
(`csl-resolution-signatures-{meetingRef}-{date}.csv`). Corrected the draft
wording's `declaration_text` to cite Companies Act 2006 sections 314 and 338
together (was 338 alone), per Appendix 1 of
`docs/agm/reference/ShareAction_UK_Guide_Shareholder_Resolutions_2019.md`
(fetched, converted with `pdftotext -layout`, and committed as the primary
reference per brief section 2b) - done as a new version via the app's own
create-and-activate flow, never by mutating the existing row.

**Verified:** 40/40 across all three files. Found and fixed while verifying:
a version-label immutability test had gone stale in place - the amendment
script above had already been run against staging, so the test's own
assertion no longer matched reality; corrected to assert body immutable,
label mutable. A completion-count assertion assumed a clean baseline of zero
pre-rebuild rows, which staging does not have (a genuine preserved rehearsal
row, not test debris) - rewritten as a before/after delta.

**Deferred:** none new; see the shared list.

---

## Registered Support - supporters gain a name and email, not just a count

**Landed:** Non-shareholders who register support were stored in
`agm_supporters` with no way to see who they were anywhere in the app, only
a count - a gap dating from Package 2, when they were moved out of
`agm_signatures`. Mockup shown and approved (one correction: "Supporters" ->
"Registered Support"). Added a second collapsed disclosure beneath "Who has
signed", identical pattern, showing date/name/email with its own CSV export
(`id`, `created_at`, `full_name`, `email`, `consent_given`,
`privacy_policy_version`) - deliberately never merged into the signature
export, which is the actual lodgement document and must contain only people
who have signed.

**Verified:** 41/41 across all three files. Adding a second "Export CSV"
button made an existing test's bare role-name locator ambiguous (matched
two buttons) - fixed by scoping to the specific button via its sibling
relationship to the "Who has signed" toggle, the same class of test fix the
brief's standing rule anticipates for any UI change that touches shared text.

**Deferred:** none new; see the shared list.

---

## Pre-Package-5 catch-up - production schema behind staging

**Landed:** No feature work. Gary attempted to run
`sql/agm-gap-fill-meeting-scoped-email.sql` against production and it failed
with `column "meeting_ref" does not exist` - production had never had
`sql/agm-p3-resolution-content.sql` run against it, despite staging having
had it for two packages. Diagnostic queries established production was
otherwise fully and correctly through Package 2 (rename, schema, preserve
all confirmed correct, including the two real preserved shareholder rows),
just missing everything from Package 3 onward. Ran, in order:
`agm-p3-resolution-content.sql`, `agm-p3-amend-editable-label.sql`,
`agm-relabel-seed-placeholder.sql`, `agm-gap-fill-meeting-scoped-email.sql`
(skipping `agm-p3-staging-cleanup.sql`, whose own header says never to run it
on production).

**Verified:** a single consolidated read-only query confirmed every expected
outcome: the four new columns present, the current wording row shaped
correctly (`created_by = "AGM P3 migration"`, confirming the old Package-2
placeholder was deleted and replaced rather than mutated), the composite
unique constraints in place on both tables, zero null `meeting_ref` values
on the two preserved rows, `current_meeting_ref` present in `site_config`,
and the immutability trigger's function body confirmed to exclude
`version_label` specifically.

**Deferred:** production's current wording is still the placeholder - the
real Georgeson shareholder-tracing resolution content live on staging has
not been authored on production yet. A content step via "Change wording"
when ready, not a migration.

---

## Deferred items, tracked across packages

- **Admin preview route.** Rendering a version as the public page would
  actually display it, rather than the plain labelled-text cards built in
  Package 3. Explicitly out of scope for that work ("no diff, no preview
  render, no version comparison").
- **`require_srn_for_direct`.** Currently enforced server-side (SRN mandatory
  for direct holders, per audit Finding 6). Superseded by a broader form-
  friction decision awaiting director input on how much detail to demand at
  sign-time versus at reconciliation - the narrow question of whether to keep
  this one field mandatory is folded into that.
- **Rate limiter and test suite collision on Preview.** Vercel binds
  `x-forwarded-for` to the real caller IP, so every request from one machine
  against a deployed Preview shares one rate-limit bucket. Full-suite Preview
  runs of anything hitting `/api/resolution/sign` are impractical as a result.
  Backlog item: a test-only bypass validated against a secret, or a raised
  limit scoped to Preview. Not solved inside any package so far.
- **`backup_log` missing GRANT.** Same missing-`service_role`-GRANT class as
  `agm_p2_preserve_log`, which was fixed. `backup_log` itself was never
  granted, so the operations report currently shows "no backups" when it
  actually cannot read the table.
- **`membership_open` / `portal_open` verification.** Fixed for the Data
  Cache and static-rendering bug during the Package 1 hotfix, and flip-tested
  on the deployed Preview at that time (`tests/site-gates.spec.ts` covers
  both). Flagged for renewed verification before go-live; not re-confirmed
  since the hotfix session.
- **Two Appendix 1 fields not captured for direct holders.** The amount paid
  up on the shares, and an explicit "I do not hold these shares on behalf of
  someone else" confirmation distinct from the existing eligibility tick.
  Both are in ShareAction's registered-shareholder requisition form; logged
  as open items awaiting the solicitor during the admin redesign session, not
  added speculatively.
- **Section 153(2) statement not captured for nominee/platform holders.**
  Appendix 2's form for indirect investors asks for the registered
  shareholder's name/address/account number and a statement they hold the
  shares on the signatory's behalf; CSL's nominee path currently captures
  none of it. Same status as above - solicitor question, not built.
