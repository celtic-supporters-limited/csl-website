-- AGM gap-fill - make email uniqueness composite with meeting_ref
--
-- agm_signatures and agm_supporters currently enforce UNIQUE(email) alone.
-- meeting_ref was added in Package 3 so a future AGM is a config change, but
-- a bare UNIQUE(email) means someone who signs in 2026 can never sign again
-- in 2027 - the same email is rejected as a duplicate regardless of which
-- meeting it is for, which defeats the scoping.
--
-- Safe to run as-is on both staging and production: neither table can
-- currently hold two rows sharing an email (the existing constraint has
-- guaranteed that), so widening it to (email, meeting_ref) cannot conflict
-- with any existing row. Free now while both tables are near-empty; the same
-- change once real signatures exist would be a migration against records
-- that are evidence of a statutory request.
--
-- Constraint names are discovered from the catalogue rather than hardcoded.
-- They are Postgres's standard auto-generated name for an inline UNIQUE
-- column (<table>_<column>_key), and are expected to be agm_signatures_email_key
-- and agm_supporters_email_key, but discovering them removes any risk of a
-- typo silently doing nothing.

DO $$
DECLARE
  v_sig_constraint TEXT;
  v_sup_constraint TEXT;
BEGIN
  SELECT conname INTO v_sig_constraint
  FROM pg_constraint
  WHERE conrelid = 'agm_signatures'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 1
    AND conkey[1] = (
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'agm_signatures'::regclass AND attname = 'email'
    );

  IF v_sig_constraint IS NULL THEN
    RAISE EXCEPTION 'Could not find a single-column UNIQUE constraint on agm_signatures.email. Stop and investigate rather than guessing a name.';
  END IF;

  EXECUTE format('ALTER TABLE agm_signatures DROP CONSTRAINT %I', v_sig_constraint);
  ALTER TABLE agm_signatures
    ADD CONSTRAINT agm_signatures_email_meeting_ref_key UNIQUE (email, meeting_ref);

  SELECT conname INTO v_sup_constraint
  FROM pg_constraint
  WHERE conrelid = 'agm_supporters'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 1
    AND conkey[1] = (
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'agm_supporters'::regclass AND attname = 'email'
    );

  IF v_sup_constraint IS NULL THEN
    RAISE EXCEPTION 'Could not find a single-column UNIQUE constraint on agm_supporters.email. Stop and investigate rather than guessing a name.';
  END IF;

  EXECUTE format('ALTER TABLE agm_supporters DROP CONSTRAINT %I', v_sup_constraint);
  ALTER TABLE agm_supporters
    ADD CONSTRAINT agm_supporters_email_meeting_ref_key UNIQUE (email, meeting_ref);
END $$;

-- Verification. Expect one composite constraint on each table, each covering
-- both columns.
SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('agm_signatures'::regclass, 'agm_supporters'::regclass)
  AND contype = 'u';
