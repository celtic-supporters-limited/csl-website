import type { Metadata } from "next";
import UpdatePasswordForm from "./UpdatePasswordForm";

export const metadata: Metadata = {
  title: "Set New Password | Celtic Supporters Limited",
};

export default function UpdatePasswordPage() {
  return (
    <main className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-csl-light py-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-5xl">&#9752;</span>
          <h1 className="text-2xl font-extrabold text-csl-dark mt-3 mb-1">
            Set New Password
          </h1>
          <p className="text-gray-500 text-sm">
            Choose a new password for your CSL account.
          </p>
        </div>
        <UpdatePasswordForm />
      </div>
    </main>
  );
}
