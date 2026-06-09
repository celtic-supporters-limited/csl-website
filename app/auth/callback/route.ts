import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawRedirect = searchParams.get("redirectTo") ?? "";
  const redirectTo =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/member-portal";

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user?.email) {
      const newEmail = data.user.email;

      // Detect email change: look for a members row where pending_email matches the
      // confirmed email. This is set by the portal when updateUser({ email }) is called.
      try {
        const db = getSupabase();
        const { data: memberRow, error: lookupErr } = await db
          .from("members")
          .select("id, stripe_customer_id")
          .eq("pending_email", newEmail)
          .maybeSingle();

        if (lookupErr) {
          console.error("[auth/callback] pending_email lookup error:", lookupErr.message);
        } else if (memberRow) {
          // This is an email change confirmation — update members and Stripe.
          const { error: updateErr } = await db
            .from("members")
            .update({ email: newEmail, pending_email: null })
            .eq("id", memberRow.id);

          if (updateErr) {
            console.error("[auth/callback] members email update error:", updateErr.message);
          }

          if (memberRow.stripe_customer_id) {
            try {
              await getStripe().customers.update(memberRow.stripe_customer_id, {
                email: newEmail,
              });
            } catch (stripeErr) {
              // Log prominently — members table and Stripe are now out of sync.
              // The members.email has been updated but Stripe still has the old email.
              // Manual fix required: update customer email in Stripe Dashboard.
              console.error(
                `[auth/callback] STRIPE EMAIL SYNC FAILURE — customer ${memberRow.stripe_customer_id} ` +
                  `email not updated to ${newEmail}. Manual fix required.`,
                stripeErr
              );
            }
          }

          // Redirect through session-init so csl-auth-alive is set, then to Edit Profile
          const portalNext = "/member-portal?tab=profile&email_updated=true";
          const initUrl = `${origin}/auth/session-init?next=${encodeURIComponent(portalNext)}`;
          return NextResponse.redirect(initUrl);
        }
      } catch (dbErr) {
        console.error("[auth/callback] email change handling error:", dbErr);
      }

      // Standard flow: magic link login or password reset
      const initUrl = `${origin}/auth/session-init?next=${encodeURIComponent(redirectTo)}`;
      return NextResponse.redirect(initUrl);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
