-- AGM Package 5a follow-up 2 - the same resign-after-void fix for
-- agm_supporters and agm_proxies
--
-- Gary's review: withdrawing or voiding a row on either table did not free
-- the email for a fresh submission, the same defect just fixed on
-- agm_signatures in sql/agm-p5a-followup-resign-after-void.sql. Same
-- pattern, same reasoning: discover every UNIQUE constraint covering the
-- email column by column, not by name, since guessing the name was already
-- wrong once on agm_signatures - staging's actual constraint did not match
-- what the earlier gap-fill script was meant to leave. Replace whatever is
-- found with a single partial UNIQUE INDEX scoped to status = 'active'.
--
-- app/api/proxy/appointment/route.ts's duplicate check is updated in the
-- same commit to match (status = active only). app/api/proxy/route.ts (the
-- interest flow) and app/api/resolution/supporter/route.ts do not run an
-- explicit duplicate SELECT - they rely on the database constraint and
-- catch a 23505 error as "already registered" - so no equivalent app-code
-- change is needed there: once the constraint itself is scoped to active
-- rows, a genuine resubmission after withdrawal or voiding succeeds as a
-- real insert instead of hitting 23505 at all.
--
-- Safe to run as-is, same reasoning as the agm_signatures fix: dropping a
-- UNIQUE constraint and replacing it with an equivalent-or-looser partial
-- index cannot invalidate any existing row. Idempotent.

BEGIN;

DO $$
DECLARE
  v_constraint RECORD;
  v_attnum INT;
BEGIN
  -- agm_supporters
  SELECT attnum INTO v_attnum
  FROM pg_attribute
  WHERE attrelid = 'agm_supporters'::regclass AND attname = 'email';

  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'agm_supporters'::regclass
      AND contype = 'u'
      AND v_attnum = ANY(conkey)
  LOOP
    EXECUTE format('ALTER TABLE agm_supporters DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;

  -- agm_proxies
  SELECT attnum INTO v_attnum
  FROM pg_attribute
  WHERE attrelid = 'agm_proxies'::regclass AND attname = 'email';

  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'agm_proxies'::regclass
      AND contype = 'u'
      AND v_attnum = ANY(conkey)
  LOOP
    EXECUTE format('ALTER TABLE agm_proxies DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agm_supporters_email_meeting_ref_active_key
  ON agm_supporters (email, meeting_ref)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS agm_proxies_email_meeting_ref_active_key
  ON agm_proxies (email, meeting_ref)
  WHERE status = 'active';

COMMIT;

-- Verification. Read back, not described: paste this output back rather
-- than assuming the CREATE INDEX statements above did what they say.
-- Expect zero rows: no UNIQUE constraint on email remains outside the new
-- partial indexes.
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('agm_supporters'::regclass, 'agm_proxies'::regclass)
  AND contype = 'u'
  AND (
    (conrelid = 'agm_supporters'::regclass AND (SELECT attnum FROM pg_attribute WHERE attrelid = 'agm_supporters'::regclass AND attname = 'email') = ANY(conkey))
    OR
    (conrelid = 'agm_proxies'::regclass AND (SELECT attnum FROM pg_attribute WHERE attrelid = 'agm_proxies'::regclass AND attname = 'email') = ANY(conkey))
  );

-- Expect two rows, each with indexdef showing (email, meeting_ref) and the
-- WHERE (status = 'active') clause.
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE indexname IN ('agm_supporters_email_meeting_ref_active_key', 'agm_proxies_email_meeting_ref_active_key');
