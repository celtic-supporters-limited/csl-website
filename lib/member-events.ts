import { getSupabase } from "@/lib/supabase";

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
