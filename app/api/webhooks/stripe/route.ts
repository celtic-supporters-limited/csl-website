import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabase } from "@/lib/supabase";
import { DISPOSABLE_EMAIL_DOMAINS } from "@/lib/disposable-email-domains";
import {
  sendPaymentFailedEmail,
  sendPaymentFailedVolunteerAlert,
  sendCardExpiryWarningEmail,
  sendWelcomeEmail,
} from "@/lib/resend";
import { logMemberEvent } from "@/lib/member-events";

// ── Derivation helpers ────────────────────────────────────────────────────────

function deriveTier(session: Stripe.Checkout.Session): string {
  if (session.mode === "payment") return "Lifetime";
  const item = session.line_items?.data[0];
  const amount = item?.price?.unit_amount ? item.price.unit_amount / 100 : 0;
  const interval = item?.price?.recurring?.interval;
  if (interval === "month") {
    if (amount === 10) return "Monthly 10";
    if (amount === 25) return "Monthly 25";
    return `PWYW Monthly ${Math.round(amount)}`;
  }
  if (interval === "year") {
    return `PWYW Annual ${Math.round(amount)}`;
  }
  return "monthly";
}

function derivePlanName(session: Stripe.Checkout.Session): string {
  if (session.mode === "payment") return "Lifetime Member";

  const item = session.line_items?.data[0];
  const unitAmount = item?.price?.unit_amount ?? 0;
  const amountPounds = Math.round(unitAmount / 100);
  const interval = item?.price?.recurring?.interval;

  if (interval === "year") return `Annual ${amountPounds}`;
  if (unitAmount === 1000) return "Monthly 10";
  if (unitAmount === 2500) return "Monthly 25";
  return `Monthly ${amountPounds}`;
}

function customerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function subscriptionId(
  sub: string | Stripe.Subscription | null | undefined
): string | null {
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Pre-flight checks ──────────────────────────────────────────────────

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  // ── 2. Signature verification ─────────────────────────────────────────────
  // req.text() preserves the exact raw bytes Stripe signed — must not use req.json().

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  // ── 3. Event handling ─────────────────────────────────────────────────────

  const db = getSupabase();
  // Events generated while using a Stripe test key are marked is_test = true
  // so they can be filtered out of production support timelines.
  const isTestMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? false;

  try {
    switch (event.type) {

      // ── checkout.session.completed ──────────────────────────────────────
      case "checkout.session.completed": {
        const partial = event.data.object as Stripe.Checkout.Session;

        // Retrieve the full session so line_items and customer are expanded.
        const session = await getStripe().checkout.sessions.retrieve(
          partial.id,
          { expand: ["line_items", "customer"] }
        );

        const email = session.customer_details?.email;
        if (!email) {
          console.error(
            "[stripe-webhook] checkout.session.completed: no customer email on session",
            session.id
          );
          break;
        }

        const emailDomain = email.split("@")[1];
        if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
          console.error(
            "[stripe-webhook] checkout.session.completed: disposable email rejected",
            email
          );
          break;
        }

        const stripeCustomerId = customerId(session.customer);
        if (!stripeCustomerId) {
          console.error(
            "[stripe-webhook] checkout.session.completed: no customer ID on session",
            session.id
          );
          break;
        }

        // Guard: if this email is already registered under a different Stripe
        // customer, refuse to overwrite — the user should sign in instead.
        const { data: existingByEmail } = await db
          .from("members")
          .select("stripe_customer_id")
          .eq("email", email)
          .maybeSingle();

        if (
          existingByEmail &&
          existingByEmail.stripe_customer_id !== stripeCustomerId
        ) {
          console.error(
            "[stripe-webhook] Duplicate email with different Stripe customer —",
            `email=${email}`,
            `existing_customer=${existingByEmail.stripe_customer_id}`,
            `new_customer=${stripeCustomerId}`
          );
          return NextResponse.json(
            { error: "Email already registered under a different Stripe customer" },
            { status: 409 }
          );
        }

        const planName = derivePlanName(session);

        // Conflict on stripe_customer_id: immutable and unique per customer.
        // A second checkout by the same Stripe customer (e.g. plan change)
        // updates their record; a brand-new customer always inserts.
        const tier = deriveTier(session);
        const { data: upsertedMember, error: upsertError } = await db
          .from("members")
          .upsert(
            {
              email,
              name: session.customer_details?.name ?? null,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscriptionId(session.subscription),
              membership_tier: tier,
              plan_name: planName,
              amount_pence: session.amount_total ?? 0,
              status: "active",
              is_lifetime: tier === "Lifetime",
            },
            { onConflict: "stripe_customer_id" }
          )
          .select("id")
          .maybeSingle();

        if (upsertError) {
          console.error("[stripe-webhook] Supabase upsert error:", upsertError.message);
          break;
        }

        console.log(`[stripe-webhook] Member upserted: ${email} plan=${planName}`);

        logMemberEvent({
          memberId: upsertedMember?.id ?? null,
          eventType: "checkout.completed",
          detail: { plan_name: planName, membership_tier: tier, amount_pence: session.amount_total ?? 0 },
          stripeEventId: event.id,
          eventEmail: email,
          isTest: isTestMode,
        }).catch((err) => console.error("[stripe-webhook] Event log error (checkout.completed):", err));

        // Welcome email: fire-and-forget, never block or throw
        (async () => {
          try {
            await sendWelcomeEmail({
              name: session.customer_details?.name ?? null,
              email,
              planName,
            });
          } catch (err) {
            console.error("[stripe-webhook] Welcome email error (non-blocking):", err);
          }
        })();

        break;
      }

      // ── invoice.paid ────────────────────────────────────────────────────
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const cid = customerId(invoice.customer);

        if (!cid) {
          console.warn(
            "[stripe-webhook] invoice.paid: no customer ID on invoice",
            invoice.id
          );
          break;
        }

        const { data: paidMember, error } = await db
          .from("members")
          .update({
            status: "active",
            amount_pence: invoice.amount_paid ?? 0,
            payment_failed_at: null,
          })
          .eq("stripe_customer_id", cid)
          .eq("is_lifetime", false)
          .select("id, email")
          .maybeSingle();

        if (error) {
          console.error(
            "[stripe-webhook] Supabase update error (invoice.paid):",
            error.message
          );
        } else {
          console.log(
            `[stripe-webhook] invoice.paid processed for customer ${cid}`
          );
          logMemberEvent({
            memberId: paidMember?.id ?? null,
            eventType: "invoice.paid",
            detail: { amount_pence: invoice.amount_paid ?? 0 },
            stripeEventId: event.id,
            eventEmail: paidMember?.email ?? null,
            isTest: isTestMode,
          }).catch((err) => console.error("[stripe-webhook] Event log error (invoice.paid):", err));
        }
        break;
      }

      // ── invoice.payment_failed ──────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const cid = customerId(invoice.customer);

        if (!cid) {
          console.error(
            "[stripe-webhook] invoice.payment_failed: no customer ID on invoice",
            invoice.id
          );
          break;
        }

        const { data: member, error } = await db
          .from("members")
          .update({ status: "payment_failed", payment_failed_at: new Date().toISOString() })
          .eq("stripe_customer_id", cid)
          .select("id, email, first_name, plan_name")
          .maybeSingle();

        if (error) {
          console.error(
            "[stripe-webhook] Supabase update error (payment_failed):",
            error.message
          );
        }

        if (member?.email) {
          const attemptCount = (invoice as Stripe.Invoice & { attempt_count?: number }).attempt_count ?? 1;

          logMemberEvent({
            memberId: member.id ?? null,
            eventType: "payment.failed",
            detail: { attempt_count: attemptCount },
            stripeEventId: event.id,
            eventEmail: member.email,
            isTest: isTestMode,
          }).catch((err) => console.error("[stripe-webhook] Event log error (payment.failed):", err));

          (async () => {
            try {
              await sendPaymentFailedEmail({
                to: member.email,
                firstName: member.first_name ?? null,
                attemptCount,
              });
            } catch (e) {
              console.error("[stripe-webhook] Resend error (payment_failed member):", e);
            }
          })();

          (async () => {
            try {
              await sendPaymentFailedVolunteerAlert({
                memberEmail: member.email,
                planName: member.plan_name ?? null,
                attemptCount,
              });
            } catch (e) {
              console.error("[stripe-webhook] Resend error (payment_failed volunteer):", e);
            }
          })();
        }

        console.log(
          `[stripe-webhook] invoice.payment_failed processed for customer ${cid}`
        );
        break;
      }

      // ── customer.subscription.updated ───────────────────────────────────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const cid = customerId(sub.customer);

        if (!cid) {
          console.warn(
            "[stripe-webhook] customer.subscription.updated: no customer ID on subscription",
            sub.id
          );
          break;
        }

        const amountPence = sub.items.data[0]?.price?.unit_amount ?? 0;

        const { data: updatedMember, error } = await db
          .from("members")
          .update({ amount_pence: amountPence })
          .eq("stripe_customer_id", cid)
          .eq("is_lifetime", false)
          .select("id, email")
          .maybeSingle();

        if (error) {
          console.error(
            "[stripe-webhook] Supabase update error (subscription.updated):",
            error.message
          );
        } else {
          console.log(
            `[stripe-webhook] customer.subscription.updated processed for customer ${cid}`
          );
          logMemberEvent({
            memberId: updatedMember?.id ?? null,
            eventType: "subscription.updated",
            detail: { amount_pence: amountPence },
            stripeEventId: event.id,
            eventEmail: updatedMember?.email ?? null,
            isTest: isTestMode,
          }).catch((err) => console.error("[stripe-webhook] Event log error (subscription.updated):", err));
        }
        break;
      }

      // ── customer.subscription.deleted ───────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const cid = customerId(sub.customer);

        const { data: cancelledMember, error } = await db
          .from("members")
          .update({ status: "cancelled" })
          .eq("stripe_customer_id", cid)
          .eq("is_lifetime", false)
          .select("id, email")
          .maybeSingle();

        if (error) {
          console.error(
            "[stripe-webhook] Supabase update error (subscription.deleted):",
            error.message
          );
        } else {
          console.log(
            `[stripe-webhook] customer.subscription.deleted processed for customer ${cid}`
          );
          logMemberEvent({
            memberId: cancelledMember?.id ?? null,
            eventType: "subscription.cancelled",
            stripeEventId: event.id,
            eventEmail: cancelledMember?.email ?? null,
            isTest: isTestMode,
          }).catch((err) => console.error("[stripe-webhook] Event log error (subscription.cancelled):", err));
        }
        break;
      }

      // ── customer.source.expiring ────────────────────────────────────────
      // Stripe fires this ~30 days before a saved card expires.
      // We look up the member and email them a prompt to update their card.
      case "customer.source.expiring": {
        const source = event.data.object as Stripe.Card;
        const cid = typeof source.customer === "string" ? source.customer : null;

        if (!cid) {
          console.warn("[stripe-webhook] customer.source.expiring: no customer ID");
          break;
        }

        const { data: expiringMember } = await db
          .from("members")
          .select("email, first_name")
          .eq("stripe_customer_id", cid)
          .eq("status", "active")
          .maybeSingle();

        if (expiringMember?.email) {
          (async () => {
            try {
              await sendCardExpiryWarningEmail({
                to: expiringMember.email,
                firstName: expiringMember.first_name ?? null,
                cardBrand: source.brand ?? null,
                expMonth: source.exp_month,
                expYear: source.exp_year,
              });
            } catch (e) {
              console.error("[stripe-webhook] Resend error (card.expiring):", e);
            }
          })();
        }

        console.log(`[stripe-webhook] customer.source.expiring processed for customer ${cid}`);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(
      "[stripe-webhook] Handler error for event",
      event.type,
      ":",
      err
    );
  }

  return NextResponse.json({ received: true });
}
