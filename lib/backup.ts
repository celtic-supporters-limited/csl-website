import { getSupabase } from "@/lib/supabase";
import { Resend } from "resend";

// Tables exported in this order.
// Excluded: payments, events (confirmed obsolete).
// Excluded: email_log, email_bounces (operational metrics only — RLS blocks service_role
//   SELECT; not needed for member data recovery; operations page re-populates from live sends).
const BACKUP_TABLES = [
  "members",
  "shareholder_cases",
  "documents",
  "governance_criteria",
  "site_config",
  "member_events",
  "membership_snapshots",
] as const;

export type TableBackup = {
  name: string;
  rows: number;
  csv: string;
  filename: string;
};

export type BackupResult = {
  tables: TableBackup[];
  timestamp: string;
  totalRows: number;
};

// RFC 4180 compliant CSV serialisation.
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);

  const escapeCell = (val: unknown): string => {
    const str =
      val === null || val === undefined
        ? ""
        : typeof val === "object"
        ? JSON.stringify(val)
        : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(",")),
  ];
  return lines.join("\r\n");
}

function formatTimestamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}` +
    `-${p(date.getUTCHours())}${p(date.getUTCMinutes())}`
  );
}

function formatDateLabel(date: Date): string {
  return date.toUTCString();
}

export async function runBackup(): Promise<BackupResult> {
  const db = getSupabase();
  const now = new Date();
  const timestamp = formatTimestamp(now);
  const results: TableBackup[] = [];

  // Export each user table
  for (const table of BACKUP_TABLES) {
    const { data, error } = await db.from(table).select("*");
    if (error) throw new Error(`Failed to query ${table}: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    results.push({
      name: table,
      rows: rows.length,
      csv: toCsv(rows),
      filename: `${table}-backup-${timestamp}.csv`,
    });
    console.log(`[backup] ${table}: ${rows.length} rows`);
  }

  // Export auth.users via admin API — paginated, specific columns only.
  // encrypted_password and internal token columns are intentionally excluded.
  const authUsers: Record<string, unknown>[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Failed to query auth.users (page ${page}): ${error.message}`);
    const users = data?.users ?? [];

    for (const u of users) {
      authUsers.push({
        id: u.id,
        email: u.email ?? "",
        email_confirmed_at: u.email_confirmed_at ?? "",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? "",
        raw_user_meta_data: u.user_metadata ? JSON.stringify(u.user_metadata) : "",
      });
    }

    if (users.length < perPage) break;
    page++;
  }

  results.push({
    name: "auth.users",
    rows: authUsers.length,
    csv: toCsv(authUsers),
    filename: `auth-users-backup-${timestamp}.csv`,
  });
  console.log(`[backup] auth.users: ${authUsers.length} rows`);

  const totalRows = results.reduce((sum, t) => sum + t.rows, 0);
  console.log(`[backup] Complete. ${totalRows} total rows across ${results.length} tables.`);

  return { tables: results, timestamp: formatDateLabel(now), totalRows };
}

export async function sendBackupEmail(result: BackupResult): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.startsWith("re_your-")) {
    console.log("[backup] RESEND_API_KEY not configured — backup email skipped");
    return;
  }

  const resend = new Resend(key);
  const dateLabel = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  const subject = `CSL Full Database Backup — ${dateLabel} — ${result.totalRows} rows across ${result.tables.length} tables`;

  const bodyLines = [
    `CSL database backup exported at ${result.timestamp}`,
    "",
    "Table row counts:",
    ...result.tables.map((t) => `  ${t.name}: ${t.rows} rows`),
    "",
    "Please retain these files for a minimum of 30 days.",
    "If data loss is suspected, do not restore without first contacting Gary Phinn.",
  ];

  const attachments = result.tables
    .filter((t) => t.csv.length > 0)
    .map((t) => ({
      filename: t.filename,
      content: Buffer.from(t.csv, "utf-8"),
    }));

  await resend.emails.send({
    from: "CSL Website <info@celticsupporters.net>",
    to: "info@celticsupporters.net",
    subject,
    text: bodyLines.join("\n"),
    attachments,
  });

  console.log(`[backup] Email sent — ${subject}`);
}

export async function sendBackupFailureAlert(err: unknown): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.startsWith("re_your-")) {
    console.error("[backup] RESEND_API_KEY not configured — failure alert skipped");
    return;
  }

  const resend = new Resend(key);
  const dateLabel = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  const errorMessage = err instanceof Error ? err.message : String(err);

  try {
    await resend.emails.send({
      from: "CSL Website <info@celticsupporters.net>",
      to: "info@celticsupporters.net",
      subject: `ALERT: CSL daily backup failed — ${dateLabel}`,
      text: [
        "The automated CSL database backup failed.",
        "",
        `Error: ${errorMessage}`,
        "",
        "Action required: investigate immediately and run a manual backup from the Operations page once resolved.",
      ].join("\n"),
    });
  } catch (alertErr) {
    console.error("[backup] Failed to send failure alert:", alertErr);
  }
}
