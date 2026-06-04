"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export default function SignupForm({ email: initialEmail }: { email?: string }) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (!firstName.trim()) {
      setErrorMsg("First name is required.");
      return;
    }
    if (!lastName.trim()) {
      setErrorMsg("Last name is required.");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await createBrowserSupabase().auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setLoading(false);
      setErrorMsg(error.message);
      return;
    }

    // Save name to the members row created by the Stripe webhook.
    // Non-fatal: if the fetch fails the user can update via Edit Profile.
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          name: `${firstName.trim()} ${lastName.trim()}`,
        }),
      });
    } catch {
      // swallow — don't block the user from accessing their portal
    }

    sessionStorage.setItem("csl-auth-alive", "1");
    // window.location.href ensures the browser sends the new session cookie
    // with the request so middleware sees the session immediately.
    // router.push races the cookie and causes a redirect back to /login.
    window.location.href = "/member-portal";
  }

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-csl-dark focus:border-transparent disabled:opacity-60";

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-8"
    >
      <div className="mb-4">
        <label
          htmlFor="signup-email"
          className="block text-sm font-semibold text-gray-700 mb-1.5"
        >
          Email address
        </label>
        <input
          id="signup-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading || !!initialEmail}
          className={inputCls}
          placeholder="you@example.com"
        />
        {initialEmail && (
          <p className="text-xs text-gray-400 mt-1">Linked to your Stripe payment.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label
            htmlFor="signup-first-name"
            className="block text-sm font-semibold text-gray-700 mb-1.5"
          >
            First name
          </label>
          <input
            id="signup-first-name"
            type="text"
            required
            autoComplete="given-name"
            autoFocus
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={loading}
            className={inputCls}
            placeholder="Gary"
          />
        </div>
        <div>
          <label
            htmlFor="signup-last-name"
            className="block text-sm font-semibold text-gray-700 mb-1.5"
          >
            Last name
          </label>
          <input
            id="signup-last-name"
            type="text"
            required
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={loading}
            className={inputCls}
            placeholder="Phinn"
          />
        </div>
      </div>

      <div className="mb-4">
        <label
          htmlFor="signup-password"
          className="block text-sm font-semibold text-gray-700 mb-1.5"
        >
          Password
        </label>
        <input
          id="signup-password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          className={inputCls}
        />
        <p className="text-xs text-gray-400 mt-1">Minimum 8 characters.</p>
      </div>

      <div className="mb-5">
        <label
          htmlFor="signup-confirm"
          className="block text-sm font-semibold text-gray-700 mb-1.5"
        >
          Confirm password
        </label>
        <input
          id="signup-confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={loading}
          className={inputCls}
        />
      </div>

      {errorMsg && (
        <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-csl-dark text-white font-semibold rounded-lg py-3 text-[0.95rem] hover:bg-csl-mid transition-colors disabled:opacity-60"
      >
        {loading ? "Activating account..." : "Activate account"}
      </button>

      <p className="mt-4 text-xs text-gray-400 text-center">
        Already have an account?{" "}
        <a href="/login" className="text-csl-dark hover:underline font-medium">
          Sign in
        </a>
      </p>
    </form>
  );
}
