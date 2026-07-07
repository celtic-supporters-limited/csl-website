"use client";

import { useEffect } from "react";

// When Supabase ignores the redirectTo in admin.generateLink (e.g. the URL is
// not in the allowed redirect list), it falls back to the Site URL (root page)
// with the auth tokens in the # hash fragment. This interceptor catches that
// and forwards the hash to /auth/callback which already handles both implicit
// flow (hash tokens) and PKCE flow (code param).
//
// Runs on every page in the root layout so it catches whichever page Supabase
// sends the user to. Skips /auth/callback (already handled there) to prevent loops.
export default function AuthHashInterceptor() {
  useEffect(() => {
    const hash = window.location.hash;
    if (
      hash &&
      hash.includes("access_token=") &&
      !window.location.pathname.startsWith("/auth/callback")
    ) {
      window.location.replace("/auth/callback" + hash);
    }
  }, []);

  return null;
}
