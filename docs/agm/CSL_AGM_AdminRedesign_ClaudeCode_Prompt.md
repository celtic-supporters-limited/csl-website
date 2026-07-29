# CSL Claude Code Prompt - AGM Admin, One Page

**Date:** 29 July 2026
**Author:** Gary Phinn, Volunteer IT Lead
**Brief version this assumes:** 1.3
**Model:** Sonnet 5. The design decisions are made and specified below.
**Supersedes:** any earlier draft about simplifying the resolution wording screen. This is the
consolidated version.

---

## 1. Session instruction

Read `CLAUDE.md` and `docs/agm/CSL_AGM_Programme_ClaudeCode_Briefing.md`. Confirm scope in about
200 words plus blockers.

Work on `develop`. Commit as `AGM: merge admin resolution pages into one`.

This assumes the two small fixes have already landed: the consent contradiction on the signing
page, and the test fixtures no longer creating live-flagged versions. If they have not, say so and
stop.

---

## 2. Why

Two admin pages exist for one AGM with one resolution and one target. The split happened because
version management arrived in a later package than the tracker, not because the work divides in
two. A volunteer checking progress needs to see what people are signing, and a volunteer changing
the wording needs to see who has already signed the old one.

CSL is run by two volunteers and four directors, none of them technical. The person who
commissioned these pages has said he is confused by them. Simplicity is the requirement.

**Bias to deletion throughout.** If you find yourself adding something, stop and ask.

---

## 3. The page

One route, `/member-portal/admin/resolution`, titled **AGM Resolution**. `/versions` goes away.

```
[ Signing: OPEN. Shareholders are signing "Draft for review". ]

1 of 100 direct registered shareholders                    [ Export CSV ]
Plus 2 supporters recorded, who are not shareholders and cannot sign

WHAT SHAREHOLDERS ARE SIGNING NOW                        [ Change wording ]
  Resolution / Supporting statement / Declaration / Consent
  collapsed by default, one click to read in full

WHO HAS SIGNED
  Date | Name | Email | Held | SRN | Status

  > Wording history (2)        collapsed, at the foot
```

**Wording precision matters here.** Supporters are non-shareholders who cannot be requisitionists,
which is why Package 2 routes them to a separate table and excludes them from the count. The
banner and the wording heading must say shareholders, not people, and the supporters line must
state plainly that they cannot sign. Do not merge the two populations in any label on this page.

The supporters figure is a quiet secondary line beneath the count, not a KPI card. It exists so
nobody wonders whether supporters are still being collected.

**The Status column says what is actually wrong with a row**, for example "Needs SRN", rather than
a generic "needs completion". The point of that column is to tell a volunteer what to chase.

**Change wording** opens the four texts pre-filled and editable, with one Save. Saving asks one
question:

> This becomes what people sign from now on. Anyone who already signed keeps the old wording.

That sentence is the entire versioning model. **The word "version" must not appear anywhere in
the interface.** Nor "make current", "duplicate", "placeholder", or "activate".

Underneath, saving still creates a new row and makes it current exactly as today, with an
auto-generated label. Keep the table, the foreign key and the immutability trigger. History
becomes a collapsed disclosure at the foot of the page that nobody needs to open.

Replace the placeholder concept in the UI with a checkbox on the wording form: **"This wording is
final and signing may open."** Same underlying flag, expressed in words a volunteer understands.

---

## 4. Delete

From `ResolutionAdminClient.tsx`:

- Five of the six KPI cards. Keep direct registered only. Nominee, complete, members, non-members
  and supporters change nobody's next action and are all in the export.
- The whole progress bar block. It restates the number directly above it.
- The "1% of target" text.
- The explanatory paragraph inside the amber banner. It is release history, not status. Keep the
  count and the needs-completion badge on the row.
- Table columns Member, Class and Postcode. None is used to decide who to chase, and all are in
  the export.

From `ResolutionVersionsClient.tsx`, as a route and as a vocabulary:

- The route itself.
- The inline label edit and `/api/admin/resolution-versions/relabel`.
- The delete action and its route. Wording is evidence and should accumulate quietly, not be
  curated.
- The AGM, By, Created and per-row Signatures columns.
- The ninety-word explanatory paragraph in the version form. If immutability needs that much
  prose, the interface is wrong. The one sentence in section 3 replaces it.
- The per-row content expander, which doubles the table length.
- One of the two sidebar entries, in both `PortalShell.tsx` and `PortalClient.tsx`, which
  duplicate the nav.

---

## 5. Keep

- The signing state notice. It answers the first question anyone asks and already does its job.
- Direct registered count against 100.
- Export CSV, unchanged. This is what lodgement day runs on.
- The signature table at six columns: Date, Name, Email, Held, SRN, Status. Held and SRN are what
  make a row chaseable.
- The needs-completion badge on the row, without the paragraph.
- The four texts of the current wording, read-only, collapsed. Already well built, reuse the
  existing content component.

---

## 6. The layout defect

The Progress page overflows horizontally and clips its own content, measured at 154px past the
viewport at 1508px client width, so roughly 300px on a 1366 laptop. Consequence today: the amber
banner reads "excluded from the count toward 10" because the zero is off screen.

Cause, already proven by experiment rather than inferred: the grid item in `PortalShell.tsx`
using `grid-cols-1 lg:grid-cols-[220px,1fr]` has the CSS default `min-width: auto`, so the table's
min-content width, driven by `whitespace-nowrap` on every column, forces the `1fr` track wider
than its container. `overflow-x-auto` on the table is currently dead, because the scroller is
being stretched to fit its contents.

Set `min-width: 0` on that grid item. Verify at 1366 and 1440 widths that the page does not
overflow and the scroller works. Check the other admin pages are unaffected.

---

## 7. Data cleanup

The page will not make sense with twenty-one debris versions in its history disclosure. Purge
staging to the draft and the placeholder as part of this work. Write the SQL, Gary runs it.

---

## 8. Tests

Update the existing version-management tests to the new interface rather than deleting them. What
still has to hold: no editable field for the four texts appears outside the wording form; saving
new wording does not change the `resolution_version_id` on an existing signature; the signing
state notice reflects gate and finality correctly.

Run all AGM test files at the end, not only the ones you touch.

Capture and restore whatever gate and wording state exists before your run. Staging should end
with the gate open and the draft wording current.

---

## 9. Report back

Per the brief section 5. In addition: confirm the words version, make current, duplicate,
placeholder and activate appear nowhere in the rendered interface, and paste the measured page
width at 1366 before and after the layout fix.
