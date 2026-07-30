# CSL Claude Code Prompt - AGM Package 5a, Everything Editable

**Date:** 30 July 2026
**Author:** Gary Phinn, Volunteer IT Lead
**Brief version this assumes:** 1.5
**Model:** Sonnet 5. Cross-cutting but not conceptually hard, and every pattern exists already.
**Run after:** Package 5 close-out.

Supersedes open items register item 13. Implements brief section 2c across the whole AGM programme,
and unwinds locking work from Packages 2, 3 and 5.

**The one-line summary, if you read nothing else:** nothing is locked except the change log, every
record carries its own evidence of what was signed, and nothing is ever deleted.

---

## 1. Session instruction

Read `CLAUDE.md`, then `docs/agm/CSL_AGM_Programme_ClaudeCode_Briefing.md`, paying particular
attention to **section 2c, which is new at 1.5 and reverses an earlier principle**. Then read
`docs/AGM_Build_Status.md`.

Confirm scope in about 200 words plus blockers before writing code.

Work on `develop`. Commit as `AGM P5a: make every record editable, add the change log`.

---

## 2. Why, because the reasoning matters more than the rule

**Gary's direction:** everything needs to be fixable and editable. Nothing is single-shot.

This programme has been building records that cannot be corrected from the interface, on the
reasoning that locking them makes them defensible. In practice it does the opposite. When a
shareholder emails to say their reference number is mistyped, the correction happens anyway, in the
Supabase table editor, by whoever holds dashboard access, with no record that it happened, no note
of the previous value, and no way to tell afterwards. **The lock did not protect the record. It
moved the edit into the one channel with no audit trail at all.**

An admin edit with a log is more defensible than no edit, not less.

It also costs signatures. Package 8 reconciles against Celtic's share register. A mistyped reference
is a person who fails verification for no good reason, and against a target of 100 you cannot afford
to lose people to typos nobody was permitted to fix.

**The requirement was never immutability. It was provability.** Being able to show what a person
agreed to, months later, to someone hostile. Immutability was one way to deliver that. An
append-only log is another, and it is the one that lets two volunteers do their job.

---

## 3. Everything is editable

Every field on every AGM record is editable from the admin interface. No exceptions, no read-only
fields, no locked columns.

That includes the fields previous packages protected: the wording texts, the declaration and consent
as shown, the typed signature name, the timestamp, and the proxy appointee.

**Three things make that safe, and all three are required.**

### 3.1 The append-only change log

The only thing in the system that cannot be altered.

One table covering all record types: which table, which record, which field, the old value, the new
value, who made the change, when, and a short reason. Written server side on every edit and every
status change. Never written or influenced by the client.

Enforce append-only at the database level: no update, no delete, for any role including
`service_role`. This is the single lock in the programme and it is what makes everything else safe
to change.

Show it on the record in the admin view, most recent first, collapsed.

### 3.2 Warn where the consequence is real

Editing is permitted everywhere. The interface has to say what it means before it happens, and be
specific with numbers.

- Editing wording that has signatures against it: "47 people have signed this wording. Editing it
  changes what they agreed to."
- Editing an evidential field on a single record, meaning the signature name, timestamp, or a proxy
  appointee: name the person and say the record may need re-signing.
- Changing a proxy appointee: say plainly that the registrar may reject an appointment that does not
  match what the member signed.

**Warn, do not block.** A volunteer who has read the warning and proceeds is making a decision, and
that decision is theirs.

### 3.3 Snapshot what was signed, onto the signature itself

Once wording is editable, answering "what did this person sign in September" becomes a
reconstruction: take the current text and replay the log backwards to their timestamp. That works,
but it is a computation nobody has been given a way to run, and it will be needed under pressure by
someone who is not you.

Store the proof on the record instead. Add four text columns to `agm_signatures` holding a copy of
the resolution, supporting statement, declaration and consent **as shown at the moment of signing**,
written at insert. The proxy already does this with `declaration_snapshot`; this is the same idea
applied properly.

Then "what did this person sign" is a lookup on their own row. It survives any later edit to the
wording, needs no reconstruction, and lands directly in the CSV export the solicitor reads, so every
exported row carries its own evidence.

**Size, because the free tiers are a real constraint here.** The four texts are roughly 2.9 KB. At
100 signatures that is 290 KB, at 500 it is 1.5 MB, against a 500 MB Supabase allowance currently
using 12 MB. Checked and accepted. Do not compress, hash or normalise it into a shared table; the
whole point is that the row stands alone.

Snapshot columns are written once at insert and are not edited afterwards. They are not locked,
because nothing is locked, but an edit to them is the clearest possible case for the section 3.2
warning: it is changing the record of what someone agreed to.

### 3.4 Status, never deletion

Covered in section 4.

---

## 4. Status on every record type

| Status | Meaning |
|---|---|
| `active` | Counts, exports, normal |
| `withdrawn` | The person asked to be removed |
| `voided` | CSL determined the record is not usable: wrong data, a duplicate, or superseded by a re-signing |

Applies to `agm_signatures`, `agm_proxies`, `agm_supporters` and the Proxy Interest rows in
`shareholder_cases`. `agm_proxies` already has `active` and `revoked` from Package 5: fold `revoked`
into this scheme rather than running two vocabularies, keeping its proxy-specific meaning.

**No hard delete anywhere, on any AGM record type.** You must always be able to show what happened
and when. A requisition or a proxy block may need to be defensible after lodgement, and "we deleted
it" is not an answer.

Non-active records leave the counts, are marked rather than omitted in exports, and stay visible in
the admin tables. Every status change captures who, when and why, and confirms first, naming the
person.

---

## 5. Unwind the existing locks

**Remove the immutability trigger on `agm_resolution_versions`.** It currently blocks updates to
`body`, `declaration_text`, `consent_text`, `supporting_statement`, `is_placeholder` and others. It
goes entirely, replaced by the log and the warning in 3.2.

Write the SQL, Gary runs it. Rehearse on staging first, per the brief.

**Do not add equivalent triggers to any new table.** If you find yourself writing a trigger that
prevents a change rather than recording one, stop.

The wording history remains stored and remains out of the interface, per the admin redesign. That
decision was about clutter, not about locking, and it stands.

---

## 6. Interface

Both admin pages, following the settled pattern from `/member-portal/admin/resolution`. No new page,
no new vocabulary, no workflow.

- A record opens to an edit view. Every field is a field.
- Save writes the changes and the log entries in one transaction. A change that cannot be logged
  must not be written.
- Status changes are separate actions with their own confirmation.
- The change log sits collapsed at the foot of the record.
- Warnings appear at the point of change, not in a help page.

**Do not build:** bulk edit, an approval workflow, role separation beyond the existing `is_admin`
guard, undo, or a diff view. Two volunteers, correcting the occasional typo.

---

## 7. Tests

1. Editing any field on any record type succeeds and writes a log entry carrying the old and new values.
2. The log is append-only: attempts to update or delete a log entry fail at the database level.
3. A change that fails to log does not write. Prove it, do not assert it.
4. Editing wording that has signatures against it surfaces a warning naming the count, and proceeds when confirmed.
5. Setting a record to `withdrawn` or `voided` removes it from the count and marks it in the export.
6. A non-active record is still present in the admin table, not hidden.
7. No hard delete path exists on any AGM record type.
8. Proxy revocation from Package 5 still behaves as before after folding into the status scheme.
9. A new signature stores all four snapshot texts, matching what the page displayed at that moment.
10. Editing the live wording afterwards leaves an existing signature's snapshot unchanged, so the
    row still shows what that person actually saw. This is the test that proves the whole design.
11. The snapshot texts appear in the CSV export.

Run all AGM test files at the end. Capture and restore the gate, mode and wording state. Staging
should end with `resolution_open` true, the draft wording current, and `proxy_mode` set to interest.

---

## 8. Report back

Per the brief section 5. In addition:

1. Confirm no hard delete exists on any AGM record type.
2. Confirm the change log cannot be altered by any role.
3. Every warning you added, with its exact wording, so I can check it says something a volunteer
   would actually understand.
4. Anything you had to lock in order to make this work, and why. The answer should be nothing except
   the log itself. If it is not, tell me before building it.
