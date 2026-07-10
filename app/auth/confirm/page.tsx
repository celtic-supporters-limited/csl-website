"use client";

// Intermediate page for password reset and magic link flows.
// Exists purely to defeat Microsoft SafeLinks pre-fetch: SafeLinks GETs the
// link URL to scan for malware, consuming one-time tokens. By landing on a
// static page with a button, there is nothing for SafeLinks to consume —
// the token is only redeemed when the real user clicks.
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ConfirmInner() {
  const params = useSearchParams();
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as "recovery" | "magiclink" | null;
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!tokenHash || !type) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <p className="text-red-600 text-sm">This link is invalid or has expired.</p>
        <a href="/login" className="mt-4 inline-block text-sm text-csl-dark hover:underline">
          Back to sign in
        </a>
      </div>
    );
  }

  async function handleContinue() {
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, type }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setErrorMsg(body.message ?? "This link has expired or already been used.");
        setLoading(false);
        return;
      }

      sessionStorage.setItem("csl-auth-alive", "1");

      if (type === "recovery") {
        window.location.href = "/auth/update-password";
      } else {
        window.location.href = "/member-portal";
      }
    } catch {
      setErrorMsg("Something went wrong. Please try again or request a new link.");
      setLoading(false);
    }
  }

  const isReset = type === "recovery";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
      <div className="text-4xl mb-4">{isReset ? "🔑" : "📨"}</div>
      <h2 className="font-bold text-xl text-gray-900 mb-2">
        {isReset ? "Reset your password" : "Sign in to CSL"}
      </h2>
      <p className="text-gray-500 text-sm mb-6">
        {isReset
          ? "Click the button below to continue to the password reset form."
          : "Click the button below to sign in to your member portal."}
      </p>

      {errorMsg && (
        <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
          {errorMsg}{" "}
          <a href={isReset ? "/login#forgot" : "/login"} className="underline">
            Request a new link.
          </a>
        </p>
      )}

      <button
        onClick={handleContinue}
        disabled={loading}
        className="w-full bg-csl-dark text-white font-semibold rounded-lg py-3 text-[0.95rem] hover:bg-csl-mid transition-colors disabled:opacity-60"
      >
        {loading ? "Verifying your link…" : isReset ? "Continue to password reset" : "Continue to your account"}
      </button>

      <div className="mt-4">
        <a href="/login" className="text-sm text-gray-400 hover:text-gray-600 hover:underline">
          Back to sign in
        </a>
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <main className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-csl-light py-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-5xl">&#9752;</span>
          <h1 className="text-2xl font-extrabold text-csl-dark mt-3 mb-1">
            Celtic Supporters Limited
          </h1>
        </div>
        <Suspense fallback={<div className="text-center text-gray-400 text-sm py-12">Loading&hellip;</div>}>
          <ConfirmInner />
        </Suspense>
      </div>
    </main>
  );
}
