# Member Migration Plan
## Moving Existing Members onto Native Stripe Subscriptions

**Prepared for:** Brian (Director review)
**Prepared by:** CSL Volunteer IT Lead
**Status:** Draft - for board discussion before any work begins
**Date:** June 2026

---

## Background

The new CSL website uses Stripe's native subscription system for all new members joining
post-launch. This gives us reliable recurring billing, automated payment retries, and a
self-service portal where members can update their own card details.

We currently have approximately 487 members recorded as active and 259 recorded as pending
in our database - a total of around 746 records. This document sets out how to safely move
the 487 active members onto the new subscription system and addresses the 259 pending gap.

---

## 1. Data We Currently Hold Per Member

For each member record in our database, we hold:

| Field | What it is | Migration relevance |
|-------|-----------|---------------------|
| Email address | Primary identifier | Needed to match Stripe records |
| Stripe customer ID | A reference ID Stripe assigned when the member first paid | Critical - this is the key to avoiding card re-entry |
| Stripe subscription ID | Reference to an active recurring subscription | If blank, the member is not yet on a native subscription |
| Membership tier | monthly / annual / lifetime | Determines which subscription to create |
| Plan name | e.g. "Monthly 10", "Monthly 25" | Determines the subscription amount |
| Amount (pence) | What they pay per period | Used to create the subscription at the right price |
| Status | active / pending / cancelled / payment_failed | Determines whether to migrate |
| Name, phone, preferences | Profile data | No migration relevance - stays as-is |

**What we do NOT hold:** Card numbers, CVV codes, or expiry dates. These remain in Stripe's
secure vault and are never stored by CSL. This is important - see Section 3.

---

## 2. The 259 Pending Records: Likely Causes and Prevention

**What "pending" most likely means:**

These are members who started the sign-up journey but did not complete a successful payment
that our system could confirm. The most likely causes are:

- **Abandoned checkout** - the member clicked "Join" but closed the Stripe payment page
  before entering card details or completing the purchase.
- **Webhook delivery failure** - Stripe fires a notification to our website when a payment
  succeeds. If our website was unreachable at that moment (e.g. a deployment was running,
  or the site was temporarily down), the notification may have failed to arrive. Stripe
  retries for several days, but a prolonged outage could result in lost confirmations.
- **Legacy import** - if records were imported from the Pure Baltic system with a "pending"
  status applied by default, and the corresponding payment confirmation was never processed
  through our new webhook.
- **Failed first payment** - the member attempted payment but their card was declined.

**Important:** Pending members should not be automatically migrated onto a subscription.
Each pending record needs individual review to determine whether a payment was actually
collected or not. Migrating a member onto a recurring subscription when no original
payment succeeded would mean charging them for a service they have not yet agreed to pay for.

**Recommended action for pending records:** Export the list, cross-reference against Stripe's
payment dashboard to identify which (if any) have a completed charge, and contact the
remainder individually.

**How the new system prevents this:** The new website only creates a member record in our
database after Stripe has confirmed a successful payment via a signed webhook. There is no
intermediate "pending" state in the new flow - a person is either a paying member or they
are not in the database at all.

---

## 3. Migration Approach for the 487 Active Members

### The core principle

If a member has a Stripe customer ID in our records, and Stripe has a saved payment method
on file for that customer, we can create a native subscription on their behalf without
them needing to re-enter their card details. This is a standard Stripe capability - the
card stays in Stripe's vault and we simply attach a new subscription to it.

### Step-by-step outline

**Step 1 - Data audit (before writing any code)**

Export from the database: all members with status = "active". For each record, note whether
they have a Stripe customer ID and whether they already have a subscription ID. This gives
us three groups:

- **Group A:** Has a Stripe customer ID, no subscription ID - primary migration candidates
- **Group B:** Has both a Stripe customer ID and a subscription ID - may already be on a
  native subscription; verify before touching
- **Group C:** No Stripe customer ID at all - these cannot be migrated automatically; need
  manual card re-entry

**Step 2 - Check for saved payment methods (Stripe side)**

For every Group A member, look up their Stripe customer record and check whether Stripe
holds a saved card for them. A one-off payment (e.g. via an invoice or direct charge)
does not automatically save a card - only a payment made through Stripe Checkout in
subscription mode, or a customer who explicitly saved their card, will have one on file.

This check will divide Group A further:
- **Group A1:** Stripe customer exists and has a saved default payment method - can migrate silently
- **Group A2:** Stripe customer exists but no saved card - needs card re-entry; see below

**Step 3 - Create subscriptions for Group A1 (silent migration)**

For each Group A1 member, a script would:

1. Look up their current plan and amount from our database
2. Call Stripe's API to create a subscription using their saved payment method, at the
   same price they are currently paying
3. Set the billing date to align with their next expected payment (so they are not charged
   twice in the same month - see "Zero double-billing" below)
4. Record the new subscription ID back into our database
5. Log the result for auditing

No action required from the member. Their next payment simply comes via the new subscription.

**Zero double-billing safeguard**

Before creating any subscription, the script checks:
- Is there already a subscription ID recorded for this member? If yes, skip.
- Does Stripe show an active subscription on their customer record? If yes, skip.

When creating the subscription, we use Stripe's `billing_cycle_anchor` parameter to set
the first billing date to match their existing renewal date - so they pay on the same day
they always have, not twice in the same period.

**Step 4 - Handle Group A2 (no saved card)**

These members cannot be migrated silently. The appropriate approach is:

- Send a short, friendly email explaining that we have launched a new membership system
  and asking them to log in and re-enter their payment details
- Provide a direct link to the member portal payment update page
- Give a reasonable deadline (suggested: 30 days) before their membership lapses

This group is likely small - one-off legacy charges without saved cards are less common
than subscription payments with saved cards - but the exact number only becomes clear
after Step 2.

**Step 5 - Group C (no Stripe record)**

These are members with no Stripe presence at all. They need to go through the normal
sign-up flow as if joining fresh. Email them a direct link to the membership page with
a note that their existing membership history will be preserved once they re-subscribe.

---

## 4. Communication to Members

| Group | What they receive | Action required from member |
|-------|------------------|-----------------------------|
| Group A1 (silent migration) | Optional: brief confirmation email that their subscription is now managed through the new portal, with a link to log in and view it | Nothing - their subscription is already active |
| Group A2 (no saved card) | Email asking them to re-enter card details, with a link and a deadline | Re-enter card details via the member portal |
| Group C (no Stripe record) | Email asking them to re-subscribe via the new system | Complete a new sign-up |
| Pending (259) | Individual review first; then a targeted email based on findings | Varies |

**Tone guidance for all emails:** Keep it brief and positive. Something like:

> "We have launched our new member portal. Your membership is active - you can now manage
> your subscription, update your details and access member documents at [link]. No action
> is needed unless you receive a separate email from us."

Avoid technical language about "migration", "webhooks" or "subscription systems."

---

## 5. Rollback Position

The migration script only creates new Stripe subscriptions and updates our database with
the new subscription IDs. It does not delete any existing data.

If the script fails partway through:

- **Stripe side:** Any subscriptions already created can be cancelled immediately via the
  Stripe dashboard with no charge issued, provided we catch the failure within the same
  billing period. A log of all subscription IDs created by the script makes this straightforward.
- **Database side:** If the subscription was created in Stripe but the database update
  failed, we simply re-run the database update step manually - no double charge is possible
  because the duplicate-check in Step 3 prevents creating a second subscription.
- **Members not yet processed:** Unaffected. The script processes one member at a time
  and records each result before moving to the next.

Before running the script on real members, we test it on a single known test account to
confirm all steps work end-to-end.

---

## 6. Recommended Sequencing

**Do not migrate all 487 in a single batch on day one.**

Recommended approach:

| Wave | Size | Purpose |
|------|------|---------|
| Wave 0 (test) | 1-2 internal test accounts | Confirm the script works end-to-end with no side effects |
| Wave 1 (pilot) | 10-20 members | Real members; monitor for unexpected billing events over 48 hours |
| Wave 2 | 100 members | If Wave 1 clean, proceed; continue monitoring |
| Wave 3 | Remaining ~350 members | Final batch |

Each wave should be run during a low-traffic period (weekday morning, not end of month
when many subscriptions renew). A 48-hour observation window between Wave 1 and Wave 2
is strongly recommended.

**Timing relative to go-live**

The migration does not need to happen before go-live. New members can start joining on
native Stripe subscriptions immediately after launch. The existing 487 can be migrated
in the weeks following launch once we have confirmed the new system is stable.

This means launch is not blocked by migration.

---

## Summary of Actions Required Before Migration Can Begin

1. **Board sign-off** on the migration approach and communication plan
2. **Data audit** of the 259 pending records (manual review against Stripe dashboard)
3. **Development** of the migration script (estimated: 1-2 days of volunteer IT time)
4. **Test run** on internal accounts before any real member data is touched
5. **Email templates** drafted and approved by the board
6. **Rollback checklist** prepared and agreed before Wave 1 runs

---

*This document describes the technical approach in plain terms. The actual migration
script will be reviewed and tested before any member data is touched. No migration
work begins without explicit board approval.*
