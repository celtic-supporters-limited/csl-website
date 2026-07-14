-- AGM Resolution Signatures
-- Run in Supabase Dashboard > SQL Editor

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

-- Public INSERT only — no authenticated user can read other signatories
CREATE POLICY "agm_signatures_insert" ON agm_signatures
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- SELECT / UPDATE / DELETE restricted to service role only (no policy = blocked)

-- Grant table-level privileges (SQL editor does not auto-grant unlike the table editor)
GRANT ALL ON TABLE agm_signatures TO service_role;
GRANT INSERT ON TABLE agm_signatures TO anon, authenticated;

-- Add resolution_target to site_config (configurable without a code deployment)
INSERT INTO site_config (key, value, updated_at)
VALUES ('resolution_target', '100', NOW())
ON CONFLICT (key) DO NOTHING;
