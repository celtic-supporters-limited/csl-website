import { NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { runBackup, sendBackupEmail, sendBackupFailureAlert, logBackupResult } from "@/lib/backup";

export async function POST() {
  const authClient = createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabase();
  let { data: adminCheck } = await db
    .from("members")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminCheck && user.email) {
    ({ data: adminCheck } = await db.from("members").select("is_admin").eq("email", user.email).maybeSingle());
  }
  if (!adminCheck?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await runBackup();
    await Promise.all([
      sendBackupEmail(result),
      logBackupResult("success", result),
    ]);

    return NextResponse.json({
      ok: true,
      tables: result.tables.map((t) => ({ name: t.name, rows: t.rows })),
      totalRows: result.totalRows,
      timestamp: result.timestamp,
    });
  } catch (err) {
    console.error("[admin/backup] Backup failed:", err);
    const errorMsg = err instanceof Error ? err.message : "Backup failed";
    await Promise.all([
      sendBackupFailureAlert(err),
      logBackupResult("failed", undefined, errorMsg),
    ]);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
