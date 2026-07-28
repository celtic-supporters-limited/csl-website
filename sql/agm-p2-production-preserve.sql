-- AGM Package 2 - preserve pre-rebuild records
--
-- Moves rows from agm_signatures_pre_p2 into the rebuilt tables:
--   shareholders     -> agm_signatures, capture_status = 'pre_rebuild'
--   non-shareholders -> agm_supporters
--
-- This is the script that runs against production. Staging rehearses the whole
-- production sequence, not just this step:
--
--   staging     reset -> rehearsal-seed -> rename -> schema -> THIS FILE
--   production  export -> rename -> schema -> THIS FILE
--
-- so the rename, the schema creation and this preserve have all been executed
-- in order before any of them touch the only copy of two real people's records.
--
-- Refuses to run twice. The guard is a log table, not a row count, so it holds
-- whatever the shape of the source data: a source containing only
-- non-shareholders would leave zero pre_rebuild rows behind, and a count-based
-- guard would happily run again.
--
-- Runs as a single DO block, so it either completes or leaves nothing behind.
--
-- Prerequisites: agm-p2-production-rename.sql and then agm-p2-schema.sql have
-- both been run, so agm_signatures_pre_p2 holds the old rows and a rebuilt
-- agm_signatures exists to receive them.

CREATE TABLE IF NOT EXISTS agm_p2_preserve_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_rows          INTEGER NOT NULL,
  signatures_inserted  INTEGER NOT NULL,
  supporters_inserted  INTEGER NOT NULL
);

-- Tables created in the SQL Editor are owned by postgres and carry no
-- privileges for service_role, so without this the log is unreadable by the
-- application and by any verification script. Same omission that leaves
-- backup_log unreadable and the operations report showing no backups.
-- Service-role only: an internal migration log, never read from a public key.
ALTER TABLE agm_p2_preserve_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE agm_p2_preserve_log TO service_role;

DO $$
DECLARE
  v_source_rows INTEGER;
  v_sig_count   INTEGER;
  v_sup_count   INTEGER;
  v_bad_rows    INTEGER;
BEGIN
  -- ── Guards ────────────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agm_signatures_pre_p2'
  ) THEN
    RAISE EXCEPTION
      'agm_signatures_pre_p2 not found. Run agm-p2-production-rename.sql (production) or agm-p2-rehearsal-seed.sql (staging) first.';
  END IF;

  IF EXISTS (SELECT 1 FROM agm_p2_preserve_log) THEN
    RAISE EXCEPTION
      'Preserve has already run (see agm_p2_preserve_log). Refusing to run twice.';
  END IF;

  SELECT count(*) INTO v_source_rows FROM agm_signatures_pre_p2;

  -- A shareholder with no how_held cannot satisfy the NOT NULL on the rebuilt
  -- table. Fail loudly rather than silently dropping someone's record.
  SELECT count(*) INTO v_bad_rows
  FROM agm_signatures_pre_p2
  WHERE is_shareholder AND shareholder_type IS NULL;

  IF v_bad_rows > 0 THEN
    RAISE EXCEPTION
      '% shareholder row(s) have no shareholder_type and cannot be mapped to how_held. Resolve manually before preserving.', v_bad_rows;
  END IF;

  -- ── Shareholders -> agm_signatures ────────────────────────────────────────
  -- Every field that exists is mapped across. The rest stay null, which the
  -- completeness CHECK permits precisely because capture_status is
  -- 'pre_rebuild'. These rows are excluded from the qualifying count toward
  -- 100: they were collected with no resolution version, so there is no way to
  -- prove what wording they supported.
  INSERT INTO agm_signatures (
    full_name, email, legacy_postal_address,
    how_held, computershare_srn, nominee_platform, shares_held,
    consent_given, signature_name, signed_at,
    resolution_version_id, capture_status, shareholder_tag, member_tag, created_at
  )
  SELECT
    p.full_name,
    p.email,
    p.postal_address,
    p.shareholder_type,
    p.computershare_srn,
    p.nominee_platform,
    p.approximate_shares::TEXT,
    p.declaration_accepted,
    p.typed_signature,
    COALESCE(p.signature_date::TIMESTAMPTZ, p.created_at, NOW()),
    NULL,                       -- no version existed when these were signed
    'pre_rebuild',
    p.shareholder_tag,
    p.member_tag,
    COALESCE(p.created_at, NOW())
  FROM agm_signatures_pre_p2 p
  WHERE p.is_shareholder
  ON CONFLICT (email) DO NOTHING;

  GET DIAGNOSTICS v_sig_count = ROW_COUNT;

  -- ── Non-shareholders -> agm_supporters ────────────────────────────────────
  -- They cannot support a section 338 request, so they do not belong in the
  -- signature record. The contact, consent and timestamp are kept.
  INSERT INTO agm_supporters (full_name, email, consent_given, privacy_policy_version, created_at)
  SELECT
    p.full_name,
    p.email,
    p.declaration_accepted,
    NULL,                       -- no policy version was recorded at the time
    COALESCE(p.created_at, NOW())
  FROM agm_signatures_pre_p2 p
  WHERE NOT p.is_shareholder
  ON CONFLICT (email) DO NOTHING;

  GET DIAGNOSTICS v_sup_count = ROW_COUNT;

  INSERT INTO agm_p2_preserve_log (source_rows, signatures_inserted, supporters_inserted)
  VALUES (v_source_rows, v_sig_count, v_sup_count);

  RAISE NOTICE 'Preserve complete: % source row(s), % signature(s), % supporter(s).',
    v_source_rows, v_sig_count, v_sup_count;
END;
$$;

-- Result, for the record.
SELECT * FROM agm_p2_preserve_log;
