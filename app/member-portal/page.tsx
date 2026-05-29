import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import PortalClient from "./PortalClient";
import type {
  Member,
  PortalEvent,
  PortalCase,
  PortalPayment,
  StripeSubData,
} from "./PortalClient";

export const metadata: Metadata = {
  title: "Member Portal | Celtic Supporters Limited",
  description: "Your CSL member dashboard - subscription, recordings, and enquiries.",
};

export default async function MemberPortalPage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return (
      <main className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-csl-light px-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 max-w-md text-center">
          <div className="text-4xl mb-4">&#9888;&#65039;</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Supabase not configured
          </h1>
          <p className="text-gray-500 text-sm">
            Set{" "}
            <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            and{" "}
            <code className="bg-gray-100 px-1 rounded">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            in your environment to enable the member portal.
          </p>
        </div>
      </main>
    );
  }

  const authClient = createServerSupabase();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user?.email) {
    redirect("/login?redirectTo=/member-portal");
  }

  let member: Member | null = null;
  let events: PortalEvent[] = [];
  let cases: PortalCase[] = [];
  let payments: PortalPayment[] = [];
  let stripeSub: StripeSubData | null = null;

  try {
    const db = getSupabase();

    // Batch 1 — member record, events, cases (parallel, independent)
    const [memberRes, eventsRes, casesRes] = await Promise.all([
      db.from("members").select("*").eq("email", user.email).maybeSingle(),
      db
        .from("events")
        .select("id, title, event_date, recording_url, slides_url, members_only")
        .order("event_date", { ascending: false }),
      db
        .from("shareholder_cases")
        .select("id, contact_name, email, case_type, status, created_at")
        .eq("email", user.email)
        .order("created_at", { ascending: false }),
    ]);

    member = memberRes.data ?? null;
    events = eventsRes.data ?? [];
    cases = casesRes.data ?? [];

    // Batch 2 — requires stripe_customer_id and stripe_subscription_id from batch 1
    if (member) {
      const [chargesResult, subResult] = await Promise.all([
        member.stripe_customer_id
          ? getStripe()
              .charges.list({ customer: member.stripe_customer_id, limit: 24 })
              .then((list) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (list.data as any[]).map((charge) => ({
                  id: charge.id as string,
                  stripe_payment_intent_id: charge.id as string,
                  amount_pence: charge.amount as number,
                  plan_name:
                    (charge.description as string | null) ||
                    (charge.metadata?.plan_name as string | undefined) ||
                    "Membership",
                  paid_at: new Date(
                    (charge.created as number) * 1000
                  ).toISOString(),
                  status:
                    charge.status === "succeeded" ? "completed" : (charge.status as string),
                }))
              )
              .catch((err) => {
                console.error("[member-portal] Stripe charges fetch error:", err);
                return [];
              })
          : Promise.resolve([]),

        member.stripe_subscription_id
          ? getStripe()
              .subscriptions.retrieve(member.stripe_subscription_id, {
                expand: ["default_payment_method"],
              })
              .then((sub): StripeSubData => {
                // The Stripe SDK v22 with the dahlia API version wraps responses
                // in Response<T> and has restructured some subscription fields.
                // Using any here preserves runtime correctness while avoiding
                // SDK type-version drift. The return type is still strict.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const s = sub as any;
                const card = s.default_payment_method?.card ?? null;
                // In the dahlia API the period dates moved from the subscription
                // root to the item's `period` object. Try both locations.
                const item = s.items?.data?.[0];
                // In the dahlia API current_period_end moved from the
                // subscription root to the item level.
                const periodEnd: number | null =
                  item?.current_period_end ?? s.current_period_end ?? null;
                if (!periodEnd) {
                  console.warn(
                    "[member-portal] current_period_end not found.",
                    "item.current_period_end:", item?.current_period_end,
                    "sub.current_period_end:", s.current_period_end
                  );
                }
                return {
                  status: s.status,
                  current_period_end: periodEnd,
                  cancel_at_period_end: s.cancel_at_period_end ?? false,
                  next_amount_pence: item?.price?.unit_amount ?? null,
                  card_brand: card?.brand ?? null,
                  card_last4: card?.last4 ?? null,
                  card_exp_month: card?.exp_month ?? null,
                  card_exp_year: card?.exp_year ?? null,
                };
              })
              .catch((err) => {
                console.error(
                  "[member-portal] Stripe subscription fetch error:",
                  err
                );
                return null;
              })
          : Promise.resolve(null),
      ]);

      payments = chargesResult;
      stripeSub = subResult;
    }
  } catch {
    // Service role env var missing or Supabase unreachable — render with null data
  }

  return (
    <PortalClient
      user={{ email: user.email, id: user.id }}
      member={member}
      events={events}
      cases={cases}
      payments={payments}
      stripeSub={stripeSub}
    />
  );
}
