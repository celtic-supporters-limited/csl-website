import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

/**
 * Deletes a resolution version. Only ever reachable from the client for
 * versions with zero signatures that are not current, but both checks are
 * repeated here since a direct POST bypasses the client entirely.
 *
 * The zero-signatures half is already safe regardless of what this route
 * does: agm_signatures.resolution_version_id is ON DELETE RESTRICT, so
 * Postgres itself refuses the delete if any signature references this row.
 * The is_current check is the one guard the database does not provide -
 * is_current is a plain column, not an FK relationship, so nothing stops an
 * application from deleting the version signing currently depends on unless
 * this route refuses it explicitly.
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
    .select("id, version_label, is_current")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  if (version.is_current) {
    return NextResponse.json(
      { error: "Cannot delete the current version. Make another version current first." },
      { status: 400 }
    );
  }

  const { error: deleteError } = await db
    .from("agm_resolution_versions")
    .delete()
    .eq("id", id);

  if (deleteError) {
    if (deleteError.code === "23503") {
      return NextResponse.json(
        { error: "This version has signatures against it and cannot be deleted." },
        { status: 409 }
      );
    }
    console.error("[resolution-versions/delete] delete error:", deleteError.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: version.id, versionLabel: version.version_label });
}
