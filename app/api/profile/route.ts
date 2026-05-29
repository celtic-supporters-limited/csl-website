import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

const FAN_STATUS_VALUES = [
  "Season Ticket",
  "Away Member",
  "Home Only",
  "Supporter (no match)",
] as const;

export async function PATCH(req: NextRequest) {
  const authClient = createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json();

  // Build update object — only accept known profile fields
  const update: Record<string, unknown> = {};

  if ("first_name" in body)
    update.first_name =
      typeof body.first_name === "string" ? body.first_name.trim() || null : null;
  if ("last_name" in body)
    update.last_name =
      typeof body.last_name === "string" ? body.last_name.trim() || null : null;
  if ("phone" in body)
    update.phone =
      typeof body.phone === "string" ? body.phone.trim() || null : null;
  if ("fan_status" in body) {
    const fs = body.fan_status;
    update.fan_status =
      fs === null || fs === "" ? null
      : FAN_STATUS_VALUES.includes(fs) ? fs
      : null;
  }
  if ("contact_email" in body)
    update.contact_email = body.contact_email === true;
  if ("contact_sms" in body)
    update.contact_sms = body.contact_sms === true;
  if ("contact_telephone" in body)
    update.contact_telephone = body.contact_telephone === true;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields provided." }, { status: 400 });
  }

  const { error } = await getSupabase()
    .from("members")
    .update(update)
    .eq("email", user.email);

  if (error) {
    console.error("[profile] Supabase update error:", error.message);
    return NextResponse.json({ error: "Failed to save changes." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
