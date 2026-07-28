# CSL Claude Code Prompt - AGM Package 3, Resolution Content and Version Management

**Date:** 28 July 2026
**Author:** Gary Phinn, Volunteer IT Lead
**Brief version this assumes:** 1.3
**Model:** Sonnet 5 is sufficient. The irreversible parts are already enforced in the database by
Package 2.

---

## 1. Session instruction

Read `CLAUDE.md`, then `docs/agm/CSL_AGM_Programme_ClaudeCode_Briefing.md`, then
`docs/2026-07-27_Proxy_Requisition_Audit.md`. Standing rules live in the brief and are not
repeated here. If the brief version above does not match the repository copy, stop.

Confirm scope in about 200 words, plus any blockers, before writing code.

Work on `develop`. Commit as `AGM P3: versioned resolution content and version management`.

**This package does not open anything.** The gate stays closed and the placeholder version stays
current at the end of your session. Package 3 builds the ability to release the second lock. A
human releases it later, deliberately.

---

## 2. What this package is

Package 2 built the container: an append-only `agm_resolution_versions` table, database-enforced
immutability, a foreign key from every signature, and a placeholder guard that prevents signing
while the current version is a placeholder.

Package 3 fills the container and gives you a way to manage it. When the solicitor's final wording
arrives, loading it must be a form on an admin page, not a code change and not a SQL script.

**Out of scope:** PDF and email-out, which is Package 7. Reconciliation, which is Package 8.
Anything proxy. Do not open the gate. Do not create a non-placeholder version and make it current.

---

## 3. The core design decision

**A signature binds to one version of the entire signable content, not to three versions of three
things.**

There are four pieces of text on the signing page that matter legally: the resolution, the
declaration the person makes, the consent wording, and possibly a supporting statement. If each
were versioned separately, a signature would carry three or four version references and it would
be possible to produce combinations that never actually appeared on screen together. That is
exactly the ambiguity we are trying to remove.

So one row in `agm_resolution_versions` represents one complete signable page, and
`agm_signatures.resolution_version_id` already points at it. No change to `agm_signatures` is
needed.

### Schema additions to `agm_resolution_versions`

| Column | Null | Notes |
|---|---|---|
| `declaration_text` | no | The declaration the signatory makes. See section 4 |
| `consent_text` | no | The wording next to the consent tick, including what happens to their data |
| `supporting_statement` | **yes** | The section 314 statement. See section 5 |

**Extend the immutability trigger to cover all three.** Package 2's trigger currently guards
`body`, `version_label`, `is_placeholder`, `id`, `created_at` and `created_by`. If the new columns
are not added to it they will be silently mutable, which defeats the entire design. Verify this by
attempting an update and confirming it raises.

`privacy_policy_version` on the signature stays as it is. The version record holds what was on
screen; `privacy_policy_version` records which policy document that wording referred to. Both are
wanted.

---

## 4. The declaration, and why it is being moved into data

The declaration currently lives in code at `ResolutionForm.tsx` and reads "I support Celtic
Supporters Limited requisitioning a resolution at the next Celtic plc Annual General Meeting".

**That is very likely the wrong legal frame and the solicitor is being asked to confirm it.** A
section 338 request comes from the members themselves. Each signatory is a requisitionist in their
own right, not a supporter of someone else's requisition. A signature in the wrong frame may be
void however perfectly it is bound to a version.

We do not have the solicitor's answer yet, so the point of this package is to make the answer a
data change rather than a rebuild. Seed a draft in the correct frame, clearly marked as unapproved:

> I am a member of Celtic plc. Under section 338 of the Companies Act 2006 I require the company
> to give notice of the resolution set out above to members entitled to receive notice of the next
> Annual General Meeting.

Draft consent wording, also unapproved, which needs to disclose the onward transfer:

> I consent to Celtic Supporters Limited holding the details I have given for the purpose of this
> requisition, and I understand that my name and address will be provided to Celtic plc as part of
> the request. See the privacy policy.

Both are drafts for the solicitor to correct. Do not present either as settled anywhere in the UI
or in comments.

---

## 5. The supporting statement

Whether the section 314 supporting statement appears on the signing page has not been decided.
Build the field and the rendering, and leave it null on the seeded versions.

If populated, render it below the resolution and above the declaration, visually distinct and
labelled as the supporting statement that will be circulated with the resolution. If null, that
section does not render at all and leaves no empty heading behind.

The reason to build it now rather than when the decision arrives is that a nullable column costs
nothing today and is a migration against real signatures later.

---

## 6. The public signing page

Render the current version's content in full, in this order: resolution, supporting statement if
present, declaration with its tick, consent with its tick.

The resolution must be shown in full on the page. Not truncated, not behind a "read more", not
linked to a PDF. The person is making a statutory request about that specific text and it has to
be in front of them when they do.

Record the version id against the signature at insert. Package 2 already provides the column and
the placeholder guard.

While the current version is a placeholder, behaviour is unchanged from Package 2: the closed
state renders and nothing is signable.

---

## 7. Admin version management

New admin surface, alongside the existing Resolution Progress page.

**List:** every version, newest first, showing label, created date and by whom, whether it is
current, whether it is a placeholder, and the number of signatures recorded against it. The
signature count is the important column, because it is what makes the immutability real to
whoever is looking.

**Create:** a form taking label, resolution body, declaration text, consent text, optional
supporting statement, and a placeholder flag. Creating never modifies an existing row.

**Make current:** an explicit action, separate from creation, with a confirmation that names the
version being activated and states plainly what it does. Making a non-placeholder version current
releases the second lock and, if the gate is also open, signing becomes possible immediately. The
confirmation must say so.

**No edit action anywhere.** The database will refuse it, but the UI must not offer it either.
Offering an action that always fails teaches people the system is broken.

Show the effective signing state notice built earlier on this page too, so someone activating a
version can see the resulting state without navigating away.

Guard with the same `is_admin` check as the other admin pages.

---

## 8. Tests

Per the brief. Localhost against staging is acceptable for most of this, since none of it is
caching or render-mode dependent. State which you ran where.

1. A version's `body`, `declaration_text`, `consent_text` and `supporting_statement` cannot be
   updated. Four separate assertions, not one.
2. A version with signatures against it cannot be deleted.
3. Creating a new version leaves existing versions unchanged, including which is current.
4. Making a different version current does not alter the `resolution_version_id` on any existing
   signature.
5. The public page renders the current version's four texts, and a signature records that
   version's id.
6. With `supporting_statement` null, no supporting statement section or heading renders.
7. With a placeholder current, nothing is signable, unchanged from Package 2.
8. The admin list shows the correct signature count per version.
9. No edit affordance exists in the admin UI.

Test 4 is the one that matters most. It is the difference between a version history and a
guarantee.

---

## 9. Report back

Per the brief section 5. In addition:

1. Confirm the immutability trigger covers all three new columns, and paste the error from an
   attempted update on each.
2. State the gate and version state at the end of your session. Expected: gate closed, placeholder
   current, no non-placeholder version current.
3. Say whether anything about the four-texts-in-one-version design caused you problems, since it
   is my design decision and I may have got it wrong.
