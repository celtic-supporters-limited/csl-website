"use client";

// Handles all Supabase PKCE auth callbacks (magic link, password reset,
// email change) in the browser. The code exchange runs client-side so the
// browser Supabase client can read the PKCE code verifier from its own
// storage — eliminating the server/browser storage mismatch that caused
// auth_failed when the exchange ran in a Route Handler.
import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const type = params.get("type");
      const rawRedirect = params.get("redirectTo") ?? "";
      const redirectTo =
        rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
          ? rawRedirect
          : "/member-portal";

      if (!code) {
        window.location.href = "/login?error=auth_failed";
        return;
      }

      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("[auth/callback] exchangeCodeForSession error:", error.message);
        window.location.href = "/login?error=auth_failed";
        return;
      }

      // ── Email change ─────────────────────────────────────────────────────────
      if (type === "email_change" && data.user?.email) {
        // Sync new email into members, Stripe, and shareholder_cases server-side.
        // Fire-and-forget — a failed sync never blocks the user.
        fetch("/api/auth/email-change-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newEmail: data.user.email }),
        }).catch((err) =>
          console.error("[auth/callback] email-change-confirm error:", err)
        );

        sessionStorage.setItem("csl-auth-alive", "1");
        window.location.href = "/member-portal?tab=profile&email_updated=true";
        return;
      }

      // ── Standard flow: magic link or password reset ──────────────────────────
      // Detect recovery sessions via AMR claim and route to update-password.
      let finalRedirect = redirectTo;
      if (redirectTo === "/member-portal") {
        const amr: { method: string; timestamp: number }[] =
          (data.session?.user as unknown as {
            amr?: { method: string; timestamp: number }[];
          })?.amr ?? [];
        if (amr.some((a) => a.method === "recovery")) {
          finalRedirect = "/auth/update-password";
        }
      }

      sessionStorage.setItem("csl-auth-alive", "1");
      window.location.href = finalRedirect;
    }

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-csl-light">
      <p className="text-gray-400 text-sm">Signing you in&hellip;</p>
    </div>
  );
}
