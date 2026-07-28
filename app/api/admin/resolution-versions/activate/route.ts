import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

/**
 * Makes one resolution version current. The one action in this package that
 * can release the second lock: if the gate is also open, making a
 * non-placeholder version current makes signing possible immediately. The
 * confirmation naming that consequence lives in the client, not here - this
 * route only performs the flip once asked.
 *
 * Two updates, not one. A single-row UPDATE cannot both clear the old current
 * row and set the new one, and the partial unique index on is_current allows
 * only one true row at a time, so the old row is cleared first. There is a
 * brief window with zero current rows between the two statements. Accepted
 * for an admin-only, low-frequency action rather than adding a stored
 * procedure for atomicity this does not need.
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

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data: version, error: fetchError } = await db
    .from("agm_resolution_versions")
    .select("id, version_label, is_placeholder")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  const { error: clearError } = await db
    .from("agm_resolution_versions")
    .update({ is_current: false })
    .eq("is_current", true);

  if (clearError) {
    console.error("[resolution-versions/activate] clear error:", clearError.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const { error: setError } = await db
    .from("agm_resolution_versions")
    .update({ is_current: true })
    .eq("id", id);

  if (setError) {
    console.error(
      "[resolution-versions/activate] set error, no version is currently marked current:",
      setError.message
    );
    return NextResponse.json(
      { error: "Database error - no version is now marked current. Retry immediately." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: version.id,
    versionLabel: version.version_label,
    isPlaceholder: version.is_placeholder,
  });
}
