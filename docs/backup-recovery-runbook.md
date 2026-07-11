# CSL Database Backup — Recovery Runbook

**Audience:** Volunteer IT Lead and directors
**Last updated:** July 2026

---

## How the backup works

A daily automated backup runs at 02:00 UTC every day, triggered by GitHub Actions. It exports every member-facing database table as a CSV file and emails them as attachments to `info@celticsupporters.net`.

A manual backup can also be triggered at any time from the Operations page in the Member Portal. **Always run a manual backup before starting any migration script or bulk data operation.**

---

## Where to find backup emails

1. Open the `info@celticsupporters.net` inbox
2. Search for: **CSL Full Database Backup**
3. Each email subject follows this format:
   `CSL Full Database Backup — [date] — [total rows] rows across [n] tables`
4. The email body lists each table and its row count at the time of export
5. CSV files are attached — one file per table

Backup emails should be retained for a minimum of 30 days. Consider creating an inbox folder called "Database Backups" and setting up a filter to auto-file emails with the subject containing "CSL Full Database Backup".

---

## How to identify the right backup to restore from

1. Identify approximately when the data loss occurred (ask the last person who ran a migration or made database changes)
2. Find the backup email from **before** that time — the timestamp in the subject line shows the export date and time
3. Check the row count in the email body against what you would expect — if the members count looks significantly lower than expected, **do not restore from that backup**. Contact Gary Phinn first
4. The filename of each attachment includes the table name, date, and time:
   `members-backup-2026-07-11-0200.csv`

---

## Step-by-step: restoring a table from a CSV backup

These instructions require no SQL knowledge. All steps use the Supabase Table Editor.

**Before you start:**
- Confirm with Gary Phinn which backup to restore from
- Take a fresh manual backup from the Operations page first (even if the database is partially damaged — capture whatever is there)
- Do not restore during business hours if members may be actively logging in

**Steps:**

1. Download the relevant CSV attachment(s) from the backup email to your computer
2. Go to [supabase.com](https://supabase.com) and log in
3. Open the **CSL production project** (EU West — Ireland)
4. In the left sidebar, click **Table Editor**
5. Click the table you need to restore (e.g. `members`)
6. Click the **Import data** button (top right of the table view)
7. Select the CSV file you downloaded
8. Supabase will preview the data — check the column headers match
9. Click **Import**
10. Supabase will insert the rows. If a row already exists (same primary key), it will report a conflict — choose **Skip duplicates** to avoid overwriting newer data
11. Verify the row count after import matches the backup email

Repeat for each table that needs restoring.

---

## Special note: auth.users backup

The file `auth-users-backup-[date]-[time].csv` contains the login credentials link for every member. Each row connects a member's login account (the `id` UUID column) to their record in the `members` table (via the `user_id` column).

**If the `members` table is restored but auth.users are not:** members will have records in the database but will be unable to log in, because their login account no longer exists.

**If auth.users are restored but `members` is not:** members can log in but will see an empty portal with no membership data.

**Both must be restored together.**

Restoring `auth.users` is more complex than restoring other tables and cannot be done through the Table Editor — it requires the Supabase Admin API or Dashboard support. **Do not attempt auth.users recovery without first escalating to Gary Phinn.** Gary will contact Supabase support if needed.

---

## If the row count looks wrong

If the row count in a backup email is significantly lower than expected (for example, the members count drops from 500 to 50 with no explanation), **do not restore from that backup**.

A low row count means either:
- The backup captured a partially-completed migration or bulk delete
- There is a bug in the export that missed rows
- The data was already partially lost before the backup ran

In either case: stop, do not act, and contact Gary Phinn immediately. Restoring from a partial backup will make the situation worse.

---

## If the automated backup stops arriving

If you do not receive a backup email by 03:00 UTC on any given day:

1. Check the GitHub Actions tab at `github.com/celtic-supporters-limited/csl-website/actions` — look for the **Daily database backup** workflow
2. If the workflow shows a red failure icon, click it to see the error message
3. Common causes:
   - `CRON_SECRET` secret has been rotated in Vercel but not updated in GitHub Actions secrets
   - Resend daily email limit reached (check the Operations page)
   - Supabase project auto-paused (visit the Supabase dashboard to wake it)
4. Run a manual backup from the Operations page once the issue is resolved
5. If the cause is unclear, contact Gary Phinn

---

## Escalation contacts

If data loss is suspected at any scale:

1. **Notify all four directors immediately** before attempting any recovery action
2. **Contact Gary Phinn** (Volunteer IT Lead) to lead the recovery
3. If Gary is unavailable, contact **Martin Kenny** (Shareholder Register Manager)
4. Do not attempt to restore data, run migration scripts, or modify the database until Gary or Martin has confirmed the recovery plan

The priority order for recovery is:
1. `members` — active membership records
2. `auth.users` — login credentials (must be restored alongside `members`)
3. `shareholder_cases` — share tracing and proxy enquiries
4. All other tables

---

## Manual backup procedure (pre-migration checklist)

Before running any migration script or bulk operation:

1. Log in to the Member Portal at `/member-portal`
2. Go to **Admin > Operations**
3. Click **Take backup now**
4. Wait for the green confirmation showing row counts across all tables
5. Check your `info@celticsupporters.net` inbox to confirm the backup email arrived with attachments
6. Only then proceed with the migration or bulk operation

If the manual backup fails (red error message), do not proceed with the migration. Investigate and resolve the backup issue first.
