# CSL Claude Code Prompt - Hotfix, All Four Site Gates

**Date:** 27 July 2026
**Author:** Gary Phinn, Volunteer IT Lead
**Brief version this assumes:** 1.1
**Priority:** Tonight. This is a regression, not a package.

---

## 1. The problem

After AGM Package 1 merged, **`membership_open` no longer works**. Flipping it in the admin
operations page has no effect on the site. `portal_open` does still work. The two AGM gates were
proven working on a deployed Preview at the end of Package 1.

All four gates must work by the end of this session:

| Key | Controls | Current state |
|---|---|---|
| `membership_open` | Membership sign-up | **Broken, regressed after Package 1** |
| `portal_open` | Member portal access | Working |
| `resolution_open` | Requisition signing | Working |
| `proxy_open` | Proxy capture | Working |

Go-live is roughly four weeks away and the membership gate is a control we may need at short
notice during migration. It cannot be left in this state.

---

## 2. Diagnose before you change anything

Package 1 touched `app/member-portal/admin/operations/page.tsx`, `components/Nav.tsx`,
`lib/agm-gates.ts`, `app/api/agm-gates/route.ts` and the two AGM page routes. Start from the
diff, not from a theory.

```
git log --oneline -5 develop
git show --stat <the AGM P1 commit>
```

Answer these before writing a fix, and report the answers:

1. **What exactly is broken?** Does the toggle fail to write the value to `site_config`, or does
   it write correctly and the site fail to honour it? Check the database directly. These are
   completely different bugs and the distinction determines the fix.
2. **What did Package 1 change about the membership path?** Specifically, did the edit to the
   admin operations page alter how `MembershipGateToggle` renders, receives props, or posts to
   `POST /api/admin/site-config`?
3. **Why does `portal_open` still work when `membership_open` does not?** They are near-identical
   mechanisms. Whatever differs between them is very likely the bug, or points straight at it.
   Package 1 reported `/membership` renders as `○ Static` while other routes do not. Check
   whether that is still true and whether it is sufficient to explain the symptom on its own.

Timebox this to about fifteen minutes. If you cannot pin the cause in that time, report what you
have ruled out and proceed to Section 3 anyway, because the unified fix addresses the most likely
causes regardless.

---

## 3. The fix

Do not patch the membership gate in isolation. Package 1 already proved that the shared
`getSupabase()` client serves stale `site_config` values from the Next.js Data Cache on a deployed
environment, and `membership_open` and `portal_open` both still read through it. Portal appearing
to work does not mean it is reliable, it may simply have been read at a moment that happened to be
fresh. Fixing membership alone leaves two of four controls on a path we know is unsound.

**Generalise `lib/agm-gates.ts` into one gate helper for all four keys.**

- Rename or extend it, `lib/site-gates.ts` or similar, exporting a single typed accessor over all
  four keys.
- Keep the behaviour Package 1 established: a dedicated Supabase client forcing `cache: "no-store"`,
  and fail closed on a read error, a missing key or missing config.
- Every page and every API route that depends on a gate reads through it. No exceptions, no second
  path.
- Fix the render mode of any gated page that is statically rendered. A gate cannot work on a page
  baked at build time. If `/membership` is `○ Static`, it must not be.
- The admin toggles must read current state through the same uncached path, so the UI cannot show
  a state that differs from what the site is enforcing.

Preserve the existing public behaviour of all four flows. This is a plumbing change. Do not take
the opportunity to redesign the toggles, restyle the operations page, or alter any gate's
user-facing copy.

---

## 4. How this is proved

The only acceptable evidence is a flip test on a deployed Preview. Storing the value is not the
same as honouring it, and localhost does not reproduce the Data Cache or static rendering
behaviour that causes this class of bug.

For **each** of the four gates, on the `develop` Preview:

1. Record the starting state.
2. Flip it in the admin operations page.
3. Confirm the deployed site changed: the gated page and, where one exists, the gated API route.
4. Flip it back.
5. Confirm it changed back.

Paste the actual observed results as a table, one row per gate, both directions. A gate that you
did not personally flip and observe is not proven, and should be reported as unproven rather than
assumed working.

Do not poll `vercel ls` in a loop while waiting for the Preview. Poll the endpoint:

```bash
URL=https://csl-website-git-develop-gary-phinn-s-projects.vercel.app
until curl -sf -o /dev/null "$URL/api/agm-gates"; do sleep 5; done
```

Run only the gate tests plus anything already covering the membership and portal routes. Do not
run the full regression suite. Extend the existing AGM gate test file to cover all four gates
rather than creating a second one, so there is one place that proves gating works.

---

## 5. Constraints

Work directly on `develop`, commit as `AGM P1 hotfix: unify site gates on uncached reads`. Do not
create a branch. Do not merge to `main`.

Leave all four gates in the state you found them at the end of the session, and say explicitly in
your report what that state is.

If the diagnosis in Section 2 reveals that the cause is something other than caching or static
rendering, stop and tell me before applying Section 3. A wrong fix tonight is worse than an
honest "here is what it actually is".

---

## 6. Report back

1. The cause, in one or two sentences.
2. What changed, with file paths.
3. The four-gate flip table, actual observed results.
4. Which gates are proven and which are unproven, stated plainly.
5. Anything you noticed and did not fix.
6. Whether `membership_open` being static was the whole story or only part of it.

No em dashes. Cite file paths for every claim.
