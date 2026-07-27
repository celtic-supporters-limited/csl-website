"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export default function SignOutButton({ className }: { className?: string }) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await createBrowserSupabase().auth.signOut();
    sessionStorage.clear();
    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={signingOut}
      className={className ?? "text-sm text-csl-dark hover:underline font-medium disabled:opacity-60"}
    >
      {signingOut ? "Signing out..." : "Sign out"}
    </button>
  );
}
