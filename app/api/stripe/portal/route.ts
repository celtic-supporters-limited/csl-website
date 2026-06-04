import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const authClient = createServerSupabase();
  const { data: { user }, error: authError } = await authClient.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: member } = await getSupabase()
    .from("members")
    .select("stripe_customer_id, membership_tier")
    .eq("email", user.email)
    .maybeSingle();

  if (!member?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No Stripe customer record found for this account." },
      { status: 404 }
    );
  }

  if (member.membership_tier === "lifetime") {
    return NextResponse.json(
      { error: "Lifetime members do not have a subscription to manage." },
      { status: 400 }
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    req.headers.get("origin") ||
    "http://localhost:3000";

  try {
    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: member.stripe_customer_id,
      return_url: `${siteUrl}/member-portal/subscription`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("[stripe/portal] Stripe error:", err);
    return NextResponse.json(
      { error: "Failed to open subscription portal. Please try again." },
      { status: 500 }
    );
  }
}
