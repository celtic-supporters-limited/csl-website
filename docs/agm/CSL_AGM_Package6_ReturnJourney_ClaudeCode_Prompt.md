# CSL Claude Code Prompt - AGM Package 6, Documents and the Return Journey

**Date:** 30 July 2026
**Author:** Gary Phinn, Volunteer IT Lead
**Brief version this assumes:** 1.5
**Model:** Sonnet 5. `@react-pdf/renderer` is already a dependency and already runs inside Vercel's
limits for the membership and operations reports, so the document pattern is proven.
**Status:** Specified, not scheduled. The build is frozen for manual testing.

**This supersedes and absorbs Package 7.**

**Amended 30 July** to reinstate the director's stated requirements. An earlier draft of this
document reasoned the PDF away and dropped one of the two lodgement paths. Both were my errors, and
section 3 is now the authority.

---

## 1. Session instruction

Read `CLAUDE.md`, then `docs/agm/CSL_AGM_Programme_ClaudeCode_Briefing.md`, then
`docs/AGM_Build_Status.md`. Then read Celtic plc's own Notice of AGM 2025 at
`https://cdn.celticfc.com/assets/AGM_Notice_2025.pdf`, particularly notes 2 and 3, which govern what
a valid proxy appointment looks like and how it must reach the registrar.

Confirm scope in about 200 words plus blockers.

Work on `develop`. Commit as `AGM P6: instrument documents and return journey`.

---

## 2. Why Packages 6 and 7 are one package

Package 5 built the nominee instruction. What it could not build is the confirmation, because
"I have sent this" cannot honestly be ticked on the submission form: the member has not sent
anything yet. That confirmation has to arrive later, which means an email.

Package 7's email-out is the same email, and the document it carries is the same document. So this
is one package that produces two documents and sends one email, not two packages sending two.

---

## 3. The director's requirements, verbatim

This is the authority for the package. Where anything below conflicts with it, this wins.

> "Yes to both a downloadable PDF and an email-out option, for both flows. For direct holders the
> flow produces the completed appointment naming me; whether CSL bulk-lodges the block to
> Computershare or each member lodges their own is the one point the solicitor is confirming, so
> build both a we-lodge path and a member-lodges path and default to we-lodge until I confirm. For
> nominee holders the flow produces a pre-filled instruction addressed to their platform, they send
> it through their own account, and tick 'I have sent this' so we can expect the vote; we never ask
> for platform logins."

Four requirements: a PDF and an email for both flows, both lodgement paths built with we-lodge as
the default, the nominee instruction and confirmation, and no request for platform credentials
anywhere.

**Note that Package 5 built only the we-lodge path**, on my instruction. Adding member-lodges is
therefore part of this package, not something already present.

---

## 4. The two documents

Both downloadable at the point of completion and attached to the email in section 6.

### 4.1 The requisition

A completed requisition form for the signatory, carrying their details, the resolution, the
supporting statement, the declaration and the consent as they agreed to them, with their typed
signature and the date.

Follow the shape of Appendix 1 in `docs/agm/reference/ShareAction_UK_Guide_Shareholder_Resolutions_2019.md`,
which is the established UK form. Take the field order and structure from it and say in your report
what you used.

Take the four texts from the signature's own snapshot columns, not from the live wording. The
document must show what that person actually saw, which is the entire reason the snapshots exist.

### 4.2 The proxy appointment

A completed appointment naming Brian McLaughlin, carrying the member's details, shareholding,
share class, the declaration snapshot, their typed signature and the date.

Celtic's notes 2 and 3 govern its content. In particular the number of shares must be stated, and
their note warns that failing to state it, or overstating it, may invalidate the appointment. Read
their own form and mirror its structure rather than inventing a layout.

Nominee holders do not receive this document. They receive the platform instruction in section 5.3.

**The share count must be an exact figure, not a band.** Celtic's note 2 warns that failing to state
the number of shares, or stating more than are held, may invalidate the appointment. `shares_held`
currently holds a banded range from `agm_share_bands`, including "Not sure", and none of those can
satisfy that requirement.

So the appointment form needs a required exact integer share count for direct holders. That is a
change to the public form's required fields rather than a documents-only change, and it is approved.
Keep the bands where they already are: the requisition does not have this requirement, and a nominee
holder's shares are registered to their platform rather than to them.

The same paperwork that gives someone their shareholder reference also shows their holding, so
anyone who has found one has found the other.

---

## 5. The three lodgement routes

### 5.1 We-lodge, the default

CSL collects the appointments and lodges them with Computershare as a block. The member's document
is their copy of what was submitted on their behalf.

Celtic's note 3 says a proxy is valid only if completed, signed and sent by post or by hand to
Computershare in Bristol, or cast through their online Investor Centre. There is no email or upload
route, and the deadline is 24 hours before the meeting.

**Whether Computershare will accept a block lodged by CSL against an online signature is exactly the
question the director says the solicitor is confirming.** Build the path, produce the document, and
do not build any automated submission to the registrar. Lodgement is a manual act by a volunteer.

### 5.2 Member-lodges

The member lodges their own appointment. Their document is the thing they act on, and they need to
be told how.

Two sub-routes exist and the page should explain both: post the signed form to Computershare at The
Pavilions, Bridgwater Road, Bristol BS13 8AE, or appoint Brian McLaughlin themselves through
Computershare's online Investor Centre. Investor Centre is faster and carries no risk of the post
missing the 24 hour deadline.

`lodgement_path` already exists on the record and defaults to `we-lodge`. Make it a real choice on
the form, with we-lodge preselected, and record which the member chose.

### 5.3 Nominee holders

Unchanged from Package 5. A pre-filled instruction addressed to their platform, which they send
through their own account, then confirm. **Never ask for platform credentials**, and do not build
anything capable of accepting them.

The instruction should be available both as text they can copy into an email and as a PDF, since
some platforms want a document. Same content either way.

---

## 6. One email, several jobs

After every public submission, send one email, wrapped in try/catch so a send failure never blocks
or rolls back a submission that has already been stored.

| Flow | Attachment | Next action | Confirm link |
|---|---|---|---|
| Requisition signature | Requisition PDF | None, CSL lodges | No |
| Requisition supporter | None | Join CSL | No |
| Proxy interest, pre-notice | None | None, we will contact you | No |
| Proxy appointment, we-lodge | Appointment PDF | None, CSL lodges | No |
| Proxy appointment, member-lodges | Appointment PDF | Post it, or use Investor Centre | Optional |
| Proxy appointment, nominee | Instruction PDF | Send it to your platform | **Yes** |

Reuse `lib/resend.ts` and the existing sender pattern.

---

## 7. The confirmation link

The nominee holder needs to tell CSL they have sent the instruction, days later, without an
account.

**Use the record's own UUID in the URL. No HMAC, no signed token, no new secret.** An earlier draft
of this document specified an HMAC and that was over-engineering: a UUID already carries 122 bits of
randomness, so it is the unguessable token, and signing it protects against an attack the id format
has already prevented. A secret would add something to manage and a failure mode where rotating it
silently breaks every link already sitting in someone's inbox.

One route taking the record id. Validate that it exists and is a nominee appointment, flip
`nominee_instruction_sent`, write a change log entry, show a short confirmation page. No table, no
login, no session, no environment variable.

Idempotent: clicking twice is harmless and says the same thing. Do not expire it; there is no
security value and an expired link produces a support email.

Also confirm that a volunteer can set the flag from the admin, because members will reply by email
rather than clicking. That path exists as a record edit under Package 5a, so verify rather than
rebuild it.

---

## 8. Free tier arithmetic, since it constrains the design

Resend's free tier is 3,000 emails a month with a **100 a day cap**, and the same allowance serves
the membership migration.

A full campaign is a few hundred emails across three months, well inside the monthly allowance.
**The daily cap is the real constraint:** a press mention or a mailout could produce more than 100
submissions in a day and the excess would silently fail.

Log every send failure visibly rather than swallowing it, and surface unsent emails in the admin so
a volunteer can see the backlog and act. Do not build a queue or a retry scheduler.

PDF size matters here too. Keep the documents plain: no images, no embedded fonts beyond what
`@react-pdf/renderer` already uses for the existing reports.

---

## 9. Copy

All email copy and all document boilerplate is TBD placeholder text, clearly marked, listed in your
report as one set so it can be replaced in a single pass with the director.

Do not write persuasive copy. Do write the factual parts: what they submitted, what happens next,
who to contact.

Sender addresses per `CLAUDE.md`, and note the unresolved conflict recorded earlier between
`celticsupporters.net` and `celticsupporterslimited.net`. Use whatever `lib/resend.ts` already sends
from and flag it rather than choosing.

---

## 10. Tests

1. Each of the six flows sends exactly one email, with the right attachment or none.
2. An email or PDF failure does not roll back or block the submission.
3. The requisition PDF renders the signature's own snapshot texts, not the live wording. Prove it by
   editing the live wording and regenerating.
4. The appointment PDF names Brian McLaughlin and states the share count.
5. A valid confirmation link flips `nominee_instruction_sent` and writes a change log entry.
6. An invalid or tampered token is rejected. Clicking a valid link twice is harmless.
7. `lodgement_path` records the member's choice and defaults to we-lodge.
8. No code path requests or stores platform credentials.

Run all AGM test files at the end. Capture and restore staging state.

---

## 11. Report back

Per the brief section 5. In addition:

1. What you took from ShareAction's Appendix 1 and from Celtic's own proxy form, and anything in
   either you could not reproduce.
2. Every location carrying TBD copy, as one list.
3. Rendered PDF sizes, and confirmation they generate inside Vercel's limits at the volumes in
   section 8.
