# CSL Claude Code Prompt - AGM Admin Pages, Simplification Audit

**Date:** 29 July 2026
**Author:** Gary Phinn, Volunteer IT Lead
**Brief version this assumes:** 1.3
**Model:** Opus 5. This is a judgement task, not a construction task, and the failure mode is
recommending additions rather than deletions. Read-only, so the cost is bounded.
**Type:** Audit and recommendation. **No code changes of any kind.**

---

## 1. Session instruction

Read `CLAUDE.md` and `docs/agm/CSL_AGM_Programme_ClaudeCode_Briefing.md`. Then read the two admin
pages named below and everything they render.

**Do not write, edit or refactor any application code, SQL or tests.** The only output is the
recommendation in section 6. If you find a defect, record it. Do not fix it. Confirm you
understand before starting.

---

## 2. Who this is for, and why it matters

Celtic Supporters Limited is run by two volunteers and four directors. Nobody involved is
technical. The people using these pages are the same people writing the emails, chasing the
shareholders and talking to the solicitor, usually in the evening after a day job.

There is **one** AGM in 2026, **one** resolution, and **one** number that matters: how many
verified direct registered shareholders have signed, against a target of 100.

The person leading this design has looked at the current pages and said plainly that he is
confused by them. If the person who commissioned it cannot use it, no volunteer will.

Simplicity here is the requirement, not a preference.

---

## 3. What to audit

Two pages, plus their two sidebar entries:

- `/member-portal/admin/resolution` - "AGM Resolution Progress"
- `/member-portal/admin/resolution/versions` - "AGM Resolution Versions"

Read the page components, their client components, the data they fetch, and the APIs behind them.

Observations from the live staging pages to verify and reason about, not to take on trust:

- The Progress page shows six KPI cards: direct registered shareholders, nominee or platform
  holders, complete signatures, CSL members, non-members, supporters. They occupy most of the
  first screen.
- A progress bar reads "1% of target" against one signature of a hundred.
- An amber banner reads "1 record need completion" followed by three lines of explanation about
  the Package 2 rebuild, discrete address fields and resolution version fields.
- The signature table has many columns and appears to extend beyond the viewport.
- Test and rehearsal rows appear alongside real ones, for example
  `rehearsal-shareholder@example.invalid`.
- The Versions page currently lists eight versions, six of which are test debris with labels such
  as `P3 count probe 1785337782272` and `site-gates.spec.ts gate-open test version`.
- The effective signing state notice appears at the top of both pages.
- Both pages have their own sidebar entry.

---

## 4. The questions to answer

**1. What is each page actually for, and does it need to exist?**
State the job each page does in one sentence. Then say whether two pages can be justified for one
AGM, one resolution and one target. If they cannot, say so directly.

**2. What does a volunteer need at each moment?**
Work through the real moments of use rather than the feature list. Roughly: is signing open and
what are people signing; how many verified signatures do we have and how far off are we; who needs
chasing and why; is the wording right and how do I change it; and on lodgement day, give me the
list.

For each moment, say what is needed and where it currently is.

**3. What can be deleted outright?**
This is the most important question. For every element on both pages, say whether a volunteer
would act differently for having seen it. If not, recommend removing it. Six KPI cards for one
target is the obvious candidate but it will not be the only one.

Be specific. Name the element and say delete, merge or keep.

**4. What is misleading or wrong as displayed?**
Include the grammar, the wording of the amber banner, anything that reads like implementation
history rather than status, and any place where test data is indistinguishable from real data. A
page that shows a rehearsal record next to a real shareholder is not a reporting page, it is a
trap.

**5. What does the redesign look like?**
Propose the simplest thing that works. Describe it in prose and a rough layout, not code. State
what the sidebar should contain afterwards.

---

## 5. Constraints on your recommendation

**Bias to deletion.** The question is what to remove, not what to improve. A recommendation that
adds a feature needs to justify itself against the alternative of removing three.

**Assume one page unless you can show why two are needed.** If you conclude two are justified,
make the argument explicitly rather than defaulting to the current split.

**A change is already drafted for the Versions page**, which would replace it with a single
"Resolution wording" screen showing the four texts with one Edit button, hiding versioning
underneath and removing the words "version", "make current", "duplicate" and "delete" from the
interface entirely. Your recommendation should either absorb that, extend it, or argue against it.
**Produce one consolidated recommendation, not a second competing plan.**

**Do not propose new metrics, charts, filters, dashboards or exports.** The CSV export already
exists and stays.

**Do not propose anything that needs explaining.** If a volunteer needs a paragraph to understand
an element, the element is wrong.

---

## 6. Output

Write your recommendation into the chat. Do not create a file.

1. **The verdict**, three sentences. One page or two, and why.
2. **Delete list.** Every element you would remove, with a one-line reason. Longest section.
3. **Keep list.** Every element that survives, with what a volunteer does because of it.
4. **The proposed page**, described top to bottom, with a rough layout.
5. **What the sidebar looks like afterwards.**
6. **Anything wrong rather than merely cluttered**, including data that should never have been
   visible.
7. **Effort estimate**, S, M or L, and whether it can be done in one session.

No em dashes. Cite file paths. Under 900 words.
