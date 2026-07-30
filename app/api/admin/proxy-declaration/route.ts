import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

const CONFIG_KEY = "proxy_declaration_text";

/**
 * Package 5a follow-up - the one and only way to change the proxy
 * declaration wording. Deliberately not built on the generic agm-edit
 * route: site_config's primary key is `key`, not `id`, and there is
 * exactly one field this route will ever touch. Generalising this into the
 * shared machinery was explicitly rejected - this stays a dedicated route
 * for one field, through one form.
 *
 * Logs through agm_change_log like every other AGM edit, using
 * table_name = 'site_config' and record_id = the config key, so there is
 * one audit trail rather than a second one just for config. Same
 * log-then-update guarantee as lib/agm-change-log.ts: if the log write
 * fails, the config value is never touched.
 *
 * The TBD guard on the appointment route (isProxyDeclarationReady) is
 * unaffected by this route - saving empty text or text starting with TBD is
 * allowed here (a volunteer may deliberately park it), and the admin
 * banner already reflects the not-ready state reactively from the same
 * config value. This route does not duplicate that check.
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

  let body: { text?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.text ?? "";
  const reason = body.reason?.trim();
  if (!reason) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }

  const { data: current } = await db
    .from("site_config")
    .select("value")
    .eq("key", CONFIG_KEY)
    .maybeSingle();

  const oldValue = current?.value ?? null;
  if (oldValue === text) {
    return NextResponse.json({ ok: true, changed: false });
  }

  const { error: logError } = await db.from("agm_change_log").insert({
    table_name: "site_config",
    record_id: CONFIG_KEY,
    field_name: "value",
    old_value: oldValue,
    new_value: text,
    changed_by: user.email ?? user.id,
    reason,
  });
  if (logError) {
    console.error("[proxy-declaration] log write failed:", logError.message);
    return NextResponse.json({ error: "Could not record the change. Nothing was saved." }, { status: 500 });
  }

  const { error: updateError } = await db
    .from("site_config")
    .upsert({ key: CONFIG_KEY, value: text, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (updateError) {
    console.error(
      "[proxy-declaration] logged but update failed - log and config now disagree:",
      updateError.message
    );
    return NextResponse.json(
      { error: "The change was recorded but could not be saved. Contact info@celticsupporters.net." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, changed: true });
}
