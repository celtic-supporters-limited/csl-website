# CSL AGM Programme - Claude Code Working Brief

**Date:** 27 July 2026
**Author:** Gary Phinn, Volunteer IT Lead
**Read this once at the start of the programme.** Every package prompt assumes it.

---

## 1. What we are building and why it matters

Celtic Supporters Limited is a not for profit shareholder organisation pursuing governance led
change at Celtic plc. Over the next three months we are building two things that have legal
effect. Not features. Instruments.

**The requisition**, under Companies Act 2006 section 338, puts a CSL resolution onto the agenda
of the Celtic plc Annual General Meeting. It needs 100 qualifying shareholders. It has to reach
the company around early to mid October.

**The proxy appointment** is the vote on the day, appointed to Brian McLaughlin as a named
natural person. It can only be lodged after Celtic issues its Notice of AGM, expected late
October, because a proxy is specific to one meeting.

These are two separate instruments on two separate clocks and they must never be merged into one
form. That is the single organising principle of the whole programme.

Why the care: in 2025 the Celtic Trust had proxies rejected by the registrar because of how the
appointment was framed. If we get the wording or the data wrong, the instrument fails, and it
fails at the point where it cannot be redone. There is no patch release for a missed statutory
deadline. This is the reason for the unusual amount of specification you are about to receive,
and the reason scope discipline matters more here than speed.

---

## 2. Where things stand

The `csl-website` platform **is not live**. It replaces the existing WordPress site and goes live
in roughly four weeks. Nothing in the AGM flows has reached a real shareholder.

An audit of what exists is committed at `docs/2026-07-27_Proxy_Requisition_Audit.md`. Read it
before your first package. In summary: the requisition is roughly half built, the proxy is not
built at all, and the admin signature tracker is sound.

**All AGM data is disposable.** Staging holds 59 `shareholder_cases` rows, production holds 2,
and the `agm_signatures` rows are test data. Everything can be wiped and recreated.

We are building and gating everything now so that activation on the day is a toggle, not a
deploy. Nothing has to be perfect the day it merges. It has to be correct the day it is opened.

---

## 3. How we will work

The audit proposes ten packages. We work through them one at a time.

**For each package:**

1. Gary provides a markdown specification, written outside this repository, covering one package.
   It is self contained. It states scope, what is explicitly out of scope, the requirement, the
   tests, and what to report back.
2. You start a fresh session, read `CLAUDE.md`, this brief, the audit, and the package spec.
3. **You confirm the scope back to Gary in your own words before writing any code.** If the spec
   is ambiguous, or contradicts the audit or the codebase, say so at this point rather than
   picking an interpretation and proceeding. Disagreement here is cheap. Disagreement after the
   build is not.
4. You branch from `develop` as `feature/agm-package-N-<short-name>`, build, test, and commit.
   You do not merge.
5. You report back in the format in section 5.
6. Gary reviews, merges, and returns with the next package.

**One package, one session, one branch.** Sessions are not continued across packages. Each
specification is written to stand alone precisely so that a cold session can execute it, and a
cold session is what you will be. Do not assume knowledge from a previous package beyond what is
committed to the repository.

**After a squash merge the local repository stays on `main`.** Run `git status` and
`git branch --show-current` at the start of every session and check out `develop` before doing
anything else.

---

## 4. Standing rules

These apply to every package unless a specific package spec overrides them.

**Scope.** Build what the package asks for. Nothing else. You will notice adjacent problems,
because the audit documents plenty of them and they are all real. Record them in your report. Do
not fix them. A package that quietly does the next package's work as well cannot be reviewed,
and review is the only quality control this project has.

**Testing.** Test what the change touches, plus any existing test covering the same routes. Do
not run full regression suites. Run against the branch Preview deployment using
`PLAYWRIGHT_BASE_URL`, never against production, because several AGM tests submit to live
endpoints and would write real rows.

**Data.** Never write migration or backfill logic for AGM tables. Where a schema is wrong, drop
and recreate. If you find yourself writing a migration path for existing rows, stop, you have
misread the situation.

**Gates.** Both AGM flows are controlled by `site_config` keys read through one shared helper
used by both pages and both API routes. Gates fail closed on a read error. Never gate a page
without gating its API route.

**Email.** The same Resend API key is used across Preview and Production. This is a deliberate,
accepted position for a small volunteer led organisation. It is not a finding, do not raise it,
and do not treat staging email as untestable. Note that `go-live-implementation-plan.md` item
P0.10 claims the Preview key is empty; that document is out of date on this point.

**Personal data.** Shareholder reference numbers, addresses and share holdings are identifying
data. Never commit real member or shareholder data, never write it into test fixtures, never put
it in a commit message. Supabase EU region only. No `.env` files or keys in git, ever.

**Public identity.** No personal names on public pages, role titles only. The one deliberate
exception is the proxy appointee, who must legally be a named natural person. That name is added
in a specific package, not before.

**Writing.** No em dashes anywhere, in code comments, documentation or commit messages. Use
hyphens. Avoid filler adjectives. Every claim about what you changed cites a file path.

---

## 5. How to report back

At the end of every package, in the chat, not as a file:

1. **What changed.** Files touched, with paths. One line each.
2. **What you tested and the actual result.** Paste the real output. If something in scope was
   already failing before your changes, say so plainly and do not fix it.
3. **Anything that contradicted the spec, the audit or `CLAUDE.md`.** The audit was written by a
   different session and may be stale. If the codebase disagrees with it, the codebase wins and
   we need to know.
4. **Adjacent problems you found and did not fix.** Numbered, with a severity you assign
   yourself.
5. **Anything you were unsure about and made a judgement call on.** This is the most valuable
   line in the report. Gary cannot read every diff, so the honest flagging of a decision you were
   not certain about is worth more than a clean summary.

Then stop. Do not begin the next package.

---

## 6. What good looks like

The two things in this programme that cannot be fixed after the fact:

- **The proxy appointee must be locked to a named natural person, server side.** It must never be
  blank, null, defaulted to the Chairman of the meeting, or substituted by the user. Celtic's own
  form defaults to the Chairman. Ours must not, and a test must assert it.
- **A signature must be bound to the exact version of the resolution text that was signed.** If
  the wording changes after collection and we cannot prove what each person agreed to, the
  signatures are worthless.

Everything else in this programme is recoverable. Those two are not. When a package touches
either, slow down.
