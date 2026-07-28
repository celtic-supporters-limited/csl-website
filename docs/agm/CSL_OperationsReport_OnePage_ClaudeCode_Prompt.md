# CSL Claude Code Prompt - Operations Report, Fit to One Page

**Date:** 28 July 2026
**Author:** Gary Phinn, Volunteer IT Lead
**Brief version this assumes:** 1.1
**Scope:** Layout only. `components/OperationsReportPdf.tsx`, and the export route only if a data
cap is needed.

---

## 1. What this is

The operations status report is used by Gary, Brian and Martin. It is an operational document,
not a board paper. Membership reporting lives in a separate PDF and does not belong here.

It currently runs to two pages, with the closing narrative paragraph alone on page two. It needs
to render cleanly on one A4 page.

**Do not change what is reported.** No new metrics, no removed metrics unless section 3 says so,
no restyling beyond what is needed to fit. This is a layout exercise.

---

## 2. The real requirement

Fitting today's content onto one page is easy. Keeping it there is the actual job.

Two sections grow. Service status went from two cards to four last week when the AGM gates were
added, and will grow again. Database backup history is currently empty, and every successful
backup adds a row, so the report will spill again the moment backups start running.

So the fix is not "tighten the spacing until it fits". It is to make the variable-length sections
bounded, and to verify the page holds at realistic data volumes rather than at today's empty
state. A report that fits only because a table is empty is not fixed.

---

## 3. What is actually overflowing

Measured on the production render of 28 July, A4 at 842pt tall.

Page 1 is full, text running from y18 to y828. The four provider blocks are **already** laid out
as a two by two grid, so there is nothing to gain there. The only content on page 2 is the four
rows of the upgrade table plus the closing narrative, roughly 113pt, followed by 708pt of empty
page. The upgrade table header sits at the very foot of page 1 with its rows orphaned overleaf,
which is why it reads badly.

**So the requirement is to free roughly 130pt on page 1.** Not a redesign. There is more than
enough available in spacing and in one over-long table.

### Changes, in priority order

**1. Cap backup history at the three most recent runs. Saves about 48pt.**
Six rows are currently rendered at roughly 16pt each. Three answers the only question the report
needs to answer, which is whether backups are running and succeeding. Add a line such as "3 more
successful runs in the last 7 days" rather than listing them. If the table is ever empty, collapse
it to a single line instead of rendering an empty table with its note.

**2. Reduce the space above section headings. Saves about 60pt.**
There are eight section headings, each with a 22 to 33pt gap above it. Taking roughly 8pt off each
is invisible to the reader and is the single largest saving available.

**3. Tighten the two rows of service status cards. Saves about 35pt.**
The gaps above each row are 29pt and 38pt. Bringing both to around 16pt closes most of it.

**4. Fold the point-in-time recovery note into one line. Saves about 25pt.**
It currently runs to two wrapped lines plus a 25pt gap above. The substance is that PITR is not
available on the free tier and Supabase Pro provides it, which is already said in the upgrade
table.

**5. Reduce or drop the closing narrative. Saves about 40pt.**
It repeats the upgrade table. Keep only the "£65/month, about 6.5 Standard memberships per month"
framing, which is the line that makes the cost legible, and drop the rest.

Changes 1 to 3 alone come to roughly 143pt, which should be sufficient. Apply in order and stop
when it fits on one page with room to spare. Do not apply 4 and 5 if they are not needed.

**Do not shrink the base font size** to solve this. It is read on screen and printed, and the
saving is available in spacing without hurting legibility.

---

## 4. How this is proved

Render the PDF through the real authenticated `GET /api/admin/operations/export` route, not a
local harness, and confirm:

1. **One page with today's data.**
2. **One page with realistic future data.** Seed or stub the backup history with twenty rows and
   confirm the three-row cap holds the report to one page. This is the test that matters, because
   the table grows by one row every day.
3. **One page with six service status cards**, in case more gates are added later.
4. Nothing is clipped at the page boundary, no orphaned section heading sitting at the foot of
   the page with its content cut off, and the footer still renders.

`pdftoppm` was unavailable last session and react-pdf embeds fonts so text is not extractable
from the content stream. If you still cannot render locally, install `poppler-utils`, or produce
the three PDFs and say plainly that the visual check is Gary's. Do not claim a visual
verification you did not perform.

---

## 5. Constraints

Work directly on `develop`, commit as `ops report: fit operational status to one page`. Do not
create a branch, do not merge to `main`.

Leave all four gates in the state you found them.

Report back: what changed, which of the four changes were needed, and the three renders with
their page counts. Flag anything you had to cut that you think Gary will want back.

No em dashes.
