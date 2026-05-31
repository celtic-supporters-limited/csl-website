"use client";

// Intermediate page between the server-side auth callback and the member portal.
// The auth callback (route handler) exchanges the PKCE code for a session and
// sets auth cookies, but runs on the server — it cannot write to sessionStorage.
// This page runs in the browser, sets the liveness flag that PortalClient checks,
// then forwards the user to their intended destination.

import { useEffect } from "react";

export default function SessionInitPage() {
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("next") ?? "";
    const next =
      raw.startsWith("/") && !raw.startsWith("//") ? raw : "/member-portal";
    sessionStorage.setItem("csl-auth-alive", "1");
    window.location.href = next;
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-csl-light">
      <p className="text-gray-400 text-sm">Signing you in...</p>
    </div>
  );
}
