import type { Metadata } from "next";
import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Activate Your Account | Celtic Supporters Limited",
  description:
    "Create a password to activate your CSL member account after joining.",
};

export default function SignupPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  return (
    <main className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-csl-light py-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-5xl">&#9752;</span>
          <h1 className="text-2xl font-extrabold text-csl-dark mt-3 mb-1">
            Activate Your Account
          </h1>
          <p className="text-gray-500 text-sm">
            Create a password to access your member portal.
          </p>
        </div>
        <SignupForm email={searchParams.email} />
      </div>
    </main>
  );
}
