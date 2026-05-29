import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const authClient = createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: member } = await getSupabase()
    .from("members")
    .select("stripe_customer_id")
    .eq("email", user.email)
    .maybeSingle();

  if (!member?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No Stripe customer record found for this account." },
      { status: 404 }
    );
  }

  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  try {
    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: member.stripe_customer_id,
      return_url: `${origin}/member-portal`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("[billing-portal] Stripe error:", err);
    return NextResponse.json(
      { error: "Failed to open billing portal. Please try again." },
      { status: 500 }
    );
  }
}
