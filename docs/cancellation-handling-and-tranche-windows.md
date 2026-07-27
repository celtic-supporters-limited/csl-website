# Cancellation Handling and Tranche-Window Rules

Draft for reconciliation with the existing (external) Tranche cutover procedure document. This
file captures only what's specific to the cancellation-email code in this repo — the WordPress
migration mechanics, batch scheduling, and comms plan live in the external document, not here.

## 1. Why this exists

The migration brings ~479 stale WordPress cards into Stripe. A meaningful share of those will
fail on first charge and, after Stripe's Smart Retries schedule (8 attempts over 15 days),
generate `customer.subscription.deleted` events — involuntary cancellations, not members
choosing to leave. If the site's cancellation-handling code isn't ready to tell the two apart
before that wave lands, every one of those recoverable members gets the wrong email at volume.

## 2. What the code currently does

### 2.1 `customer.subscription.deleted` — voluntary vs involuntary

Branches on `sub.cancellation_details.reason`:

- `"cancellation_requested"` → voluntary. Member gets the cancellation-confirmation email;
  volunteer gets a standard alert.
- anything else (dunning exhaustion, etc.) → involuntary. Different copy, different volunteer
  alert subject line, framed as recoverable ("card failed after 8 attempts over 15 days" —
  the confirmed Smart Retries wording).

This branch is unaffected by anything below and was validated against a real captured
cancellation payload (`gphinn+signup4@gmail.com`, 2026-07-27).

### 2.2 `customer.subscription.updated` — pending cancellation and reversal (click-time)

Built 2026-07-27. Fires on the moment a member schedules a cancellation via the Stripe Billing
Portal, or reverses one — before the subscription actually ends.

**Detection signal:** `cancel_at` transitioning from null (Billing Portal path), specifically
*not* `cancel_at_period_end`. A real captured payload showed the Billing Portal sets
`cancel_at` to a future timestamp and leaves `cancel_at_period_end: false` — the boolean never
flips on that path. `cancel_at_period_end` is set directly by exactly one other call site in
this codebase: the monthly→annual switch flow, which is a different, internal-only signal and
must not be conflated with a member-initiated cancellation.

**Practical consequence for volunteers:** if a member's cancellation was made through the
**Stripe Dashboard** rather than the Billing Portal, check what field Stripe Dashboard's own
"cancel at period end" checkbox writes before assuming it will trigger this flow. It writes
`cancel_at_period_end`, not `cancel_at` — confirmed against Stripe's own documentation. **A
Dashboard-initiated cancellation on behalf of a member will not trigger the pending-cancellation
email or volunteer alert.** Member-requested cancellations should go through the Billing Portal
link in the portal (Manage payment or reverse cancellation), not the Stripe Dashboard directly,
so the automated emails still fire. If a volunteer must cancel a member from the Dashboard
directly, they should expect to send the confirmation manually.

**Per-member repeat guard:** a member who cancels, reverses, and cancels again within an hour
only generates one member email and one volunteer alert per hour-window, not one per Stripe
event. This is a per-member time window (`hasRecentPendingCancellationActivity`,
`lib/member-events.ts`), separate from the existing per-event idempotency
(`stripe_event_id` correlation).

**No rejoin promise:** the pending-cancellation email links to the member portal
(`/member-portal?tab=membership`), never to `/membership` — a member who still has active
access should not be routed through a re-signup flow.

## 3. Tranche-window rules for volunteers

- Expect a cluster of `subscription.deleted` events roughly 15 days after each tranche's first
  charges, as migration-era card failures exhaust retries and land on their individual billing
  anchors — not a single spike, a trickle following each tranche.
- Do not manually cancel a migrated member from the Stripe Dashboard during a tranche window
  unless you are prepared to send the cancellation confirmation yourself (see 2.2 above).
- If a member disputes a cancellation email they didn't expect during a tranche window, check
  `cancellation_details.reason` on the relevant `subscription.deleted` event (or the
  `member_events` row logged alongside it) before assuming it was voluntary — during a tranche
  window, involuntary (dunning) cancellations are the more likely explanation.
- The one-hour repeat guard (2.2) means a member who contacts a volunteer to reverse a
  cancellation and is talked out of re-cancelling within the same hour will not receive a
  second "reversed" email if they change their mind again quickly — this is expected, not a
  bug, and does not affect their actual subscription state.

## 4. What's out of scope here

Batch sizing, the 4-runs-of-~120 schedule, the annual-member pilot batch, and the member comms
plan for the ~480 remaining WordPress members are migration-repo concerns and are not
duplicated in this file — see the external Tranche cutover procedure document for those.
