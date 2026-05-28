import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Member Login | Celtic Supporters Limited",
  description: "Sign in to the CSL member portal with a secure magic-link email.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string; error?: string };
}) {
  return (
    <main className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-csl-light py-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-5xl">&#9752;</span>
          <h1 className="text-2xl font-extrabold text-csl-dark mt-3 mb-1">
            Member Login
          </h1>
          <p className="text-gray-500 text-sm">
            Enter your email address and we will send you a secure sign-in link.
          </p>
        </div>

        {searchParams.error === "auth_failed" && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            That sign-in link has expired or is invalid. Please request a new one.
          </div>
        )}

        <LoginForm redirectTo={searchParams.redirectTo} />

        <p className="mt-6 text-center text-xs text-gray-400">
          Only active CSL members can sign in.{" "}
          <a href="/membership" className="text-csl-dark hover:underline font-medium">
            Join CSL
          </a>{" "}
          to become a member.
        </p>
      </div>
    </main>
  );
}
