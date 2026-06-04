import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const VALID_STATUSES = new Set(["red", "amber", "green"]);

export async function PATCH(req: NextRequest) {
  // Bearer token auth
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const expected = process.env.GOVERNANCE_UPDATE_TOKEN;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: unknown; status?: unknown; commentary?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, status, commentary } = body;

  if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || id > 12) {
    return NextResponse.json(
      { error: "id must be an integer from 1 to 12" },
      { status: 400 }
    );
  }
  if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "status must be 'red', 'amber', or 'green'" },
      { status: 400 }
    );
  }
  if (commentary !== undefined && typeof commentary !== "string") {
    return NextResponse.json(
      { error: "commentary must be a string" },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = {
    status,
    last_reviewed: new Date().toISOString().split("T")[0],
    updated_by: "CSL Director",
  };
  if (commentary !== undefined) {
    updateData.commentary = commentary;
  }

  const { error } = await getSupabase()
    .from("governance_criteria")
    .update(updateData)
    .eq("id", id);

  if (error) {
    console.error("[governance PATCH] Supabase error:", error.message);
    return NextResponse.json({ error: "Database update failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
