-- Lightweight email send log for operational monitoring.
-- Each row represents one outbound email sent via Resend.
-- The operations page at /member-portal/admin/operations queries this
-- for daily and monthly counts against the Resend free-tier limits.
--
-- RLS is enabled with no policies for anon/authenticated —
-- service_role (used by API routes) bypasses RLS and can INSERT/SELECT.

CREATE TABLE IF NOT EXISTS email_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at    timestamptz NOT NULL DEFAULT now(),
  email_type text        NOT NULL
);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- ── DB size helper ────────────────────────────────────────────────────────────
-- Returns the Supabase database size in bytes.
-- Called by the operations page via db.rpc("admin_get_db_size_bytes").
-- SECURITY DEFINER so it runs as the function owner (postgres), not the caller.
-- Restricted to service_role only.

CREATE OR REPLACE FUNCTION admin_get_db_size_bytes()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_database_size(current_database());
$$;

REVOKE ALL ON FUNCTION admin_get_db_size_bytes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_db_size_bytes() TO service_role;
