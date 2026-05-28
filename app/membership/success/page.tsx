import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Welcome to CSL - Celtic Supporters Limited",
};

export default function MembershipSuccessPage() {
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
          href="/signup"
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
