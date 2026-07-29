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
