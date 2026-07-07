import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { logMemberEvent } from "@/lib/member-events";

// Called by the client-side /auth/callback page after exchangeCodeForSession
// for email_change flows. Syncs the new email into members, Stripe, and
// shareholder_cases. Auth is verified via the session cookie.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const newEmail =
    typeof (body as Record<string, unknown>).newEmail === "string"
      ? ((body as Record<string, unknown>).newEmail as string).trim().toLowerCase()
      : null;

  if (!newEmail) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Verify the session — the user must be authenticated as newEmail
  const authClient = createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user || user.email?.toLowerCase() !== newEmail) {
    console.error("[email-change-confirm] Unauthenticated or email mismatch");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const db = getSupabase();

  try {
    const { data: memberRow, error: lookupErr } = await db
      .from("members")
      .select("id, email, stripe_customer_id")
      .eq("pending_email", newEmail)
      .maybeSingle();

    if (lookupErr) {
      console.error("[email-change-confirm] pending_email lookup error:", lookupErr.message);
      return NextResponse.json({ ok: false });
    }

    if (!memberRow) {
      console.warn(`[email-change-confirm] no member found with pending_email=${newEmail}`);
      return NextResponse.json({ ok: true }); // non-fatal — member may have already been updated
    }

    const previousEmail = memberRow.email;

    const { error: updateErr } = await db
      .from("members")
      .update({ email: newEmail, pending_email: null })
      .eq("id", memberRow.id);

    if (updateErr) {
      console.error("[email-change-confirm] members update error:", updateErr.message);
    } else {
      logMemberEvent({
        memberId: memberRow.id,
        eventType: "email_change.confirmed",
        detail: { old_email: previousEmail, new_email: newEmail },
        eventEmail: previousEmail,
      }).catch((err) => console.error("[email-change-confirm] event log error:", err));
    }

    if (memberRow.stripe_customer_id) {
      try {
        await getStripe().customers.update(memberRow.stripe_customer_id, { email: newEmail });
      } catch (stripeErr) {
        console.error(
          `[email-change-confirm] STRIPE EMAIL SYNC FAILURE — customer ` +
            `${memberRow.stripe_customer_id} not updated to ${newEmail}. Manual fix required.`,
          stripeErr
        );
      }
    }

    if (previousEmail && previousEmail !== newEmail) {
      const { error: casesErr } = await db
        .from("shareholder_cases")
        .update({ email: newEmail })
        .eq("email", previousEmail);

      if (casesErr) {
        console.error(
          `[email-change-confirm] CASES EMAIL SYNC FAILURE — cases with ` +
            `email=${previousEmail} not updated. Manual fix required.`,
          casesErr
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email-change-confirm] DB error:", err);
    return NextResponse.json({ ok: false });
  }
}
