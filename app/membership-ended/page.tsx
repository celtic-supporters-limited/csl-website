import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import SignOutButton from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Membership ended | Celtic Supporters Limited",
  description: "Your CSL membership has ended.",
};

export default async function MembershipEndedPage() {
  const authClient = createServerSupabase();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  let firstName: string | null = null;

  if (user) {
    const db = getSupabase();
    let { data: member } = await db
      .from("members")
      .select("first_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member && user.email) {
      ({ data: member } = await db
        .from("members")
        .select("first_name")
        .eq("email", user.email)
        .maybeSingle());
    }

    firstName = member?.first_name ?? null;
  }

  const greeting = firstName ? `Hi ${firstName},` : "Hello,";

  return (
    <main className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-csl-light py-24 px-4">
      <Container>
        <div className="max-w-lg mx-auto text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-csl-dark mb-6">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Your membership has ended
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            {greeting} your Celtic Supporters Limited membership is no longer active. Your access to the member portal has ended, but you are welcome to rejoin at any time.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="/membership"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-sm font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors min-h-[44px]"
            >
              Rejoin CSL
            </a>
            {user && <SignOutButton />}
          </div>

          <p className="mt-8 text-xs text-gray-400">
            If you believe this is a mistake, contact us at{" "}
            <a
              href="mailto:info@celticsupporters.net"
              className="text-csl-dark hover:underline"
            >
              info@celticsupporters.net
            </a>
          </p>
        </div>
      </Container>
    </main>
  );
}
