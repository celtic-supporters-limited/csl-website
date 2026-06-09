import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
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

    if (!error) {
      // ── Email change confirmation ───────────────────────────────────────────
      if (type === "email_change" && data.user?.email) {
        const newEmail = data.user.email;

        try {
          const db = getSupabase();

          // Find the member row that was tagged with this pending email when
          // the change was initiated from the Edit Profile tab.
          const { data: memberRow, error: lookupErr } = await db
            .from("members")
            .select("id, email, stripe_customer_id")
            .eq("pending_email", newEmail)
            .maybeSingle();

          if (lookupErr) {
            console.error(
              "[auth/callback] email_change pending_email lookup error:",
              lookupErr.message
            );
          } else if (memberRow) {
            const previousEmail = memberRow.email;

            // Update members.email and clear pending_email
            const { error: updateErr } = await db
              .from("members")
              .update({ email: newEmail, pending_email: null })
              .eq("id", memberRow.id);

            if (updateErr) {
              console.error(
                "[auth/callback] email_change members update error:",
                updateErr.message
              );
            } else {
              console.log(
                `[auth/callback] email_change: members.email updated to ${newEmail}`
              );
            }

            // Update Stripe customer email — log failure prominently, do not throw
            if (memberRow.stripe_customer_id) {
              try {
                await getStripe().customers.update(memberRow.stripe_customer_id, {
                  email: newEmail,
                });
                console.log(
                  `[auth/callback] email_change: Stripe customer ${memberRow.stripe_customer_id} updated`
                );
              } catch (stripeErr) {
                // members.email has been updated but Stripe still has the old email.
                // Manual fix: update customer email in Stripe Dashboard.
                console.error(
                  `[auth/callback] STRIPE EMAIL SYNC FAILURE — customer ` +
                    `${memberRow.stripe_customer_id} email not updated to ${newEmail}. ` +
                    `Manual fix required.`,
                  stripeErr
                );
              }
            }

            // Update shareholder_cases so enquiries remain visible after email change
            if (previousEmail && previousEmail !== newEmail) {
              const { error: casesErr } = await db
                .from("shareholder_cases")
                .update({ email: newEmail })
                .eq("email", previousEmail);

              if (casesErr) {
                console.error(
                  `[auth/callback] CASES EMAIL SYNC FAILURE — shareholder_cases with ` +
                    `email=${previousEmail} not updated to ${newEmail}. Manual fix required.`,
                  casesErr
                );
              } else {
                console.log(
                  `[auth/callback] email_change: shareholder_cases updated from ${previousEmail} to ${newEmail}`
                );
              }
            }
          } else {
            console.warn(
              `[auth/callback] email_change: no member found with pending_email=${newEmail}. ` +
                `members table not updated — check sql/add-pending-email.sql has been run.`
            );
          }
        } catch (dbErr) {
          console.error("[auth/callback] email_change DB error:", dbErr);
        }

        // Always redirect to the portal Edit Profile tab — the Supabase auth
        // change succeeded regardless of whether the DB/Stripe updates did.
        const portalNext = "/member-portal?tab=profile&email_updated=true";
        const initUrl = `${origin}/auth/session-init?next=${encodeURIComponent(portalNext)}`;
        return NextResponse.redirect(initUrl);
      }

      // ── Standard flow: magic link login or password reset ──────────────────
      const initUrl = `${origin}/auth/session-init?next=${encodeURIComponent(redirectTo)}`;
      return NextResponse.redirect(initUrl);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
