"use client";

// Handles password reset links sent via Resend. Tokens are passed as query
// parameters (not hash fragment) so they survive email link-scanning proxies
// such as Microsoft SafeLinks which strip hash fragments.
import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export default function AuthResetPage() {
  useEffect(() => {
    async function handleReset() {
      const params = new URLSearchParams(window.location.search);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (!accessToken || !refreshToken) {
        console.error("[auth/reset] missing tokens in query params");
        window.location.href = "/login?error=auth_failed";
        return;
      }

      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error("[auth/reset] setSession error:", error.message);
        window.location.href = "/login?error=auth_failed";
        return;
      }

      sessionStorage.setItem("csl-auth-alive", "1");
      window.location.href = "/auth/update-password";
    }

    handleReset();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-csl-light">
      <p className="text-gray-400 text-sm">Verifying your reset link&hellip;</p>
    </div>
  );
}
