import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Welcome to CSL - Celtic Supporters Limited",
};

export default async function MembershipSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  let email: string | null = null;

  if (searchParams.session_id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(
        searchParams.session_id
      );
      email = session.customer_details?.email ?? null;
    } catch {
      // Non-fatal — signup link still works, email just won't be pre-filled.
    }
  }

  // Returning-member branch. A members row with a user_id already set means
  // an auth.users account exists from a previous signup — user_id is never
  // cleared on cancellation and is never touched by the checkout webhook's
  // upsert, so this is safe to check regardless of whether the webhook for
  // THIS checkout has processed yet (no race with a brand-new member either:
  // their members row won't exist yet, so this simply falls through below).
  if (email) {
    const { data: existingMember } = await getSupabase()
      .from("members")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();

    if (existingMember?.user_id) {
      // /membership-ended deliberately keeps the session alive so a member
      // clicking Rejoin returns from Stripe still signed in — that makes
      // this the primary rejoin path, not an edge case.
      const { data: { user } } = await createServerSupabase().auth.getUser();
      if (user?.email === email) {
        redirect("/member-portal?welcome_back=true");
      }
      redirect("/login?notice=welcome-back");
    }
  }

  const signupHref = email
    ? `/signup?email=${encodeURIComponent(email)}`
    : "/signup";

  return (
    <section className="bg-csl-light min-h-[60vh] flex items-center justify-center px-[5%] py-[72px]">
      <div className="text-center max-w-[520px]">
        <div className="text-5xl mb-5">&#127881;</div>
        <h1 className="text-[2rem] font-extrabold text-csl-dark mb-3">
          Welcome to CSL!
        </h1>
        <p className="text-gray-600 leading-[1.7] mb-8">
          Your membership is now active. Set up a password to access your
          member portal, where you can view recordings, track your membership,
          and manage your account.
        </p>
        <Link
          href={signupHref}
          className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200"
        >
          Set up your account &rarr;
        </Link>
        <p className="mt-4 text-sm text-gray-400">
          Already have an account?{" "}
          <Link href="/login" className="text-csl-dark hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </section>
  );
}
