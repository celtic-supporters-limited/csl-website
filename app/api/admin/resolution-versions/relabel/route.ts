import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

/**
 * Updates version_label only. Every other column on agm_resolution_versions
 * stays immutable at the database level - see
 * agm_resolution_versions_immutable() in sql/agm-p3-amend-editable-label.sql.
 * version_label was carved out of that trigger because it is metadata nobody
 * signs; this route only ever sends that one key, so it cannot accidentally
 * widen into editing signed content even before considering the trigger.
 *
 * Until sql/agm-p3-amend-editable-label.sql has been run, the trigger still
 * blocks this update and the row stays unchanged - the request fails with a
 * database error rather than silently doing nothing.
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

  let body: { id?: string; versionLabel?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id;
  const versionLabel = body.versionLabel?.trim();

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!versionLabel) {
    return NextResponse.json({ error: "Label cannot be empty." }, { status: 400 });
  }

  const { error } = await db
    .from("agm_resolution_versions")
    .update({ version_label: versionLabel })
    .eq("id", id);

  if (error) {
    console.error("[resolution-versions/relabel] update error:", error.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
