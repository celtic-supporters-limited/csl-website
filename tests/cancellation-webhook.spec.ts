/**
 * Cancellation webhook branching — customer.subscription.deleted AND
 * customer.subscription.updated (pending-cancellation / reversal).
 *
 * Authorised and built 2026-07-27, after Tranche 1 sequencing was
 * reconsidered — see .claude/NOTES.md "Cancellation handling" for the full
 * history. This file replaces the earlier test.fixme() placeholders with
 * real coverage for what actually shipped:
 *
 *   - voluntary vs involuntary branch on cancellation_details.reason
 *     (customer.subscription.deleted)
 *   - member cancellation email + volunteer alert, distinct copy/subject
 *     per branch
 *   - period-end date read via getSubscriptionPeriodEnd() (item-level, not
 *     sub.current_period_end directly — see lib/stripe.ts)
 *   - email_log idempotency: the same event replayed (Stripe's own retry
 *     behaviour) must not send either email twice
 *   - pending-cancellation detection on customer.subscription.updated,
 *     keyed to previous_attributes.cancel_at transitioning from null —
 *     NOT cancel_at_period_end, which our own annual-switch flow and the
 *     Stripe Dashboard's "cancel at period end" option both also set
 *   - reversal detection (cancel_at transitioning back to null)
 *   - the annual-switch case (cancel_at_period_end changes, cancel_at does
 *     not) produces no pending-cancellation email
 *   - the per-member one-hour repeat guard, added after cancel -> reverse
 *     -> cancel was found to produce three member emails in minutes
 *
 * REQUIRES two migrations to have been run first:
 *   - sql/add-email-log-correlation.sql — adds email_log.stripe_event_id
 *     and the service_role GRANT the idempotency check depends on.
 *   - sql/fix-member-events-unique-constraint.sql — member_events.stripe_event_id
 *     originally had a single-column UNIQUE constraint, which silently
 *     swallowed the new cancellation.pending/cancellation.reversed rows
 *     because the pre-existing generic "subscription.updated" row already
 *     claimed that stripe_event_id (found while verifying this feature
 *     locally — see .claude/NOTES.md). Without this migration, the
 *     member_events assertions below will read null even though detection
 *     and email sends are working correctly.
 *
 * NOT covered here (deliberately backlogged, not deferred — see NOTES.md):
 * SCA detection.
 *
 * Payload factory follows the pattern established in
 * tests/stripe-webhook.spec.ts (kept as a local copy, matching that file's
 * own convention of not sharing helpers across spec files).
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_URL = "/api/webhooks/stripe";

const canRun = Boolean(WEBHOOK_SECRET && SUPABASE_URL && SERVICE_ROLE_KEY);

function db() {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
}

function sign(payload: object, secret: string): { body: string; sig: string } {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const hmac = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { body, sig: `t=${timestamp},v1=${hmac}` };
}

// dahlia-shape: current_period_end lives on the subscription item, not the
// subscription root — see lib/stripe.ts getSubscriptionPeriodEnd().
function subscriptionDeletedEvent(customerId: string, opts: { reason: string | null; periodEndUnix: number }) {
  return {
    id: `evt_test_cancel_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    object: "event",
    type: "customer.subscription.deleted",
    livemode: false,
    data: {
      object: {
        id: `sub_test_${Date.now()}`,
        object: "subscription",
        customer: customerId,
        status: "canceled",
        cancellation_details: { reason: opts.reason, comment: null, feedback: null },
        items: {
          data: [{
            current_period_end: opts.periodEndUnix,
            price: { unit_amount: 1000, recurring: { interval: "month" } },
          }],
        },
      },
    },
  };
}

// previousCancelAt: "absent" means the key is not present in
// previous_attributes at all (nothing about cancel_at changed on this
// event — e.g. an annual-switch update that only touched
// cancel_at_period_end). null/a-number means the key IS present with that
// prior value — a genuine cancel_at transition.
function subscriptionUpdatedEvent(customerId: string, opts: {
  cancelAt: number | null;
  previousCancelAt: number | null | "absent";
  cancelAtPeriodEnd?: boolean;
}) {
  const previousAttributes: Record<string, unknown> = {};
  if (opts.previousCancelAt !== "absent") {
    previousAttributes.cancel_at = opts.previousCancelAt;
  }
  return {
    id: `evt_test_subupdated_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    object: "event",
    type: "customer.subscription.updated",
    livemode: false,
    data: {
      object: {
        id: `sub_test_${Date.now()}`,
        object: "subscription",
        customer: customerId,
        status: "active",
        cancel_at: opts.cancelAt,
        cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
        items: {
          data: [{
            price: { unit_amount: 1000, recurring: { interval: "month" } },
          }],
        },
      },
      previous_attributes: previousAttributes,
    },
  };
}

async function postWebhook(request: import("@playwright/test").APIRequestContext, payload: object) {
  const { body, sig } = sign(payload, WEBHOOK_SECRET!);
  return request.post(WEBHOOK_URL, {
    data: body,
    headers: { "content-type": "application/json", "stripe-signature": sig },
  });
}

async function seedMember(customerId: string, email: string, firstName: string, planName: string) {
  const { error } = await db().from("members").upsert(
    {
      email,
      stripe_customer_id: customerId,
      first_name: firstName,
      plan_name: planName,
      status: "active",
      membership_tier: "monthly",
      is_admin: false,
      is_lifetime: false,
    },
    { onConflict: "email" }
  );
  if (error) throw new Error(`Failed to seed member ${email}: ${error.message}`);
}

async function emailLogCount(emailType: string, stripeEventId: string): Promise<number> {
  const { count, error } = await db()
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("email_type", emailType)
    .eq("stripe_event_id", stripeEventId);
  if (error) throw new Error(`email_log query failed (has the migration run? sql/add-email-log-correlation.sql): ${error.message}`);
  return count ?? 0;
}

test.describe.configure({ mode: "serial" });

test.describe("customer.subscription.deleted — voluntary vs involuntary", () => {
  test.beforeEach(({}, testInfo) => {
    if (!canRun) testInfo.skip(true, "STRIPE_WEBHOOK_SECRET / SUPABASE_SERVICE_ROLE_KEY not set");
  });

  const periodEndUnix = Math.floor(Date.now() / 1000) - 60; // "ended a minute ago"

  test("voluntary cancellation: status=cancelled, both emails logged once, member_events flags voluntary=true", async ({ request }) => {
    const customerId = `cus_test_voluntary_${Date.now()}`;
    const email = `csl-test-cancel-voluntary-${Date.now()}@celticsupporters.net`;
    await seedMember(customerId, email, "Voluntary", "Monthly 10");

    const event = subscriptionDeletedEvent(customerId, { reason: "cancellation_requested", periodEndUnix });
    const res = await postWebhook(request, event);
    expect(res.status()).toBe(200);

    const { data: member } = await db().from("members").select("status").eq("stripe_customer_id", customerId).maybeSingle();
    expect(member?.status).toBe("cancelled");

    expect(await emailLogCount("cancellation_confirmed", event.id)).toBe(1);
    expect(await emailLogCount("cancellation_volunteer_alert", event.id)).toBe(1);

    const { data: memberEvent } = await db()
      .from("member_events")
      .select("detail")
      .eq("stripe_event_id", event.id)
      .eq("event_type", "subscription.cancelled")
      .maybeSingle();
    expect((memberEvent?.detail as { voluntary?: boolean } | null)?.voluntary).toBe(true);

    console.log("PASS: voluntary cancellation — status, both emails, member_events all correct");
  });

  test("involuntary cancellation (reason absent): status=cancelled, both emails logged once, member_events flags voluntary=false", async ({ request }) => {
    const customerId = `cus_test_involuntary_${Date.now()}`;
    const email = `csl-test-cancel-involuntary-${Date.now()}@celticsupporters.net`;
    await seedMember(customerId, email, "Involuntary", "Monthly 10");

    const event = subscriptionDeletedEvent(customerId, { reason: null, periodEndUnix });
    const res = await postWebhook(request, event);
    expect(res.status()).toBe(200);

    const { data: member } = await db().from("members").select("status").eq("stripe_customer_id", customerId).maybeSingle();
    expect(member?.status).toBe("cancelled");

    expect(await emailLogCount("cancellation_confirmed", event.id)).toBe(1);
    expect(await emailLogCount("cancellation_volunteer_alert", event.id)).toBe(1);

    const { data: memberEvent } = await db()
      .from("member_events")
      .select("detail")
      .eq("stripe_event_id", event.id)
      .eq("event_type", "subscription.cancelled")
      .maybeSingle();
    expect((memberEvent?.detail as { voluntary?: boolean } | null)?.voluntary).toBe(false);

    console.log("PASS: involuntary cancellation — status, both emails, member_events all correct");
  });

  test("idempotency: replaying the same event does not send either email twice", async ({ request }) => {
    const customerId = `cus_test_idempotent_${Date.now()}`;
    const email = `csl-test-cancel-idempotent-${Date.now()}@celticsupporters.net`;
    await seedMember(customerId, email, "Idempotent", "Monthly 10");

    const event = subscriptionDeletedEvent(customerId, { reason: "cancellation_requested", periodEndUnix });

    const first = await postWebhook(request, event);
    expect(first.status()).toBe(200);

    // Stripe retries the exact same event (same id) on any non-200 — simulate
    // that by posting the identical payload again.
    const second = await postWebhook(request, event);
    expect(second.status()).toBe(200);

    expect(await emailLogCount("cancellation_confirmed", event.id)).toBe(1);
    expect(await emailLogCount("cancellation_volunteer_alert", event.id)).toBe(1);

    console.log("PASS: replayed event did not duplicate either email — idempotency guard held");
  });
});

test.describe("customer.subscription.updated — pending cancellation / reversal", () => {
  test.beforeEach(({}, testInfo) => {
    if (!canRun) testInfo.skip(true, "STRIPE_WEBHOOK_SECRET / SUPABASE_SERVICE_ROLE_KEY not set");
  });

  test("pending cancellation: cancel_at newly set sends member email + volunteer alert, logs cancellation.pending", async ({ request }) => {
    const customerId = `cus_test_pending_${Date.now()}`;
    const email = `csl-test-cancel-pending-${Date.now()}@celticsupporters.net`;
    await seedMember(customerId, email, "Pending", "Monthly 10");

    const cancelAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const event = subscriptionUpdatedEvent(customerId, { cancelAt, previousCancelAt: null });
    const res = await postWebhook(request, event);
    expect(res.status()).toBe(200);

    expect(await emailLogCount("cancellation_pending", event.id)).toBe(1);
    expect(await emailLogCount("cancellation_pending_volunteer_alert", event.id)).toBe(1);

    const { data: memberEvent } = await db()
      .from("member_events")
      .select("id")
      .eq("stripe_event_id", event.id)
      .eq("event_type", "cancellation.pending")
      .maybeSingle();
    expect(memberEvent).toBeTruthy();

    console.log("PASS: pending cancellation detected — both emails sent once, member_events logged");
  });

  test("reversal: cancel_at cleared sends reversal email, logs cancellation.reversed", async ({ request }) => {
    const customerId = `cus_test_reversed_${Date.now()}`;
    const email = `csl-test-cancel-reversed-${Date.now()}@celticsupporters.net`;
    await seedMember(customerId, email, "Reversed", "Monthly 10");

    const priorCancelAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const event = subscriptionUpdatedEvent(customerId, { cancelAt: null, previousCancelAt: priorCancelAt });
    const res = await postWebhook(request, event);
    expect(res.status()).toBe(200);

    expect(await emailLogCount("cancellation_reversed", event.id)).toBe(1);
    // Reversal has no volunteer alert in this design — confirm none was sent.
    expect(await emailLogCount("cancellation_pending_volunteer_alert", event.id)).toBe(0);

    const { data: memberEvent } = await db()
      .from("member_events")
      .select("id")
      .eq("stripe_event_id", event.id)
      .eq("event_type", "cancellation.reversed")
      .maybeSingle();
    expect(memberEvent).toBeTruthy();

    console.log("PASS: reversal detected — email sent once, member_events logged");
  });

  test("annual-switch case: cancel_at_period_end changes but cancel_at does not — no pending-cancellation email", async ({ request }) => {
    const customerId = `cus_test_annualswitch_${Date.now()}`;
    const email = `csl-test-cancel-annualswitch-${Date.now()}@celticsupporters.net`;
    await seedMember(customerId, email, "AnnualSwitch", "Monthly 10");

    // cancel_at_period_end: true, but previous_attributes has no "cancel_at"
    // key at all — this is what our own annual-switch flow (and the Stripe
    // Dashboard's "cancel at period end" option) actually produces.
    const event = subscriptionUpdatedEvent(customerId, {
      cancelAt: null,
      previousCancelAt: "absent",
      cancelAtPeriodEnd: true,
    });
    const res = await postWebhook(request, event);
    expect(res.status()).toBe(200);

    expect(await emailLogCount("cancellation_pending", event.id)).toBe(0);
    expect(await emailLogCount("cancellation_pending_volunteer_alert", event.id)).toBe(0);
    expect(await emailLogCount("cancellation_reversed", event.id)).toBe(0);

    const { data: memberEvent } = await db()
      .from("member_events")
      .select("id")
      .eq("stripe_event_id", event.id)
      .in("event_type", ["cancellation.pending", "cancellation.reversed"])
      .maybeSingle();
    expect(memberEvent).toBeNull();

    console.log("PASS: cancel_at_period_end-only change (annual-switch shape) does not trigger a pending-cancellation email");
  });

  test("one-hour repeat guard: cancel then immediate reversal for the same member both send — guard is scoped per transition type, not blanket", async ({ request }) => {
    const customerId = `cus_test_repeatguard_${Date.now()}`;
    const email = `csl-test-cancel-repeatguard-${Date.now()}@celticsupporters.net`;
    await seedMember(customerId, email, "RepeatGuard", "Monthly 10");

    const cancelAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    // First event: pending cancellation — should send normally.
    const firstEvent = subscriptionUpdatedEvent(customerId, { cancelAt, previousCancelAt: null });
    const firstRes = await postWebhook(request, firstEvent);
    expect(firstRes.status()).toBe(200);
    expect(await emailLogCount("cancellation_pending", firstEvent.id)).toBe(1);

    // Second event, seconds later: reversal for the same member. Genuinely
    // distinct Stripe event (different event.id), so stripe_event_id
    // idempotency alone would let it through. This is the single most
    // common real case — a member cancels then immediately changes their
    // mind — and must always get a reversal confirmation, even though a
    // "cancellation.pending" row for this member exists within the last
    // hour. The guard is scoped per event_type precisely so this does not
    // get suppressed (a bug found via manual testing, 2026-07-27: the
    // original blanket "any pending-or-reversed activity" check silently
    // dropped exactly this email).
    const secondEvent = subscriptionUpdatedEvent(customerId, { cancelAt: null, previousCancelAt: cancelAt });
    const secondRes = await postWebhook(request, secondEvent);
    expect(secondRes.status()).toBe(200);
    expect(await emailLogCount("cancellation_reversed", secondEvent.id)).toBe(1);

    const { data: secondMemberEvent } = await db()
      .from("member_events")
      .select("id")
      .eq("stripe_event_id", secondEvent.id)
      .eq("event_type", "cancellation.reversed")
      .maybeSingle();
    expect(secondMemberEvent).not.toBeNull();

    // Third event, seconds later: a second cancellation for the same
    // member. This IS a genuine repeat of the same transition type
    // ("cancellation.pending" following another "cancellation.pending"
    // within the hour) and must be suppressed — this is what the guard is
    // actually for.
    const thirdEvent = subscriptionUpdatedEvent(customerId, { cancelAt, previousCancelAt: null });
    const thirdRes = await postWebhook(request, thirdEvent);
    expect(thirdRes.status()).toBe(200); // still 200 — suppression is not an error
    expect(await emailLogCount("cancellation_pending", thirdEvent.id)).toBe(0);

    const { data: thirdMemberEvent } = await db()
      .from("member_events")
      .select("id")
      .eq("stripe_event_id", thirdEvent.id)
      .eq("event_type", "cancellation.pending")
      .maybeSingle();
    expect(thirdMemberEvent).toBeNull();

    console.log("PASS: cancel + immediate reversal both sent; same-type repeat within the hour was suppressed");
  });
});

test.describe("SCA detection — BACKLOGGED, not in scope", () => {
  // Deliberately not written even as a placeholder. Dropped 2026-07-22 —
  // see .claude/NOTES.md for the full rationale. Do not add coverage here
  // without first re-opening that decision.
});
