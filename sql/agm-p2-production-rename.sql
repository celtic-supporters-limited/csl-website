-- AGM Package 2 - step 1, rename the existing table out of the way
--
-- DO NOT RUN THIS AGAINST PRODUCTION UNTIL THE TWO REAL ROWS HAVE BEEN EXPORTED
-- TO A FILE HELD OUTSIDE THE REPOSITORY.
--
-- Rehearsed on staging first. Sequence, identical on both:
--   staging     agm-p2-staging-reset.sql -> agm-p2-rehearsal-seed.sql -> THIS
--   production  (table already exists)                                -> THIS
--   then        agm-p2-schema.sql -> agm-p2-production-preserve.sql
--
-- Renames rather than drops, so the original rows stay on disk under a new name
-- until the preserve step has been verified. Nothing is destroyed here.
--
-- WHY THIS SCRIPT IS MORE THAN ONE STATEMENT
--
-- ALTER TABLE ... RENAME moves the table only. Constraints and indexes keep
-- their original names, and index names are unique per schema, not per table.
-- So after a bare rename the old table still owns agm_signatures_pkey and
-- agm_signatures_email_key, and agm-p2-schema.sql aborts partway through when
-- it tries to create indexes with those names, leaving the database with the
-- table renamed and no replacement. Everything is renamed together here.
--
-- CHECK constraints are scoped per table in pg_constraint and would not
-- collide, but they are renamed too so the old table reads consistently.
--
-- Names are discovered rather than hardcoded, so this works whatever
-- PostgreSQL auto-generated on the original table.

DO $$
DECLARE
  r RECORD;
  v_rows INTEGER;
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

  SELECT count(*) INTO v_rows FROM agm_signatures;
  RAISE NOTICE 'Renaming agm_signatures (% row(s)) to agm_signatures_pre_p2.', v_rows;

  ALTER TABLE agm_signatures RENAME TO agm_signatures_pre_p2;

  -- Constraints first. Renaming a PRIMARY KEY or UNIQUE constraint also renames
  -- its backing index, which is the collision that matters.
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'agm_signatures_pre_p2'::regclass
      AND conname LIKE 'agm\_signatures\_%'
  LOOP
    EXECUTE format(
      'ALTER TABLE agm_signatures_pre_p2 RENAME CONSTRAINT %I TO %I',
      r.conname,
      overlay(r.conname placing 'agm_signatures_pre_p2_' from 1 for length('agm_signatures_'))
    );
    RAISE NOTICE '  constraint % renamed', r.conname;
  END LOOP;

  -- Any remaining indexes that are not constraint-backed.
  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'agm_signatures_pre_p2'
      AND indexname LIKE 'agm\_signatures\_%'
  LOOP
    EXECUTE format(
      'ALTER INDEX %I RENAME TO %I',
      r.indexname,
      overlay(r.indexname placing 'agm_signatures_pre_p2_' from 1 for length('agm_signatures_'))
    );
    RAISE NOTICE '  index % renamed', r.indexname;
  END LOOP;

  -- The old table keeps the public INSERT grant it was created with. It is
  -- about to be superseded and should not stay writable from a public key
  -- while it waits to be dropped.
  REVOKE INSERT ON TABLE agm_signatures_pre_p2 FROM anon, authenticated;

  RAISE NOTICE 'Rename complete. Now run agm-p2-schema.sql.';
END;
$$;

-- Nothing left in the schema namespace that agm-p2-schema.sql will try to claim.
SELECT
  (SELECT count(*) FROM agm_signatures_pre_p2) AS preserved_source_rows,
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname = 'public' AND indexname LIKE 'agm\_signatures\_%'
       AND indexname NOT LIKE 'agm\_signatures\_pre\_p2\_%') AS colliding_index_names;
