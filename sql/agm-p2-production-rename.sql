-- AGM Package 2 - production step 1, rename the existing table
--
-- PRODUCTION ONLY. Do not run on staging, which uses agm-p2-staging-reset.sql.
--
-- DO NOT RUN THIS UNTIL THE TWO REAL ROWS HAVE BEEN EXPORTED TO A FILE HELD
-- OUTSIDE THE REPOSITORY.
--
-- Renames rather than drops, so the original rows remain on disk under a new
-- name until the preserve step has been verified. Nothing is destroyed here.
--
-- Production order:
--   1. export the two real rows
--   2. this file
--   3. agm-p2-schema.sql
--   4. agm-p2-production-preserve.sql
--   5. verify, then drop agm_signatures_pre_p2 by hand once satisfied

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agm_signatures_pre_p2'
  ) THEN
    RAISE EXCEPTION 'agm_signatures_pre_p2 already exists. Refusing to rename twice.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agm_signatures'
  ) THEN
    RAISE EXCEPTION 'agm_signatures not found. Nothing to rename.';
  END IF;

  ALTER TABLE agm_signatures RENAME TO agm_signatures_pre_p2;
  RAISE NOTICE 'Renamed agm_signatures to agm_signatures_pre_p2. Now run agm-p2-schema.sql.';
END;
$$;

SELECT count(*) AS preserved_source_rows FROM agm_signatures_pre_p2;
