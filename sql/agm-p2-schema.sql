-- AGM Package 2 - requisition capture schema
-- Run in Supabase Dashboard > SQL Editor.
--
-- Creates tables only. Destroys nothing, so it is safe on both staging and
-- production. Ordering:
--
--   STAGING    1. agm-p2-staging-reset.sql   (drops, staging only)
--              2. this file
--              3. agm-p2-rehearsal-seed.sql  (synthetic old-shaped rows)
--              4. agm-p2-production-preserve.sql   (rehearsal of the real run)
--
--   PRODUCTION 1. export the two real rows first
--              2. agm-p2-production-rename.sql
--              3. this file
--              4. agm-p2-production-preserve.sql

-- ── 1. Resolution versions ───────────────────────────────────────────────────
-- Append only. A signature references the exact wording it was signed against,
-- so that if the solicitor amends the text we can still prove what each person
-- agreed to.

CREATE TABLE IF NOT EXISTS agm_resolution_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body           TEXT NOT NULL,
  version_label  TEXT NOT NULL,
  is_placeholder BOOLEAN NOT NULL DEFAULT FALSE,
  is_current     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exactly one current version at a time.
CREATE UNIQUE INDEX IF NOT EXISTS agm_resolution_versions_one_current
  ON agm_resolution_versions (is_current) WHERE is_current;

-- Content is immutable from creation, whether or not anyone has signed it yet.
-- Append only means the wording is never edited: a change is a new row. Only
-- is_current may flip, because it is a pointer, not content, and moving it does
-- not change what any signatory agreed to.
CREATE OR REPLACE FUNCTION agm_resolution_versions_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.body           IS DISTINCT FROM OLD.body           THEN
    RAISE EXCEPTION 'agm_resolution_versions.body is immutable; create a new version instead';
  END IF;
  IF NEW.version_label  IS DISTINCT FROM OLD.version_label  THEN
    RAISE EXCEPTION 'agm_resolution_versions.version_label is immutable; create a new version instead';
  END IF;
  IF NEW.is_placeholder IS DISTINCT FROM OLD.is_placeholder THEN
    RAISE EXCEPTION 'agm_resolution_versions.is_placeholder is immutable; create a new version instead';
  END IF;
  IF NEW.id             IS DISTINCT FROM OLD.id             THEN
    RAISE EXCEPTION 'agm_resolution_versions.id is immutable';
  END IF;
  IF NEW.created_at     IS DISTINCT FROM OLD.created_at     THEN
    RAISE EXCEPTION 'agm_resolution_versions.created_at is immutable';
  END IF;
  IF NEW.created_by     IS DISTINCT FROM OLD.created_by     THEN
    RAISE EXCEPTION 'agm_resolution_versions.created_by is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agm_resolution_versions_no_edit ON agm_resolution_versions;
CREATE TRIGGER agm_resolution_versions_no_edit
  BEFORE UPDATE ON agm_resolution_versions
  FOR EACH ROW EXECUTE FUNCTION agm_resolution_versions_immutable();

-- Seed placeholder. The body states plainly what it is, so that if it ever
-- reaches a public page or an export the mistake is obvious rather than subtle.
INSERT INTO agm_resolution_versions (body, version_label, is_placeholder, is_current, created_by)
SELECT
  'PLACEHOLDER - THIS IS NOT THE RESOLUTION. The resolution wording is with CSL''s solicitor and has not been settled. No signature may be collected against this text. Package 3 replaces it with the approved wording as a new version.',
  'Placeholder (pre-solicitor)',
  TRUE, TRUE, 'AGM P2 migration'
WHERE NOT EXISTS (SELECT 1 FROM agm_resolution_versions);

-- ── 2. Signatures ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agm_signatures (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  full_name              TEXT NOT NULL,
  -- Four discrete address fields. The previous single textarea could not be
  -- reconciled against Celtic's share register.
  address_line_1         TEXT,
  address_line_2         TEXT,
  address_town           TEXT,
  address_postcode       TEXT,
  -- The original single-blob address, populated only for rows preserved from
  -- the pre-rebuild schema. It cannot be split reliably, and discarding the
  -- only address we hold for a real signatory would lose data.
  legacy_postal_address  TEXT,

  email                  TEXT NOT NULL UNIQUE,

  how_held               TEXT NOT NULL CHECK (how_held IN ('direct', 'nominee')),
  -- Mandatory for direct holders, enforced in the API. Nominee holders do not
  -- have one.
  computershare_srn      TEXT,
  nominee_platform       TEXT,
  nominee_platform_other TEXT,

  year_of_purchase       TEXT,
  -- Capture only. Not the basis for any share count CSL asserts publicly.
  -- Exact holdings come from the share register in Package 8, not from what
  -- people remember.
  shares_held            TEXT,
  share_class            TEXT CHECK (share_class IN ('ORD', 'CCP', 'BOTH')),

  -- Three discrete ticks, each stored as submitted rather than hardcoded.
  eligibility_confirmed  BOOLEAN,
  resolution_supported   BOOLEAN,
  consent_given          BOOLEAN NOT NULL,
  privacy_policy_version TEXT,

  resolution_version_id  UUID REFERENCES agm_resolution_versions(id) ON DELETE RESTRICT,

  signature_name         TEXT NOT NULL,
  signed_at              TIMESTAMPTZ NOT NULL,

  -- Captured only while agm_capture_signer_metadata is true. See lib/site-gates.ts.
  signer_ip              INET,
  signer_user_agent      TEXT,

  -- 'complete'    captured under the Package 2 schema
  -- 'pre_rebuild' preserved from the old schema, missing required fields,
  --               excluded from the qualifying count toward 100
  capture_status         TEXT NOT NULL DEFAULT 'complete'
                           CHECK (capture_status IN ('complete', 'pre_rebuild')),

  -- Derived tags. Counting logic is unchanged: only 'direct-registered' counts
  -- toward the 100. Non-shareholders are rejected outright and live in
  -- agm_supporters, so that tag value no longer exists here.
  shareholder_tag        TEXT NOT NULL CHECK (shareholder_tag IN ('direct-registered', 'nominee-platform')),
  member_tag             TEXT NOT NULL CHECK (member_tag IN ('member', 'non-member')),

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Completeness is enforced here, not only in the API, so that a later script,
  -- a future package or a manual insert cannot create a row that claims to be
  -- complete while missing the fields a lodgeable signature needs.
  --
  -- address_line_2 is deliberately excluded: the director brief marks it
  -- optional, and many valid addresses have no second line.
  CONSTRAINT agm_signatures_complete_is_complete CHECK (
    capture_status <> 'complete' OR (
      address_line_1         IS NOT NULL AND
      address_town           IS NOT NULL AND
      address_postcode       IS NOT NULL AND
      share_class            IS NOT NULL AND
      eligibility_confirmed  IS NOT NULL AND
      resolution_supported   IS NOT NULL AND
      privacy_policy_version IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS agm_signatures_tag_status
  ON agm_signatures (shareholder_tag, capture_status);

-- ── 3. Supporters ────────────────────────────────────────────────────────────
-- People who are not Celtic plc shareholders. They cannot sign a section 338
-- request, so they must not sit in the signature record, but the campaign
-- contact is worth keeping.

CREATE TABLE IF NOT EXISTS agm_supporters (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name              TEXT NOT NULL,
  email                  TEXT NOT NULL UNIQUE,
  consent_given          BOOLEAN NOT NULL,
  privacy_policy_version TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
--
-- agm_signatures and agm_supporters
--   Both are written from a public form, so both get the same posture:
--   INSERT only for anon and authenticated, and no SELECT, UPDATE or DELETE
--   policy, so neither role can read another person's details with a public
--   key. Every read goes through the service-role client behind an is_admin
--   guard (app/member-portal/admin/resolution/page.tsx) or a server component
--   (app/resolution/page.tsx).
--
-- agm_resolution_versions
--   Read through the service-role client only. app/resolution/page.tsx already
--   reads the current version that way, and Package 3 will do the same for
--   rendering and editing. It therefore gets NO anon or authenticated policy
--   and NO grant: RLS is on, no policy exists, and no privilege is granted, so
--   both layers deny. Writes are admin-only via the service role.
--
-- RLS is enabled on all three. None is left off, and none is left on with a
-- policy that silently permits nothing it should.

ALTER TABLE agm_signatures          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agm_supporters          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agm_resolution_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agm_signatures_insert ON agm_signatures;
CREATE POLICY agm_signatures_insert ON agm_signatures
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS agm_supporters_insert ON agm_supporters;
CREATE POLICY agm_supporters_insert ON agm_supporters
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Deliberately no policy on agm_resolution_versions.

GRANT ALL    ON TABLE agm_signatures          TO service_role;
GRANT ALL    ON TABLE agm_supporters          TO service_role;
GRANT ALL    ON TABLE agm_resolution_versions TO service_role;
GRANT INSERT ON TABLE agm_signatures          TO anon, authenticated;
GRANT INSERT ON TABLE agm_supporters          TO anon, authenticated;
-- Deliberately no grant to anon or authenticated on agm_resolution_versions.

-- ── 5. Config ────────────────────────────────────────────────────────────────
-- Option lists are JSON arrays so the real values can be dropped in without a
-- deploy. Read through the uncached helper in lib/site-gates.ts, so a change
-- takes effect immediately.

INSERT INTO site_config (key, value, updated_at) VALUES
  ('agm_nominee_platforms',
   '["Hargreaves Lansdown","AJ Bell","interactive investor","Halifax Share Dealing","Barclays Smart Investor","Fidelity","Charles Stanley Direct","iWeb","Lloyds Bank Share Dealing","Other"]',
   NOW()),
  ('agm_year_options',
   '["1994 or 1995 (flotation)","1996-1999","2000-2004","2005-2009","2010-2014","2015-2019","2020-2024","2025 or later","Not sure"]',
   NOW()),
  ('agm_share_bands',
   '["1-100","101-500","501-1,000","1,001-5,000","5,001-10,000","More than 10,000","Not sure"]',
   NOW()),
  ('agm_capture_signer_metadata', 'false', NOW()),
  ('privacy_policy_version', '2026-07', NOW())
ON CONFLICT (key) DO NOTHING;
