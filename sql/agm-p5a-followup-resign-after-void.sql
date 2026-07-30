-- AGM Package 5a follow-up - voiding a signature must actually free the
-- email for a fresh sign
--
-- Gary's review: capture_status needs to be settable (done in the app layer,
-- app/api/admin/agm-edit/route.ts), and voiding is the cleaner route for a
-- pre_rebuild record given the email uniqueness constraint - but no existing
-- UNIQUE constraint on agm_signatures.email knows about status. Whatever
-- shape it is on the target database (checked directly against staging: a
-- plain UNIQUE(email) is still present there, not only the composite
-- (email, meeting_ref) sql/agm-gap-fill-meeting-scoped-email.sql was meant
-- to have replaced it with - that script's replacement did not stick, or
-- production and staging have diverged; either way, guessing the exact
-- constraint name is not safe here), it would still block a second insert
-- with the same email after the first row is voided, which means voiding
-- alone did not actually solve the problem it was chosen to solve.
--
-- Fix: find every UNIQUE constraint on agm_signatures that covers the email
-- column, whatever its exact shape, and drop all of them, then add a single
-- partial UNIQUE INDEX scoped to status = 'active'. A voided or withdrawn
-- row no longer counts toward the uniqueness check, so the same person can
-- sign again with the same email for the same meeting.
-- app/api/resolution/sign/route.ts's own duplicate check is updated to
-- match (only an active existing row is a duplicate).
--
-- Safe to run as-is: dropping a UNIQUE constraint and replacing it with an
-- equivalent-or-looser partial index cannot make any existing row invalid,
-- since every row that satisfied the old constraint(s) still satisfies the
-- new, narrower one. Idempotent: a second run finds no matching constraint
-- left to drop and CREATE INDEX IF NOT EXISTS is a no-op.

BEGIN;

DO $$
DECLARE
  v_constraint RECORD;
  v_email_attnum INT;
BEGIN
  SELECT attnum INTO v_email_attnum
  FROM pg_attribute
  WHERE attrelid = 'agm_signatures'::regclass AND attname = 'email';

  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'agm_signatures'::regclass
      AND contype = 'u'
      AND v_email_attnum = ANY(conkey)
  LOOP
    EXECUTE format('ALTER TABLE agm_signatures DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agm_signatures_email_meeting_ref_active_key
  ON agm_signatures (email, meeting_ref)
  WHERE status = 'active';

COMMIT;

-- Verification. Expect zero rows: no UNIQUE constraint on email remains
-- outside the new partial index.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'agm_signatures'::regclass
  AND contype = 'u'
  AND (SELECT attnum FROM pg_attribute WHERE attrelid = 'agm_signatures'::regclass AND attname = 'email') = ANY(conkey);

SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'agm_signatures' AND indexname = 'agm_signatures_email_meeting_ref_active_key';
