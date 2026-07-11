import { NextRequest, NextResponse } from "next/server";
import { runBackup, sendBackupEmail, sendBackupFailureAlert } from "@/lib/backup";

// Triggered daily at 02:00 UTC by GitHub Actions (.github/workflows/daily-backup.yml).
// Authorization header set by the workflow using the CRON_SECRET env var.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runBackup();
    await sendBackupEmail(result);

    return NextResponse.json({
      ok: true,
      tables: result.tables.map((t) => ({ name: t.name, rows: t.rows })),
      totalRows: result.totalRows,
      timestamp: result.timestamp,
    });
  } catch (err) {
    console.error("[cron/backup-members] Backup failed:", err);
    await sendBackupFailureAlert(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backup failed" },
      { status: 500 }
    );
  }
}
