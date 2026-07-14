-- Persists the outcome of each daily backup run so the Operations page
-- can show history without querying email or GitHub Actions.
-- Written by POST /api/cron/backup-members after every run (success or failure).
-- Service role bypasses RLS; no policies for anon/authenticated.

CREATE TABLE IF NOT EXISTS backup_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at       timestamptz NOT NULL DEFAULT now(),
  status       text        NOT NULL,  -- 'success' | 'failed'
  total_rows   integer,
  table_counts jsonb,                 -- { "members": 487, "documents": 12, ... }
  error_msg    text
);

ALTER TABLE backup_log ENABLE ROW LEVEL SECURITY;
