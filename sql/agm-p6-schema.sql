-- AGM Package 6 - documents and the return journey
--
-- Two additions:
--
-- 1. shares_held_exact on agm_proxies. Celtic's Notice of AGM 2025, note 2:
-- failing to state the number of shares a proxy appointment relates to, or
-- stating more than are held, may invalidate the appointment. The existing
-- shares_held column is a banded range from agm_share_bands (including "Not
-- sure"), which cannot satisfy that. Nullable at the database level, same
-- pattern as computershare_srn: mandatory for direct holders, enforced in
-- app/api/proxy/appointment/route.ts, not by a CHECK constraint, matching
-- how SRN-required-for-direct is already enforced on this table.
--
-- 2. email_sent_at / email_error on agm_signatures and agm_proxies. Package
-- 6 sends one confirmation email per public submission, with a PDF
-- attached for most flows. A send failure must never block or roll back
-- the submission (brief standing rule), which means it can fail silently
-- unless recorded somewhere a volunteer can see it - these two columns are
-- that record. Not added to agm_supporters or shareholder_cases: neither
-- carries a PDF attachment, and a supporter/interest confirmation email
-- failing has no backlog consequence the way a lodgement document does.
--
-- Safe to run as-is: three ADD COLUMN statements, all nullable, no rewrite.

BEGIN;

ALTER TABLE agm_proxies ADD COLUMN IF NOT EXISTS shares_held_exact INTEGER;

ALTER TABLE agm_signatures ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE agm_signatures ADD COLUMN IF NOT EXISTS email_error   TEXT;

ALTER TABLE agm_proxies ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE agm_proxies ADD COLUMN IF NOT EXISTS email_error   TEXT;

COMMIT;

-- Verification.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agm_proxies'
  AND column_name IN ('shares_held_exact', 'email_sent_at', 'email_error')
ORDER BY column_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agm_signatures'
  AND column_name IN ('email_sent_at', 'email_error')
ORDER BY column_name;
