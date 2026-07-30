import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { applyStatusChange } from "@/lib/agm-change-log";

/**
 * Revokes a proxy appointment. A status change, not a delete - section 5a of
 * the Package 5 brief. A member can revoke a proxy before the meeting; that
 * is their right, and the record is retained so CSL can show a registrar
 * which appointments in a lodged block are no longer live.
 *
 * Package 5a folds the proxy-specific 'revoked' value into the shared
 * active/withdrawn/voided scheme (brief section 2c) - a revocation is the
 * person asking to be removed, which is exactly what 'withdrawn' means. This
 * route keeps its own URL and "Revoke" vocabulary, and keeps writing
 * revoked_at/revoked_reason as a side effect, but the status value itself
 * and the change log entry now go through the same lib/agm-change-log.ts
 * helper every other status change on any AGM record uses.
 *
 * One click, no workflow: the confirmation naming the person lives in the
 * client, this route only performs the flip once asked.
 */
export async function POST(request: NextRequest) {
  const authClient = createServerSupabase();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const db = getSupabase();

  let { data: member } = await db
    .from("members")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member && user.email) {
    ({ data: member } = await db
      .from("members")
      .select("is_admin")
      .eq("email", user.email)
      .maybeSingle());
  }

  if (!member?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { id?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id;
  const reason = body.reason?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "A reason is required." }, { status: 400 });

  const { data: proxy, error: fetchError } = await db
    .from("agm_proxies")
    .select("id, full_name, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !proxy) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (proxy.status === "withdrawn") {
    return NextResponse.json({ error: "This appointment is already revoked." }, { status: 400 });
  }

  const result = await applyStatusChange({
    table: "agm_proxies",
    id,
    statusColumn: "status",
    newStatus: "withdrawn",
    changedBy: user.email ?? user.id,
    reason,
    extraUpdates: { revoked_at: new Date().toISOString(), revoked_reason: reason },
  });

  if (!result.ok) {
    console.error("[proxy/revoke] update error:", result.error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: proxy.id, fullName: proxy.full_name });
}
