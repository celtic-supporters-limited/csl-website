# CSL Claude Code Prompt - AGM Package 1, Launch Controls and Copy Correction

**Date:** 27 July 2026
**Author:** Gary Phinn, Volunteer IT Lead
**Source:** `docs/2026-07-27_Proxy_Requisition_Audit.md`, Package 1, plus Findings 1, 3 and 5
**Type:** Build. Scoped tightly. Do not extend beyond this prompt.

---

## 1. Session instruction

Read `CLAUDE.md`, then read `docs/2026-07-27_Proxy_Requisition_Audit.md` in full. You wrote that
audit, so it is your own evidence base. This session acts on Package 1 only.

Run `git status` and `git branch --show-current`. If you are on `main`, check out `develop`.
Create a branch `feature/agm-package-1-gates` off `develop`.

Confirm the scope back to me before writing code. Package 1 is three things and nothing else:

1. Feature gates on both AGM flows, closed by default, controllable from the admin UI.
2. Correction of the public copy that names CSL as proxy holder.
3. Tests that prove both.

Explicitly out of scope this session, even though the audit calls for them and they are next:
schema changes, address splitting, SRN mandation, resolution text rendering, share class, PDF
generation, email-out, the `agm_proxies` table, reconciliation tooling. If you find yourself
editing `sql/add-agm-signatures.sql` or `ResolutionForm.tsx` field definitions, stop, you have
left the scope.

---

## 2. Why this comes first

Read this carefully, because it corrects an assumption in the audit.

**The csl-website platform is not live.** It is the replacement for the existing WordPress site
and has not been launched. The audit describes `/resolution` as "live to the public" and cites 57
proxy registrations. Those records are staging test data. Production holds 2 rows in
`shareholder_cases` and the `agm_signatures` rows are test data too. Nothing here has reached a
real shareholder, no real person has signed anything, and all of this data can be wiped and
recreated.

So this is not an incident. It is the first package because of what it enables, not because
anything is bleeding.

Two reasons it goes first:

1. **Controlled launch.** Both AGM flows must be closed by default and opened deliberately, on a
   specific day, by a specific person. The requisition opens when the solicitor confirms the
   wording. The proxy opens when Celtic issues the Notice of AGM, because a proxy is specific to
   one meeting. Without the gate, the only mechanism for controlling either is a deploy, which is
   not something we want to depend on under time pressure. Building the gate now also means every
   later package can be built and tested with the flows safely closed.

2. **The copy is wrong on a point of law.** `/proxy` states in three places that CSL, the
   company, will be named as proxy holder. That is the form the registrar rejects, and the Celtic
   Trust had proxies fail on this basis in 2025. It is not urgent while unlaunched, but it is
   wrong, it will be inherited by every later revision of that page, and it is cheap to fix now.

Because the data is disposable, do not build any migration or backfill logic in this or any later
AGM package. Where a schema is wrong, we will drop and recreate rather than migrate. Say so if
you find yourself writing a migration path for existing rows.

---

## 3. Requirement: feature gates

Follow the pattern already proven in this codebase rather than inventing one. The audit
identifies it at `components/MembershipGateToggle.tsx`, `components/PortalGateToggle.tsx` and
`POST /api/admin/site-config`, backed by `site_config` keys `membership_open` and `portal_open`.
Read those first and mirror them, because consistency here matters more than elegance: whoever
operates these toggles on AGM week should find them behaving identically to the ones they
already know.

Add two `site_config` keys:

| Key | Default | Meaning |
|---|---|---|
| `resolution_open` | `false` | Requisition signing is live to the public |
| `proxy_open` | `false` | Proxy capture is live to the public |

Both default closed. Seed them closed in the migration, not open, so that a deploy cannot
accidentally publish either flow.

### 3.1 Gate the API, not just the page

This is the part that is easy to get wrong. Hiding a page while leaving its API route open means
anyone who has previously loaded the form, or who replays a request, can still submit. Both
`POST /api/resolution/sign` and `POST /api/proxy` must read the relevant `site_config` value
server-side and return a 403 with a clear JSON error when closed, before any validation, rate
limiting or database work.

**Build this as one shared helper, not four implementations.** Something like
`lib/agm-gates.ts` exporting a single function that takes the gate key and returns its state,
used by both API routes and both pages. The realistic failure mode here is not an attacker, it
is the page and the API disagreeing about whether a flow is open, which produces a form that
submits and then fails, or a hidden form whose endpoint still accepts writes. A single source of
truth removes that whole class of bug. Note that `app/resolution/page.tsx` already reads
`site_config` server-side for the signature counter, so the helper should reuse that same client
and pattern rather than introducing a new one.

**Fail closed.** If the `site_config` read itself errors, treat the gate as closed and log the
error clearly. The asymmetry matters: a wrongly rejected signature can be re-collected with an
apology, whereas a signature collected against wording the solicitor has not approved cannot be
un-collected. Do not silently default to open on error.

Page-level behaviour when closed: render the explanatory content, do not render the form, and
show a short holding message in place of it. Do not return a 404. A shareholder who follows a
link from an email should understand that the page is real and will reopen, not think it is
broken.

Suggested holding copy, adjust if you have better:

- Resolution closed: "Signing is not open yet. The resolution wording is with our solicitor and
  this page will open for signature once it is confirmed. If you are a Celtic plc shareholder and
  want to be told the moment it opens, join CSL or contact us at
  `info@celticsupporterslimited.net`."
- Proxy closed: "Proxy appointment opens once Celtic plc issues the formal Notice of the Annual
  General Meeting. A proxy can only be appointed for a specific meeting, so this page will open
  at that point. Register your interest and we will contact you when it does."

Keep the join CSL route visible on both closed states. A shareholder arriving at a closed page is
still a conversion opportunity, and that is the one thing about these pages that currently works.

### 3.2 Navigation

While `resolution_open` is false, the "Sign Resolution" entry at `components/Nav.tsx:13` should
not appear in the public navigation. The audit notes admin nav entries are duplicated across
`components/PortalShell.tsx` and `app/member-portal/PortalClient.tsx`. Leave the admin entries
alone, the tracker stays available to admins regardless of gate state. Note the duplication in
your session summary but do not refactor it here.

### 3.3 Admin toggles

Two toggles in the admin area, alongside the existing membership and portal toggles so they read
as one set of controls. Each toggle should make its consequence unambiguous at the point of use,
because these will be flipped under time pressure on a specific day. Something like a current
state label plus a one line consequence: "Open: any visitor can sign the requisition" or
"Closed: the form is hidden and submissions are rejected."

Guard with the same `is_admin` check used by `app/member-portal/admin/resolution/page.tsx`.

---

## 4. Requirement: correct the proxy holder copy

Three locations, identified in Finding 3:

- `app/proxy/page.tsx:121` - "CSL sends you the official Proxy Form naming Celtic Supporters
  Limited as your proxy holder."
- `app/proxy/page.tsx:62-66` - "By assigning your proxy to CSL, you direct your shares' votes to
  us."
- `app/proxy/ProxyForm.tsx:117-120` - success state, "We'll send you the official proxy form
  ahead of the next Celtic PLC AGM."

Note that the audit's severity rating on this assumed a live site. It is not live, so treat this
as a correctness fix rather than an incident. Rewrite so the page states accurately that the
proxy is appointed to a named individual acting on behalf of CSL members, not to CSL as a
company. Do not put the director's name into the public page in this session. His name becomes a locked field in Package 5, and the wording of the public
explanation is a director decision, not a build decision. Write it so the named person can be
dropped in without restructuring the sentence, and flag in your summary exactly where the name
will go.

Search the whole repository for other statements of the same idea, including metadata,
descriptions, email templates in `lib/resend.ts` and any Zoho field defaults. The audit found
three, there may be more. Report anything you find beyond those three rather than assuming the
list is complete.

Do not change `/resolution` copy in this session beyond the closed state message.

---

## 5. Requirement: tests

**Test what this change touches. Do not run the full regression suite.** This is a small,
well-bounded change and a full suite run costs time we do not have and produces noise from
unrelated areas. Run the tests below plus any existing test that exercises `/resolution`,
`/proxy`, `POST /api/resolution/sign` or `POST /api/proxy`, and nothing else.

**Run against staging, not production.** Point `PLAYWRIGHT_BASE_URL` at the Preview deployment
for this branch. Do not run these against the production Vercel URL: several of them submit to
the live endpoints and would write rows into production data.

Extend `tests/proxy-workflow.spec.ts` and create the first `/resolution` test file:

1. With `resolution_open` false, the public page renders without a form and the nav entry is
   absent.
2. With `resolution_open` false, a direct `POST /api/resolution/sign` with an otherwise valid
   body returns 403 and creates no row.
3. With `resolution_open` true, an existing valid submission still succeeds. **This is the most
   important test in the set.** The realistic risk of adding a gate is not that it fails to
   block, it is that it wrongly blocks a legitimate signature during the campaign. Assert the
   open path explicitly rather than assuming it.
4. The same three for `proxy_open` against `/proxy` and `POST /api/proxy`.
5. No public page contains the phrase "as your proxy holder", or names Celtic Supporters Limited
   as the appointee. Assert against rendered output, not source, so the test survives
   refactoring.

Report the actual output of what you ran. If a test in scope was already failing before your
changes, say so plainly rather than fixing it silently, and do not expand scope to repair it.

---

## 6. What to hand back

1. A short summary: what changed, files touched, test results as actually run.
2. Confirmation that both gates default closed, and the exact steps to open each one.
3. Anything you found that contradicts the audit, including anything the audit got wrong. The
   audit was written from the same codebase, but by a different session, and it may be stale.
4. Any further instance of the CSL-as-proxy-holder claim beyond the three listed.
5. Where the named appointee will slot into the corrected copy.

Commit to `feature/agm-package-1-gates` with a clear message. Do not merge to `develop`. Do not
begin Package 2.

---

## 7. Standing rules for all AGM packages

**Testing.** Test what the change touches. Do not run full regression suites. Run against the
staging Preview deployment, never production.

**Email.** CSL uses the same Resend API key across Preview and Production. This is a deliberate,
accepted position for a small volunteer-led organisation and is not a finding. Do not propose
separating them, and do not treat staging email as untestable. Note that go-live plan item P0.10
states the Preview key is empty; that document is out of date on this point.

**Data.** All AGM data is disposable. Never write migration or backfill logic for `agm_signatures`,
`agm_proxies` or AGM-related rows in `shareholder_cases`. Where a schema is wrong, drop and
recreate.

No em dashes, use hyphens. No personal names on public pages, except that the proxy appointee is
a legally required named natural person and will be added deliberately in a later package. Never
commit `.env` or keys. Supabase EU region only. Every claim about what you changed cites a file
path.
