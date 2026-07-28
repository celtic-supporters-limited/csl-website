-- AGM Package 2 - rehearsal seed
--
-- STAGING ONLY. NEVER RUN THIS ON PRODUCTION.
--
-- Recreates the pre-Package-2 table as a faithful replica, under its real name
-- `agm_signatures`, so that the staging rehearsal runs the exact production
-- sequence:
--
--   staging     reset -> THIS FILE -> rename -> schema -> preserve
--   production           (already exists) -> rename -> schema -> preserve
--
-- The DDL below is copied from sql/add-agm-signatures.sql deliberately, rather
-- than paraphrased, so that PostgreSQL generates the same constraint and index
-- names production carries (agm_signatures_pkey, agm_signatures_email_key).
-- Those names are what the rename script has to deal with, so the rehearsal is
-- worthless if they differ.
--
-- Two synthetic rows matching the production pair: one shareholder, one
-- non-shareholder, each with a single postal_address blob, no share class and
-- no discrete ticks.

DROP TABLE IF EXISTS agm_signatures         CASCADE;
DROP TABLE IF EXISTS agm_signatures_pre_p2  CASCADE;
DROP TABLE IF EXISTS agm_p2_preserve_log    CASCADE;

CREATE TABLE agm_signatures (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name            TEXT NOT NULL,
  email                TEXT NOT NULL UNIQUE,
  postal_address       TEXT NOT NULL,
  is_shareholder       BOOLEAN NOT NULL,
  shareholder_type     TEXT CHECK (shareholder_type IN ('direct', 'nominee')),
  computershare_srn    TEXT,
  nominee_platform     TEXT,
  approximate_shares   INTEGER,
  typed_signature      TEXT NOT NULL,
  signature_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  declaration_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  shareholder_tag      TEXT NOT NULL CHECK (shareholder_tag IN ('direct-registered', 'nominee-platform', 'non-shareholder')),
  member_tag           TEXT NOT NULL CHECK (member_tag IN ('member', 'non-member')),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agm_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agm_signatures_insert" ON agm_signatures
  FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT ALL    ON TABLE agm_signatures TO service_role;
GRANT INSERT ON TABLE agm_signatures TO anon, authenticated;

INSERT INTO agm_signatures
  (full_name, email, postal_address, is_shareholder, shareholder_type,
   computershare_srn, nominee_platform, approximate_shares, typed_signature,
   signature_date, declaration_accepted, shareholder_tag, member_tag, created_at)
VALUES
  ('Rehearsal Shareholder',
   'rehearsal-shareholder@example.invalid',
   E'11 Rehearsal Street\nGlasgow\nG1 1AA',
   TRUE, 'direct', 'C0007654321', NULL, 250,
   'Rehearsal Shareholder', CURRENT_DATE - 3, TRUE,
   'direct-registered', 'member', NOW() - INTERVAL '3 days'),

  ('Rehearsal Supporter',
   'rehearsal-supporter@example.invalid',
   E'22 Rehearsal Avenue\nGlasgow\nG2 2BB',
   FALSE, NULL, NULL, NULL, NULL,
   'Rehearsal Supporter', CURRENT_DATE - 2, TRUE,
   'non-shareholder', 'member', NOW() - INTERVAL '2 days');

-- Confirm the names the rename script will have to move.
SELECT conname AS constraint_name
FROM pg_constraint
WHERE conrelid = 'agm_signatures'::regclass
ORDER BY conname;
