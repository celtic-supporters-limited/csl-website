"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

type View = "password" | "forgot" | "magic" | "reset-sent" | "magic-sent";

const inputCls =
  "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-csl-dark focus:border-transparent disabled:opacity-60";
const btnPrimary =
  "w-full bg-csl-dark text-white font-semibold rounded-lg py-3 text-[0.95rem] hover:bg-csl-mid transition-colors disabled:opacity-60";
const cardCls = "bg-white rounded-xl border border-gray-200 shadow-sm p-8";
const linkCls = "text-sm text-csl-dark hover:underline";
const dimLinkCls = "text-sm text-gray-400 hover:text-gray-600 hover:underline";

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
      {msg}
    </p>
  );
}

export default function LoginForm({ redirectTo, reason }: { redirectTo?: string; reason?: string }) {
  const [view, setView] = useState<View>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function switchTo(next: View) {
    setLoading(false);
    setErrorMsg("");
    setView(next);
  }

  // ── Password sign-in ───────────────────────────────────────────────────────
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { error } = await createBrowserSupabase().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setLoading(false);
      // Do not distinguish "wrong password" from "email not found" — security best practice
      setErrorMsg("Incorrect email or password. Please try again.");
      return;
    }

    sessionStorage.setItem("csl-auth-alive", "1");
    window.location.href = redirectTo ?? "/member-portal";
  }

  // ── Forgot password ────────────────────────────────────────────────────────
  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    // Always returns 200 from the API — do not surface whether the email exists
    await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    setLoading(false);
    setView("reset-sent");
  }

  // ── Magic link ─────────────────────────────────────────────────────────────
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (redirectTo) callbackUrl.searchParams.set("redirectTo", redirectTo);

    const { error } = await createBrowserSupabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: callbackUrl.toString() },
    });

    if (error) {
      setLoading(false);
      setErrorMsg(error.message);
      return;
    }

    setLoading(false);
    setView("magic-sent");
  }

  // ── Confirmation: reset link sent ──────────────────────────────────────────
  if (view === "reset-sent") {
    return (
      <div className={`${cardCls} text-center`}>
        <div className="text-4xl mb-4">&#128233;</div>
        <h2 className="font-bold text-xl text-gray-900 mb-2">Check your inbox</h2>
        <p className="text-gray-500 text-sm leading-relaxed">
          If <strong className="text-gray-700">{email.trim()}</strong> is
          registered, you will receive a password reset link shortly.
        </p>
        <p className="text-gray-400 text-xs mt-3">
          Check your spam folder if it does not arrive within a few minutes.
        </p>
        <button onClick={() => switchTo("password")} className={`mt-5 ${linkCls}`}>
          Back to sign in
        </button>
      </div>
    );
  }

  // ── Confirmation: magic link sent ──────────────────────────────────────────
  if (view === "magic-sent") {
    return (
      <div className={`${cardCls} text-center`}>
        <div className="text-4xl mb-4">&#128231;</div>
        <h2 className="font-bold text-xl text-gray-900 mb-2">Check your email</h2>
        <p className="text-gray-500 text-sm leading-relaxed">
          We sent a sign-in link to{" "}
          <strong className="text-gray-700">{email.trim()}</strong>. Click the
          link to access your member portal.
        </p>
        <p className="text-gray-400 text-xs mt-3">
          Check your spam folder if it does not arrive within a few minutes.
        </p>
        <button onClick={() => switchTo("password")} className={`mt-5 ${linkCls}`}>
          Back to sign in
        </button>
      </div>
    );
  }

  // ── Forgot password form ───────────────────────────────────────────────────
  if (view === "forgot") {
    return (
      <form onSubmit={handleForgot} className={cardCls}>
        <h2 className="font-bold text-gray-900 mb-1">Reset your password</h2>
        <p className="text-sm text-gray-400 mb-5">
          Enter your email and we will send you a reset link.
        </p>

        <div className="mb-5">
          <label
            htmlFor="forgot-email"
            className="block text-sm font-semibold text-gray-700 mb-1.5"
          >
            Email address
          </label>
          <input
            id="forgot-email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className={inputCls}
            placeholder="you@example.com"
          />
        </div>

        {errorMsg && <ErrorBanner msg={errorMsg} />}

        <button type="submit" disabled={loading} className={btnPrimary}>
          {loading ? "Sending..." : "Send reset link"}
        </button>

        <div className="mt-4 text-center">
          <button type="button" onClick={() => switchTo("password")} className={linkCls}>
            Back to sign in
          </button>
        </div>
      </form>
    );
  }

  // ── Magic link form ────────────────────────────────────────────────────────
  if (view === "magic") {
    return (
      <form onSubmit={handleMagicLink} className={cardCls}>
        <h2 className="font-bold text-gray-900 mb-1">Send a sign-in link</h2>
        <p className="text-sm text-gray-400 mb-5">
          We will email you a one-click link to sign in.
        </p>

        <div className="mb-5">
          <label
            htmlFor="magic-email"
            className="block text-sm font-semibold text-gray-700 mb-1.5"
          >
            Email address
          </label>
          <input
            id="magic-email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className={inputCls}
            placeholder="you@example.com"
          />
        </div>

        {errorMsg && <ErrorBanner msg={errorMsg} />}

        <button type="submit" disabled={loading} className={btnPrimary}>
          {loading ? "Sending..." : "Send sign-in link"}
        </button>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => switchTo("password")}
            className={linkCls}
          >
            Sign in with password instead
          </button>
        </div>
      </form>
    );
  }

  // ── Default: password form ─────────────────────────────────────────────────
  return (
    <>
      {reason === "timeout" && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Your session expired due to inactivity. Please sign in again.
        </div>
      )}
    <form onSubmit={handleSignIn} className={cardCls}>
      <div className="mb-4">
        <label
          htmlFor="email"
          className="block text-sm font-semibold text-gray-700 mb-1.5"
        >
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          className={inputCls}
          placeholder="you@example.com"
        />
      </div>

      <div className="mb-5">
        <label
          htmlFor="password"
          className="block text-sm font-semibold text-gray-700 mb-1.5"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          className={inputCls}
        />
      </div>

      {errorMsg && <ErrorBanner msg={errorMsg} />}

      <button type="submit" disabled={loading} className={btnPrimary}>
        {loading ? "Signing in..." : "Sign in"}
      </button>

      <div className="mt-5 flex flex-col items-center gap-2.5">
        <button
          type="button"
          onClick={() => switchTo("forgot")}
          className={linkCls}
        >
          Forgot your password?
        </button>
        <button
          type="button"
          onClick={() => switchTo("magic")}
          className={dimLinkCls}
        >
          Send me a login link instead
        </button>
      </div>
    </form>
    </>
  );
}
