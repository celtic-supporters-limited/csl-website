import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import PortalClient from "./PortalClient";

export const dynamic = "force-dynamic";
import type {
  Member,
  PortalCase,
  PortalPayment,
  StripeSubData,
  GovernanceCriterion,
} from "./PortalClient";
import type { MemberDocument } from "@/components/DocumentCard";

export const metadata: Metadata = {
  title: "Member Portal | Celtic Supporters Limited",
  description: "Your CSL member dashboard - subscription, recordings, and enquiries.",
};

export default async function MemberPortalPage({
  searchParams,
}: {
  searchParams: { tab?: string; email_updated?: string };
}) {
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
  let cases: PortalCase[] = [];
  let payments: PortalPayment[] = [];
  let documents: MemberDocument[] = [];
  let governanceCriteria: GovernanceCriterion[] = [];
  let stripeSub: StripeSubData | null = null;
  let activeCount = 0;
  let agmDate: string | null = null;
  let sharesRepresented = "15000";
  let proxyCount = 0;

  try {
    const db = getSupabase();

    // Member lookup: try user_id first, fall back to email for unmigrated rows
    const primaryMemberRes = await db
      .from("members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    let memberRes = primaryMemberRes;
    if (!memberRes.data && !memberRes.error) {
      console.warn(
        `[member-portal] No member for user_id=${user.id}, falling back to email lookup`
      );
      memberRes = await db
        .from("members")
        .select("*")
        .eq("email", user.email)
        .maybeSingle();
    }

    // Batch 1 — cases, documents, governance, active count, site config, proxy count (parallel)
    const [casesRes, documentsRes, governanceRes, activeCountRes, siteConfigRes, proxyCountRes] = await Promise.all([
      db
        .from("shareholder_cases")
        .select("id, contact_name, email, case_type, status, created_at")
        .eq("email", user.email)
        .order("created_at", { ascending: false }),
      db
        .from("documents")
        .select("id, title, description, category, drive_url, file_type, published_at")
        .eq("members_only", true)
        .order("created_at", { ascending: false }),
      db
        .from("governance_criteria")
        .select("id, tier, demand, status, commentary, last_reviewed")
        .order("id", { ascending: true }),
      db
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      db
        .from("site_config")
        .select("key, value")
        .in("key", ["agm_date", "shares_represented", "active_members"]),
      db
        .from("shareholder_cases")
        .select("*", { count: "exact", head: true })
        .eq("case_type", "Proxy Assignment"),
    ]);

    member = memberRes.data ?? null;
    cases = casesRes.data ?? [];
    documents = (documentsRes.data ?? []) as MemberDocument[];
    governanceCriteria = (governanceRes.data ?? []) as GovernanceCriterion[];
    const configRows = (siteConfigRes.data ?? []) as { key: string; value: string | null }[];
    agmDate = configRows.find((r) => r.key === "agm_date")?.value ?? null;
    sharesRepresented = configRows.find((r) => r.key === "shares_represented")?.value ?? "15000";

    const activeMembersConfig = configRows.find((r) => r.key === "active_members")?.value;
    activeCount = activeMembersConfig
      ? parseInt(activeMembersConfig, 10)
      : (activeCountRes.count ?? 0);
    proxyCount = proxyCountRes.count ?? 0;

    // Batch 2 — requires stripe_customer_id and stripe_subscription_id from batch 1
    if (member) {
      const [chargesResult, subResult] = await Promise.all([
        member.stripe_customer_id
          ? getStripe()
              .charges.list({ customer: member.stripe_customer_id, limit: 24 })
              .then((list) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (list.data as any[]).map((charge) => {
                  const desc = charge.description as string | null;
                  const isGeneric =
                    !desc ||
                    desc.toLowerCase().includes("subscription creation") ||
                    desc.toLowerCase().includes("invoice");
                  const planName = isGeneric
                    ? (charge.metadata?.plan_name as string | undefined) ??
                      member!.plan_name ??
                      "Membership"
                    : desc;
                  return {
                  id: charge.id as string,
                  stripe_payment_intent_id: charge.id as string,
                  amount_pence: charge.amount as number,
                  plan_name: planName,
                  paid_at: new Date(
                    (charge.created as number) * 1000
                  ).toISOString(),
                  status:
                    charge.status === "succeeded" ? "completed" : (charge.status as string),
                  };
                })
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
      cases={cases}
      payments={payments}
      documents={documents}
      governanceCriteria={governanceCriteria}
      stripeSub={stripeSub}
      activeCount={activeCount}
      agmDate={agmDate}
      sharesRepresented={sharesRepresented}
      proxyCount={proxyCount}
      initialTab={searchParams.tab}
      emailUpdated={searchParams.email_updated === "true"}
    />
  );
}
