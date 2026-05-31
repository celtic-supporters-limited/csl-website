"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";

const inputCls =
  "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-csl-dark focus:border-transparent disabled:opacity-60";

export default function UpdatePasswordForm() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  useEffect(() => {
    // Confirm there is an active session (set by /auth/callback after the reset link).
    // If not, the link has expired — send back to login.
    createBrowserSupabase()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (!session) {
          router.replace("/login?error=auth_failed");
        } else {
          setReady(true);
        }
      });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await createBrowserSupabase().auth.updateUser({ password });

    if (error) {
      setLoading(false);
      setErrorMsg(error.message);
      return;
    }

    sessionStorage.setItem("csl-auth-alive", "1");
    window.location.href = "/member-portal";
  }

  if (!ready) {
    return (
      <div className="text-center text-gray-400 text-sm py-12">
        Verifying your reset link...
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-8"
    >
      <div className="mb-4">
        <label
          htmlFor="new-password"
          className="block text-sm font-semibold text-gray-700 mb-1.5"
        >
          New password
        </label>
        <input
          id="new-password"
          type="password"
          required
          autoFocus
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
          htmlFor="confirm-password"
          className="block text-sm font-semibold text-gray-700 mb-1.5"
        >
          Confirm new password
        </label>
        <input
          id="confirm-password"
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
        {loading ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}
