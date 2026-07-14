import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

const ALLOWED_STATUSES = ["New", "In Progress", "Resolved"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // ── Auth + admin guard ──────────────────────────────────────────────────────
  const serverSupabase = createServerSupabase();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: member } = await getSupabase()
    .from("members")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  if (!member?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const update: Record<string, string | null> = {};

  if ("status" in body) {
    if (!ALLOWED_STATUSES.includes(body.status as typeof ALLOWED_STATUSES[number])) {
      return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
    }
    update.status = body.status as string;
  }

  if ("assigned_to" in body) {
    update.assigned_to =
      typeof body.assigned_to === "string" && body.assigned_to.trim()
        ? body.assigned_to.trim()
        : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // ── Update row ──────────────────────────────────────────────────────────────
  const { error } = await getSupabase()
    .from("shareholder_cases")
    .update(update)
    .eq("id", params.id);

  if (error) {
    console.error("[admin/cases] update error:", error.message);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
