-- AGM Package 5a - make every record editable, add the change log
--
-- Implements brief section 2c: nothing is immutable, everything is editable.
-- The requirement was never immutability, it was provability - an
-- append-only change log delivers that and lets two non-technical volunteers
-- correct a mistyped shareholder reference without a developer.
--
-- Run on staging first, then production unchanged, per the brief's standing
-- rule on rehearsing the exact sequence.

BEGIN;

-- ── 1. The change log ────────────────────────────────────────────────────────
-- The only locked thing in this system. One table covering every AGM record
-- type: which table, which record, which field, the old value, the new
-- value, who, when, why. Written server side on every edit and every status
-- change, never by the client.
--
-- Enforced append-only at the database level, not by a trigger - a trigger
-- that blocks a write is exactly the pattern section 2c is unwinding. INSERT
-- and SELECT are granted to service_role; UPDATE and DELETE are granted to
-- no role at all, including service_role, so an attempt fails on privilege
-- rather than on a check.

CREATE TABLE IF NOT EXISTS agm_change_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL CHECK (table_name IN (
                'agm_resolution_versions', 'agm_signatures', 'agm_supporters',
                'agm_proxies', 'shareholder_cases'
              )),
  record_id   UUID NOT NULL,
  field_name  TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_by  TEXT NOT NULL,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agm_change_log_record
  ON agm_change_log (table_name, record_id, created_at DESC);

ALTER TABLE agm_change_log ENABLE ROW LEVEL SECURITY;
-- Deliberately no policy for anon or authenticated - read and write both go
-- through the service-role client behind an is_admin guard, same posture as
-- agm_resolution_versions.

REVOKE ALL ON TABLE agm_change_log FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT ON TABLE agm_change_log TO service_role;
-- No UPDATE, no DELETE, to any role. This is the one lock in the programme.

-- ── 2. Remove the immutability trigger on agm_resolution_versions ──────────
-- It blocked updates to body, version_label, is_placeholder,
-- declaration_text, consent_text, supporting_statement, meeting_ref, id,
-- created_at, created_by. It goes entirely. Provability now comes from the
-- change log plus the per-signature snapshot in section 4 below, not from
-- locking the row the signature points at.

DROP TRIGGER IF EXISTS agm_resolution_versions_no_edit ON agm_resolution_versions;
DROP FUNCTION IF EXISTS agm_resolution_versions_immutable();

-- ── 3. Status on every AGM record type ──────────────────────────────────────
-- active / withdrawn / voided, per brief section 2c. No hard delete anywhere.
--
-- agm_proxies already has active/revoked from Package 5. Folding revoked
-- into withdrawn rather than running two vocabularies - "the person asked to
-- be removed" is exactly what a member revoking their own proxy is doing.
-- revoked_at and revoked_reason stay as columns; they keep the proxy-specific
-- meaning, they just now sit alongside the shared status value rather than
-- their own private one. This is a value rename on a proxy-specific field,
-- not a backfill against evidentiary content - the same reasoning already
-- applied to the shareholder_cases case_type rename in the Package 5
-- close-out. Idempotent: a second run finds nothing left to rename.

UPDATE agm_proxies SET status = 'withdrawn' WHERE status = 'revoked';
ALTER TABLE agm_proxies DROP CONSTRAINT IF EXISTS agm_proxies_status_check;
ALTER TABLE agm_proxies ADD CONSTRAINT agm_proxies_status_check
  CHECK (status IN ('active', 'withdrawn', 'voided'));

ALTER TABLE agm_signatures ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'withdrawn', 'voided'));
ALTER TABLE agm_supporters ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'withdrawn', 'voided'));

-- shareholder_cases already has a status column with its own vocabulary
-- ('New' / 'In Progress' / 'Resolved') for case-handling workflow on the
-- Cases admin page - a Share Tracing enquiry moving through that workflow is
-- a different concern from a Proxy Interest row being withdrawn or voided.
-- Overloading the existing column would break that workflow for every row in
-- the table, not just the AGM ones. A separate column, applying only in
-- spirit to Proxy Interest rows, avoids the collision.
ALTER TABLE shareholder_cases ADD COLUMN IF NOT EXISTS agm_record_status TEXT NOT NULL DEFAULT 'active'
  CHECK (agm_record_status IN ('active', 'withdrawn', 'voided'));

-- ── 4. Snapshot what was signed, onto the signature itself ─────────────────
-- agm_proxies already does this with declaration_snapshot. This is the same
-- idea applied to agm_signatures, across all four texts a signatory saw:
-- resolution, declaration, consent, supporting statement. Written once at
-- insert (see app/api/resolution/sign/route.ts), never edited afterwards -
-- not locked, because nothing is locked, but an edit to a snapshot column is
-- the clearest case for the section 3.2 warning, since it is changing the
-- record of what someone agreed to.
--
-- Nullable: existing rows (including the two production pre_rebuild rows)
-- predate this column and cannot have a snapshot manufactured for them
-- after the fact - there is no reliable record of what they saw. NOT NULL
-- would require a backfill against real signature rows, which is exactly
-- what the brief's "never write migration or backfill logic for AGM tables"
-- rule prohibits.

ALTER TABLE agm_signatures ADD COLUMN IF NOT EXISTS resolution_snapshot TEXT;
ALTER TABLE agm_signatures ADD COLUMN IF NOT EXISTS declaration_snapshot TEXT;
ALTER TABLE agm_signatures ADD COLUMN IF NOT EXISTS consent_snapshot TEXT;
ALTER TABLE agm_signatures ADD COLUMN IF NOT EXISTS supporting_statement_snapshot TEXT;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────

-- Expect: insert_delete = f, insert_insert = t (service_role can insert and
-- select, cannot update or delete).
SELECT
  has_table_privilege('service_role', 'agm_change_log', 'INSERT') AS can_insert,
  has_table_privilege('service_role', 'agm_change_log', 'SELECT') AS can_select,
  has_table_privilege('service_role', 'agm_change_log', 'UPDATE') AS can_update,
  has_table_privilege('service_role', 'agm_change_log', 'DELETE') AS can_delete;

-- Expect zero rows: the trigger and its function are both gone.
SELECT tgname FROM pg_trigger WHERE tgname = 'agm_resolution_versions_no_edit';
SELECT proname FROM pg_proc WHERE proname = 'agm_resolution_versions_immutable';

-- Expect zero: no row anywhere still says 'revoked'.
SELECT count(*) AS remaining_revoked_rows FROM agm_proxies WHERE status = 'revoked';

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'agm_signatures'
  AND column_name IN ('status', 'resolution_snapshot', 'declaration_snapshot', 'consent_snapshot', 'supporting_statement_snapshot')
ORDER BY column_name;

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN ('agm_supporters', 'shareholder_cases')
  AND column_name IN ('status', 'agm_record_status')
ORDER BY table_name, column_name;
