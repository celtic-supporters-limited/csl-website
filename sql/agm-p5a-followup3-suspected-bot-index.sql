-- AGM Package 5a follow-up 3 - a suspected-bot row must not occupy a real
-- person's email slot
--
-- Gary's review: the partial unique indexes added in
-- sql/agm-p5a-followup-resign-after-void.sql and
-- sql/agm-p5a-followup2-supporters-proxies-resign.sql exclude withdrawn and
-- voided rows, but not suspected_bot rows, which are written with
-- status = 'active'. A bot submitting with a real person's email occupies
-- their slot; when that person later signs for real, they are rejected as
-- a duplicate, which reads to them as "you have already signed" - they
-- stop, and nobody finds out.
--
-- Fix: add AND suspected_bot = false to all three partial indexes. Same
-- discover-by-column approach as before, this time over pg_index rather
-- than pg_constraint, since these are plain unique indexes, not table
-- constraints - a partial UNIQUE INDEX created via CREATE UNIQUE INDEX has
-- no corresponding row in pg_constraint at all, so pg_constraint has
-- nothing to discover here. Finds every unique index on each table that
-- covers the email column, drops it, and recreates the equivalent index
-- with the added condition.
--
-- Safe to run as-is: narrowing a partial index's WHERE clause further
-- (fewer rows satisfy it) cannot make any existing row that was previously
-- fine now violate anything - it only excludes more rows from the
-- uniqueness check, never fewer. Idempotent.

BEGIN;

DO $$
DECLARE
  v_index RECORD;
  v_attnum INT;
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['agm_signatures', 'agm_supporters', 'agm_proxies']
  LOOP
    SELECT attnum INTO v_attnum
    FROM pg_attribute
    WHERE attrelid = v_table::regclass AND attname = 'email';

    FOR v_index IN
      SELECT ix.relname AS indexname
      FROM pg_index i
      JOIN pg_class ix ON ix.oid = i.indexrelid
      WHERE i.indrelid = v_table::regclass
        AND i.indisunique
        AND v_attnum = ANY(i.indkey)
    LOOP
      EXECUTE format('DROP INDEX %I', v_index.indexname);
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agm_signatures_email_meeting_ref_active_key
  ON agm_signatures (email, meeting_ref)
  WHERE status = 'active' AND suspected_bot = false;

CREATE UNIQUE INDEX IF NOT EXISTS agm_supporters_email_meeting_ref_active_key
  ON agm_supporters (email, meeting_ref)
  WHERE status = 'active' AND suspected_bot = false;

CREATE UNIQUE INDEX IF NOT EXISTS agm_proxies_email_meeting_ref_active_key
  ON agm_proxies (email, meeting_ref)
  WHERE status = 'active' AND suspected_bot = false;

COMMIT;

-- Verification. Read back, not described - paste this output rather than
-- assuming the CREATE INDEX statements above did what they say. Expect
-- three rows, each indexdef showing (email, meeting_ref) and a WHERE
-- clause with both status = 'active' and suspected_bot = false.
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE indexname IN (
  'agm_signatures_email_meeting_ref_active_key',
  'agm_supporters_email_meeting_ref_active_key',
  'agm_proxies_email_meeting_ref_active_key'
);
