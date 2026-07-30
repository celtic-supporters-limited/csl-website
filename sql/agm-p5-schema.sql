-- AGM Package 5 - proxy appointment instrument, suspected_bot flagging,
-- interest flow updates
--
-- Rehearse on staging first, then run unchanged on production, per the
-- brief's standing rule on rehearsing the exact sequence. Nothing here drops
-- or rewrites existing content: agm_signatures and agm_supporters each gain
-- one column with a default, agm_proxies is a new table, and
-- shareholder_cases gains two columns plus a targeted UPDATE of its existing
-- Proxy Assignment rows (leads, not signed instruments - see the note there).
--
-- ── 1. agm_proxies ───────────────────────────────────────────────────────────
-- New table, separate from shareholder_cases. An expression of interest is a
-- lead; an appointment is an instrument naming a specific person to act on a
-- member's behalf, and the two do not belong in the same table.
--
-- No version table and no immutability trigger, deliberately, unlike
-- agm_resolution_versions. Package 5's own brief is explicit that the
-- resolution's evidential weight does not carry across: a proxy is revocable
-- by the member at any time before the meeting, so "what was appointed" is a
-- mutable fact with history (see section 5a below), not a permanent record
-- that must never change. declaration_snapshot is a plain text column
-- capturing what the signatory saw, which is sufficient for that purpose.

CREATE TABLE IF NOT EXISTS agm_proxies (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Read live from current_meeting_ref at insert time, not left to a column
  -- default - a proxy is specific to one meeting, legally, and a future AGM
  -- must be a config change here exactly as it already is for agm_signatures.
  meeting_ref            TEXT NOT NULL,

  full_name              TEXT NOT NULL,
  address_line_1         TEXT NOT NULL,
  address_line_2         TEXT,
  address_town           TEXT NOT NULL,
  address_postcode       TEXT NOT NULL,

  email                  TEXT NOT NULL,

  how_held               TEXT NOT NULL CHECK (how_held IN ('direct', 'nominee')),
  -- Mandatory for direct holders, enforced in the API, matching the
  -- agm_signatures pattern - a direct holder with no SRN cannot be
  -- reconciled against the share register before lodgement.
  computershare_srn      TEXT,
  nominee_platform       TEXT,
  nominee_platform_other TEXT,

  shares_held            TEXT,
  share_class            TEXT,

  -- Server-set, never accepted from the request body. See lib/agm-appointee.ts
  -- and the API route - there is no code path that reads an appointee value
  -- from a client, so no validation is required to prevent one.
  appointee_name         TEXT NOT NULL,

  -- What the signatory actually saw at the moment of signing, copied in
  -- rather than referenced by id. A plain text column is enough: there is no
  -- version-management interface for it, and there does not need to be one.
  declaration_snapshot   TEXT NOT NULL,

  signature_name         TEXT NOT NULL,
  -- Server-generated. Any client-supplied value is ignored, matching
  -- agm_signatures.signed_at.
  signed_at              TIMESTAMPTZ NOT NULL,

  consent_given          BOOLEAN NOT NULL,
  privacy_policy_version TEXT NOT NULL,

  -- Default 'we-lodge': CSL lodges the block with Computershare. The only
  -- path built in Package 5. 'member-lodges' is a value this column can hold
  -- if the solicitor requires it later, not a path with any code behind it
  -- yet.
  lodgement_path         TEXT NOT NULL DEFAULT 'we-lodge',
  -- The nominee "I have sent this" confirmation. Null until a nominee holder
  -- ticks it; meaningless for direct holders.
  nominee_instruction_sent BOOLEAN,

  -- A member can revoke a proxy before the meeting - that is their right.
  -- Modelled as a status change, not a delete, so the evidence that a
  -- revocation happened is retained and CSL can show a registrar which
  -- appointments in a lodged block are no longer live.
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  revoked_at             TIMESTAMPTZ,
  revoked_reason         TEXT,

  -- Same shape as the resolution and supporter honeypot flag below - a row
  -- is written either way, so a real person's submission is a click away
  -- from being released rather than a reconstruction from a log line.
  suspected_bot          BOOLEAN NOT NULL DEFAULT FALSE,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite with meeting_ref, not email alone - the same fix applied to
  -- agm_signatures and agm_supporters in the gap-fill session. Someone who
  -- registers a proxy for 2026 must be able to register again for 2027.
  UNIQUE (email, meeting_ref)
);

CREATE INDEX IF NOT EXISTS agm_proxies_meeting_status ON agm_proxies (meeting_ref, status);

ALTER TABLE agm_proxies ENABLE ROW LEVEL SECURITY;

-- Same posture as agm_signatures and agm_supporters: public INSERT only, no
-- SELECT/UPDATE/DELETE policy for anon or authenticated, so a public key
-- cannot read another member's appointment. Every read and the revocation
-- update go through the service-role client behind an is_admin guard.
DROP POLICY IF EXISTS agm_proxies_insert ON agm_proxies;
CREATE POLICY agm_proxies_insert ON agm_proxies
  FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT ALL    ON TABLE agm_proxies TO service_role;
GRANT INSERT ON TABLE agm_proxies TO anon, authenticated;

-- ── 2. suspected_bot on the existing signature tables ───────────────────────
-- ADD COLUMN ... NOT NULL DEFAULT FALSE is metadata-only in modern Postgres -
-- it does not rewrite the table, so the two preserved production
-- shareholder rows on agm_signatures are not touched. Nothing else on either
-- table changes.

ALTER TABLE agm_signatures ADD COLUMN IF NOT EXISTS suspected_bot BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agm_supporters ADD COLUMN IF NOT EXISTS suspected_bot BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 3. Interest flow (shareholder_cases) ────────────────────────────────────
-- Three changes only, per the Package 5 brief: rename the case type so
-- nobody later mistakes an interest record for an appointment, store the
-- consent value rather than discarding it (audit Finding 5), and add
-- meeting_ref.
--
-- shareholder_cases is not append-only evidence of a signed instrument -
-- Share Tracing enquiries live in the same table, and a Proxy Interest row
-- is a lead, not something anyone signed. Renaming its case_type and
-- backfilling meeting_ref on existing rows is therefore a plain data
-- correction, not the kind of migration-against-real-instrument-records the
-- brief's "never write migration or backfill logic for AGM tables" rule
-- exists to prevent - that rule is about agm_signatures/agm_proxies/
-- agm_resolution_versions.

ALTER TABLE shareholder_cases ADD COLUMN IF NOT EXISTS consent_given          BOOLEAN;
ALTER TABLE shareholder_cases ADD COLUMN IF NOT EXISTS meeting_ref            TEXT;
ALTER TABLE shareholder_cases ADD COLUMN IF NOT EXISTS privacy_policy_version TEXT;

UPDATE shareholder_cases
SET case_type   = 'Proxy Interest',
    meeting_ref = (SELECT value FROM site_config WHERE key = 'current_meeting_ref')
WHERE case_type = 'Proxy Assignment';

-- ── 4. proxy_mode config ─────────────────────────────────────────────────────
-- Replaces the binary proxy_open gate. Three values: closed, interest,
-- appointment. Seeded closed - the safe default on both environments until
-- explicitly set otherwise. Old proxy_open key is left in place, unused; not
-- deleted, since removing a site_config row is not reversible from the
-- application and nothing reads it once the code stops checking it.

INSERT INTO site_config (key, value, updated_at)
VALUES ('proxy_mode', 'closed', NOW())
ON CONFLICT (key) DO NOTHING;

-- ── 5. Proxy declaration text ────────────────────────────────────────────────
-- No version table for the proxy, per the Package 5 brief - a single
-- config-driven string, copied verbatim into agm_proxies.declaration_snapshot
-- at signing time so each row keeps what that signatory actually saw even if
-- this value is edited later. TBD: public wording is a director decision and
-- has not been settled - Brian has not confirmed the appointment declaration
-- text. Replace this value once it is.

INSERT INTO site_config (key, value, updated_at)
VALUES (
  'proxy_declaration_text',
  'TBD - proxy appointment declaration wording, pending director approval. Placeholder only: do not rely on this text for a real appointment.',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- ── Verification ─────────────────────────────────────────────────────────────

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'agm_proxies'
ORDER BY ordinal_position;

SELECT count(*) AS proxy_interest_rows, count(*) FILTER (WHERE meeting_ref IS NULL) AS null_meeting_ref
FROM shareholder_cases WHERE case_type = 'Proxy Interest';

SELECT
  (SELECT column_default FROM information_schema.columns WHERE table_name='agm_signatures' AND column_name='suspected_bot') AS signatures_suspected_bot_default,
  (SELECT column_default FROM information_schema.columns WHERE table_name='agm_supporters' AND column_name='suspected_bot') AS supporters_suspected_bot_default;

SELECT key, value FROM site_config WHERE key IN ('proxy_mode', 'proxy_declaration_text');
