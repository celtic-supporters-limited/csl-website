import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabase } from "@/lib/supabase";

// ── Derivation helpers ────────────────────────────────────────────────────────

function deriveTier(session: Stripe.Checkout.Session): string {
  if (session.mode === "payment") return "lifetime";
  const interval = session.line_items?.data[0]?.price?.recurring?.interval;
  return interval === "year" ? "annual" : "monthly";
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

        const planName = derivePlanName(session);

        const { data: memberData, error: upsertError } = await db
          .from("members")
          .upsert(
            {
              email,
              name: session.customer_details?.name ?? null,
              stripe_customer_id: customerId(session.customer),
              stripe_subscription_id: subscriptionId(session.subscription),
              membership_tier: deriveTier(session),
              plan_name: planName,
              amount_pence: session.amount_total ?? 0,
              status: "active",
            },
            { onConflict: "email" }
          )
          .select("id")
          .single();

        if (upsertError) {
          console.error("[stripe-webhook] Supabase upsert error:", upsertError.message);
          break;
        }

        console.log(`[stripe-webhook] Member upserted: ${email} plan=${planName}`);

        // Insert payment record
        const paymentIntentId =
          typeof session.payment_intent === "string" ? session.payment_intent : null;

        const { error: paymentError } = await db.from("payments").insert({
          member_id: memberData.id,
          stripe_payment_intent_id: paymentIntentId,
          amount_pence: session.amount_total ?? 0,
          plan_name: planName,
          paid_at: new Date().toISOString(),
          status: "completed",
        });

        if (paymentError) {
          console.error("[stripe-webhook] Payment insert error:", paymentError.message);
        }

        break;
      }

      // ── customer.subscription.deleted ───────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const cid = customerId(sub.customer);

        const { error } = await db
          .from("members")
          .update({ status: "cancelled" })
          .eq("stripe_customer_id", cid);

        if (error) {
          console.error(
            "[stripe-webhook] Supabase update error (subscription.deleted):",
            error.message
          );
        } else {
          console.log(`[stripe-webhook] Member cancelled: customer ${cid}`);
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

        const { error } = await db
          .from("members")
          .update({ status: "payment_failed" })
          .eq("stripe_customer_id", cid);

        if (error) {
          console.error(
            "[stripe-webhook] Supabase update error (payment_failed):",
            error.message
          );
        } else {
          console.log(`[stripe-webhook] Member payment_failed: customer ${cid}`);
        }
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
