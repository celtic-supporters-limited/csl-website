import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { getCurrentMeetingRef } from "@/lib/site-gates";

/**
 * Creates a new resolution version. Never modifies an existing row - the
 * database enforces that separately via the immutability trigger on
 * agm_resolution_versions, this route just never attempts an update.
 *
 * Creating does not activate. Making a version current is a separate,
 * explicit action: POST /api/admin/resolution-versions/activate.
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

  let body: {
    versionLabel?: string;
    body?: string;
    declarationText?: string;
    consentText?: string;
    supportingStatement?: string;
    isPlaceholder?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const versionLabel = body.versionLabel?.trim();
  const resolutionBody = body.body?.trim();
  const declarationText = body.declarationText?.trim();
  const consentText = body.consentText?.trim();
  const supportingStatement = body.supportingStatement?.trim() || null;
  const isPlaceholder = body.isPlaceholder === true;

  if (!versionLabel) {
    return NextResponse.json({ error: "Version label is required." }, { status: 400 });
  }
  if (!resolutionBody) {
    return NextResponse.json({ error: "Resolution text is required." }, { status: 400 });
  }
  if (!declarationText) {
    return NextResponse.json({ error: "Declaration text is required." }, { status: 400 });
  }
  if (!consentText) {
    return NextResponse.json({ error: "Consent text is required." }, { status: 400 });
  }

  const { data, error } = await db
    .from("agm_resolution_versions")
    .insert({
      version_label: versionLabel,
      body: resolutionBody,
      declaration_text: declarationText,
      consent_text: consentText,
      supporting_statement: supportingStatement,
      is_placeholder: isPlaceholder,
      is_current: false,
      created_by: user.email ?? user.id,
      meeting_ref: await getCurrentMeetingRef(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[resolution-versions] insert error:", error.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
