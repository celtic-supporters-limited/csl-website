import { getSupabase } from "@/lib/supabase";

// Per-member (not per-event) repeat-send guard for the pending-cancellation
// email pair. stripe_event_id idempotency doesn't cover this: cancel ->
// reverse -> cancel produces three genuinely distinct Stripe events in
// minutes, each with its own event ID, so the existing per-event guard lets
// all three through. This checks whether EITHER a "cancellation.pending" or
// "cancellation.reversed" event was already logged for this email in the
// last hour — those rows are only written when an email was actually sent
// (see the webhook handler), so this only ever suppresses on top of a real
// prior send, never cascades.
export async function hasRecentPendingCancellationActivity(email: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await getSupabase()
      .from("member_events")
      .select("id")
      .eq("event_email", email)
      .in("event_type", ["cancellation.pending", "cancellation.reversed"])
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[member-events] recent-activity lookback failed, proceeding:", error.message);
      return false; // fail open — a DB hiccup should not silently drop a real cancellation email
    }
    return !!data;
  } catch (e) {
    console.error("[member-events] recent-activity lookback failed, proceeding:", e);
    return false;
  }
}

export async function logMemberEvent({
  memberId,
  memberEmail,
  eventType,
  detail,
  stripeEventId,
  eventEmail,
  isTest = false,
}: {
  memberId?: string | null;
  memberEmail?: string | null;
  eventType: string;
  detail?: Record<string, unknown>;
  stripeEventId?: string | null;
  eventEmail?: string | null;
  isTest?: boolean;
}): Promise<void> {
  const db = getSupabase();

  let resolvedMemberId = memberId ?? null;

  // Look up member_id by email when only email is available (e.g. auth routes).
  if (!resolvedMemberId && memberEmail) {
    const { data } = await db
      .from("members")
      .select("id")
      .eq("email", memberEmail.toLowerCase())
      .maybeSingle();
    resolvedMemberId = data?.id ?? null;
  }

  const { error } = await db.from("member_events").insert({
    member_id: resolvedMemberId,
    event_type: eventType,
    detail: detail ?? null,
    stripe_event_id: stripeEventId ?? null,
    event_email: eventEmail ?? null,
    is_test: isTest,
  });

  if (error) {
    // Duplicate Stripe event (webhook retry) — silently skip; the first write succeeded.
    if (error.code === "23505" && stripeEventId) return;
    console.error(`[member-events] Failed to log ${eventType}:`, error.message);
  }
}
