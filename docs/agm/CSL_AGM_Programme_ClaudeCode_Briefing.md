# CSL AGM Programme - Claude Code Working Brief

**Version: 1.3**
**Date:** 28 July 2026
**Author:** Gary Phinn, Volunteer IT Lead
**Read this at the start of every package session.** Every package prompt assumes it.

Each package prompt names the brief version it was written against. **If the version above does
not match the version named in the package prompt, stop and tell Gary before doing anything
else.** The repository copy at `docs/agm/` is copied over by hand from Gary's working folder, so
a mismatch means the copy was missed and you are about to follow superseded rules.

**Changes in 1.1, all from Package 1:** no feature branches, work directly on `develop`; runtime
controls must be proved by flipping them on a deployed Preview; test only what the change
touches; do not poll `vercel ls` in a loop.

**Changes in 1.2, all from Package 2:** every SQL Editor table needs an explicit GRANT; rehearse
the exact production sequence, not an approximation of it; suspect your own code before blaming
the infrastructure.

**Changes in 1.3, from the solicitor pack review:** a third item added to section 6, the
declaration must be in the correct legal frame; version binding extended to cover the declaration
and consent wording, not only the resolution; and a note that the free-mistake window closes when
signing opens rather than when answers arrive.

**Changes in 1.2.1, session efficiency only, nothing about how the work is done:** environment
facts recorded once in section 2a so no session re-derives them; local dev hygiene; reporting
economy; a stated rule on when localhost is an acceptable test target. Package prompts now
reference this brief rather than repeating its rules, so this document is the single place any
standing rule changes.

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

## 2a. Environment facts

Established facts, so no session spends time re-deriving them. Every one of these has already
cost time at least once, and one was re-derived wrongly and produced a false finding that had to
be unwound.

| Fact | Value |
|---|---|
| Staging Supabase project ref | `mixwriunejiaxbpgxqmp` |
| What the Vercel Preview reads | **Staging.** Proven by controlled experiment on 27 July |
| Preview URL for `develop` | `https://csl-website-git-develop-gary-phinn-s-projects.vercel.app` |
| Production database | Not accessible to you. Gary runs anything that touches it |
| Row counts, as a sanity check | Staging `shareholder_cases` in the tens, production in single figures |
| DDL | You cannot execute it. PostgREST will not, and there is no arbitrary-SQL RPC. Write the SQL, Gary runs it in the Supabase SQL Editor |
| `vercel env pull` | Returns keys with empty values for this account. This is normal and says nothing about configuration. Do not treat it as evidence |
| `X-Vercel-Cache` | Describes the edge cache only. It does not tell you whether the Next.js Data Cache served a stale value |

If any of these turns out to be wrong, say so in your report and I will correct the brief. Do not
work around a discrepancy silently.

**Local dev hygiene.** Never run `npm run build` against a working directory that has a dev server
running on it. The build overwrites `.next` beneath the running server, every JS chunk then 404s,
no page hydrates, and the symptoms look exactly like application bugs. This has already produced a
confident but false "pre-existing test failure" conclusion that had to be unwound. Stop the server
first, or build elsewhere.

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
   build is not. **Keep it to about 200 words plus any blockers.** It is a check that you read the
   spec correctly, not a restatement of it. Blockers are uncapped, and are the reason this step
   exists: Package 2's confirmation surfaced two that would otherwise have wasted a whole build.
4. You work directly on `develop`. **Do not create feature branches.** Commit with the prefix
   `AGM PN:` so the history stays greppable, for example `AGM P2: rebuild requisition schema`.
   Push, do not promote to `main`.
5. You report back in the format in section 5.
6. Gary reviews and returns with the next package.

Why no feature branches: this is a single developer project, every AGM package lands behind a
gate that is closed by default, and unfinished AGM code therefore cannot affect anyone. Branch
isolation was buying protection the gates already provide, at the cost of multiple stale
in-flight branches whenever Gary is diverted onto urgent membership or Stripe work, which happens
often. The control that does matter is that `develop` is never promoted to `main` mid-package.
That is Gary's decision to make, not yours. Never merge to `main`.

**One package, one session.** Sessions are not continued across packages. Each specification is
written to stand alone precisely so that a cold session can execute it, and a cold session is
what you will be. Do not assume knowledge from a previous package beyond what is committed to the
repository.

**After a squash merge the local repository can be left sitting on `main`.** Run `git status` and
`git branch --show-current` at the start of every session, check out `develop`, and pull before
doing anything else.

---

## 4. Standing rules

These apply to every package unless a specific package spec overrides them.

**Scope.** Build what the package asks for. Nothing else. You will notice adjacent problems,
because the audit documents plenty of them and they are all real. Record them in your report. Do
not fix them. A package that quietly does the next package's work as well cannot be reviewed,
and review is the only quality control this project has.

**Testing.** Test what the change touches, plus any existing test covering the same routes. Do
not run full regression suites. Never test against production, because several AGM tests submit to
live endpoints and would write real rows.

Where to run, and this distinction matters:

- **The deployed Preview is required** for anything touching caching, render mode, a runtime
  control, or anything whose behaviour could differ between `next dev` and a production build.
  Localhost does not reproduce the Data Cache or static rendering, and both have already produced
  live defects that localhost passed cleanly.
- **Localhost against the staging database is acceptable** for validation logic, schema
  constraints and API branching, which are none of those things. If you run locally, say so and
  say why in one line.

Known constraint: the sign endpoint allows two requests per hour per IP, and Vercel sets
`x-forwarded-for` to the real client IP, so a whole suite run from one machine shares one bucket
and trips it. That is the limiter working correctly, not a defect. It does mean Preview runs of
the full capture suite are currently impractical. **Backlog item, not to be solved inside a
package:** a test-only bypass validated against a secret, or a raised limit scoped to Preview. Do
not silently default to localhost because the Preview run was inconvenient.

**Waiting for deployments.** Do not poll `vercel ls` in a loop. Each `npx vercel` call re-resolves
the package and hits the API, and if the match fails the loop burns its full budget and reports
nothing. Poll the deployed endpoint directly until it responds, then assert on the response, which
is the thing actually being waited for:

```bash
URL=https://csl-website-git-develop-gary-phinn-s-projects.vercel.app
until curl -sf -o /dev/null "$URL/api/agm-gates"; do sleep 5; done && curl -s "$URL/api/agm-gates"
```

Builds complete in under a minute. If a wait exceeds two minutes, stop and report rather than
continuing to poll. `npx vercel inspect <url> --wait` is an acceptable alternative to writing a
loop at all.

**Every table created in the Supabase SQL Editor needs an explicit GRANT.** Tables created there
are owned by `postgres` and carry no privileges for `service_role`, so the application cannot read
them. This has now bitten twice, `backup_log` and `agm_p2_preserve_log`, and in both cases the
symptom was silent: the reader returned zero rows rather than an error, so an operations report
said "no backups" when it meant "cannot see backups". Include the GRANT in the same script that
creates the table, read the table back from the application afterwards to prove it, and where a
reader can return empty, make it distinguish "no rows" from "cannot read".

**Rehearse the exact production sequence, not an approximation of it.** A rehearsal that runs
different steps in a different order proves nothing about the run that matters. Package 2's
rehearsal originally dropped the table on staging while production renamed it, which skipped the
one step that would have failed: `ALTER TABLE ... RENAME` does not move indexes or constraints, so
recreating the table collides and aborts partway, leaving the original renamed and the new one
half built. Staging must execute the same scripts in the same order, manufacturing its starting
state first if necessary.

**Suspect your own code before blaming the infrastructure.** Two findings in this programme have
been withdrawn after review, and both had the same shape: a surprising observation, then an
environmental explanation reached for before the mundane one. A Preview deployment appeared to
read a different database, and was in fact serving a cached value from a bug in the code under
test. Rate limiters appeared ineffective, and were in fact working correctly against a test
harness making every request from one IP. Before concluding that a platform is misconfigured, rule
out your own change and your own test conditions, and say which you ruled out and how.

**Data.** Never write migration or backfill logic for AGM tables. Where a schema is wrong, drop
and recreate. If you find yourself writing a migration path for existing rows, stop, you have
misread the situation.

**Gates.** Both AGM flows are controlled by `site_config` keys read through one shared helper
used by both pages and both API routes. Gates fail closed on a read error. Never gate a page
without gating its API route.

**Runtime controls must be proved by flipping them.** Any control changed at runtime rather than
by deploy needs a test that flips it and confirms the behaviour changed, on a deployed Preview
and not only on localhost. Storing the value is not the same as honouring it. Next.js caches
`fetch` results in its Data Cache independently of the edge cache and independently of
`force-dynamic`, so a toggle can be written correctly, read correctly, and still have no effect
on a deployed environment. This was live on a Preview during Package 1 and is the single easiest
way to ship a control that silently does nothing. `X-Vercel-Cache: MISS` does not disprove it,
that header describes the edge cache only.

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

**Length.** Items 1 and 2 should be terse: file paths, one line each, and the actual test output.
Do not narrate the working, do not restate the specification back, and do not explain decisions
that went exactly as specified.

**Items 3, 4 and 5 are not capped and should not be trimmed.** They are the most valuable output
of the session and have repeatedly changed decisions: a retracted claim about which database a
Preview reads, a withdrawn finding about rate limiters, a deliberate deviation on fail-open
behaviour that was correct and was upheld, a correction to an assumption Gary had made about a
test fixture, and a null field in preserved data that changed what happens to a real person. None
of those were asked for. If you are unsure whether something belongs, include it.

**This brief is the single source of standing rules.** Package prompts will not repeat them. If a
package prompt appears to contradict this document, say so rather than guessing which wins.

---

## 6. What good looks like

The three things in this programme that cannot be fixed after the fact:

- **The proxy appointee must be locked to a named natural person, server side.** It must never be
  blank, null, defaulted to the Chairman of the meeting, or substituted by the user. Celtic's own
  form defaults to the Chairman. Ours must not, and a test must assert it.
- **A signature must be bound to the exact text that was on screen when it was made.** Not just
  the resolution: the declaration and the consent wording too. If any of them changes after
  collection and we cannot prove what each person saw, the signatures are worthless.
- **The declaration must be in the correct legal frame.** A section 338 request comes from the
  members themselves. Each signatory is a requisitionist in their own right, not a supporter of
  someone else's requisition. Wording along the lines of "I support CSL requisitioning a
  resolution" is the wrong frame and may be void however perfectly it is bound to a version. The
  version binding proves what someone agreed to; the frame determines whether what they agreed to
  is a request at all.

Everything else in this programme is recoverable. Those three are not. When a package touches any
of them, slow down.

**The window in which mistakes are free closes when signing opens, not when the answers arrive.**
While no signatures exist, changing wording or adding a column costs minutes. Once signatures
exist, the same change means people agreed to something different and any schema work is a
migration against real records. Build now, deliberately, while it is cheap.
