-- AGM Package 2 - requisition capture schema
-- Run in Supabase Dashboard > SQL Editor.
--
-- STAGING: safe to run as-is. Drops and recreates agm_signatures.
-- PRODUCTION: do NOT run the DROP at the top until the two real rows have been
-- exported. See sql/agm-p2-production-preserve.sql for the production path.
--
-- Creates:
--   agm_resolution_versions  append-only resolution wording, one current row
--   agm_signatures           rebuilt to the director brief Section 3.1
--   agm_supporters           non-shareholders, who cannot sign the requisition
--
-- Seeds the three config option lists and the IP capture flag.

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
-- Staging only. On production this DROP must not run: see the production script.

DROP TABLE IF EXISTS agm_signatures;

CREATE TABLE agm_signatures (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  full_name              TEXT NOT NULL,
  -- Four discrete address fields. The previous single textarea could not be
  -- reconciled against Celtic's share register.
  address_line_1         TEXT,
  address_line_2         TEXT,
  address_town           TEXT,
  address_postcode       TEXT,
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

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
-- Posture preserved from the previous schema: insert only for anon and
-- authenticated, no select, update or delete policy, so no one can read another
-- signatory's details with a public key. All reads go through the service-role
-- client behind an is_admin guard.

ALTER TABLE agm_signatures          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agm_supporters          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agm_resolution_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agm_signatures_insert ON agm_signatures;
CREATE POLICY agm_signatures_insert ON agm_signatures
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS agm_supporters_insert ON agm_supporters;
CREATE POLICY agm_supporters_insert ON agm_supporters
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Versions carry no personal data and the current wording is public once
-- signing opens, but reads still go through the service-role client.

GRANT ALL    ON TABLE agm_signatures          TO service_role;
GRANT ALL    ON TABLE agm_supporters          TO service_role;
GRANT ALL    ON TABLE agm_resolution_versions TO service_role;
GRANT INSERT ON TABLE agm_signatures          TO anon, authenticated;
GRANT INSERT ON TABLE agm_supporters          TO anon, authenticated;

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
