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

**This layout has been reviewed and approved by Gary. Build it as described.** An earlier version
was rejected for putting the signature table ahead of the document and for treating the resolution
as "wording" rather than as the instrument.

```
AGM Resolution                                            2026 AGM

[ Signing is open. Shareholders can sign the requisition below. ]

47 of 100 needed to lodge
direct registered shareholders
1 record needs completion · 6 supporters recorded, who cannot sign

+-- THE REQUISITION -------------------- [Final] -- Change wording --+
|  What every signatory agrees to, in the order they see it.         |
|                                                                    |
|  > Show full text            one toggle, reveals all four in order |
|      Resolution                                                    |
|      Supporting statement                                          |
|      Declaration                                                   |
|      Consent                                                       |
+--------------------------------------------------------------------+

> Who has signed (47)                                   [ Export CSV ]
```

**The requisition is the object of this page, not a panel bolted onto a tracker.** It sits in a
card with a state badge, a one-line description, and a **single** toggle revealing all four texts
in the order a signatory reads them. Do not give each text its own collapsible: the document is
reviewed as one thing, by Gary and eventually by a solicitor, and four separate toggles made it
read as four unrelated fields.

State badge shows Final or Not final, reflecting the same underlying flag the "This wording is
final" checkbox sets.

**The count states its purpose:** "47 of 100 needed to lodge", not a bare figure. The two
qualifiers, records needing completion and supporters, sit beneath as one quiet line. No progress
bar: the number already says it.

**Who has signed is a single collapsed row at the foot**, with the export beside it, because the
export is that list leaving the building. Expanding it reveals the six-column table.

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

## 3a. Established practice, and where to check it

**Do not invent the language of a statutory instrument.** UK shareholder requisitions have an
established form, and this project has already produced wording that diverged from it because
nobody checked a source. Before writing or amending any signatory-facing text, read:

| Source | What it gives you |
|---|---|
| **ShareAction, UK Guide to Shareholder Resolutions (2019)** - `https://shareaction-api.files.svdcdn.com/production/resources/reports/ShareholderResolutionGuide-UK_2019.pdf` | The standard reference for UK co-filing campaigns. **Appendix 1** is the requisition form for registered shareholders, Appendix 2 for indirect investors, Appendix 3 for a mixed group. This is the closest thing to a canonical form |
| **Investment Association, Guidance on Filing Requisitioned Resolutions (2023)** - `https://www.theia.org/sites/default/files/2023-06/IA%20Guidance%20on%20Filing%20Requisitioned%20Resolutions.pdf` | How institutional shareholders expect requisitions to arrive |
| **Companies Act 2006, sections 314, 338, 340, 153, 1146** | The primary source. 338 is the AGM resolution right, 314 the supporting statement, 340 the circulation costs, 153 indirect holders, 1146 authentication |

Appendix 1's form asks for name, address, share count, account number, **the amount paid up on the
shares**, and five confirmations, and its declaration cites **sections 314 and 338 together**,
stating that the signatory has signed the supporting statement "for the purposes of
identification".

**Required change to the declaration in this session.** Ours cites section 338 only and does not
mention the supporting statement. Bring it into line:

> In accordance with sections 314 and 338 of the Companies Act 2006 I require Celtic plc to give
> notice of the resolution above, and the text of the supporting statement, to members entitled to
> receive notice of the 2026 Annual General Meeting.

Treat this as a draft for the solicitor, not settled wording, and keep it in the database as data
rather than in code.

**Two things Appendix 1 asks for that we do not capture, deliberately not in scope here:** the
amount paid up on the shares, and a confirmation that the signatory does not hold the shares on
behalf of someone else. Both are logged as open items awaiting the solicitor. Do not add them
speculatively, and do not remove anything on the assumption they are unnecessary.

**The general rule.** When a change touches the language or structure of the instrument itself,
cite the source you worked from. If no source covers it, say so and flag it rather than drafting
something plausible.

---

## 4. Delete

From `ResolutionAdminClient.tsx`:

- Five of the six KPI cards. Keep direct registered only. Nominee, complete, members, non-members
  and supporters change nobody's next action and are all in the export.
- The whole progress bar block. The number states it.
- The amber banner as a banner. The records-needing-completion count becomes part of the quiet
  qualifier line under the count. Keep the badge on the row itself.
- The Wording History disclosure entirely, per section 3.
- The document label from every surface. "Draft for review (CelticResolution 28 Jul)" is an
  auto-generated internal label that correlates to nothing a reader can see. The banner names the
  meeting, the requisition card names itself, and labels stay in the data as timestamps.
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
