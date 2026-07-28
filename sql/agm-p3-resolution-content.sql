-- AGM Package 3 - resolution content and meeting scoping
--
-- Run on staging after agm-p3-staging-cleanup.sql, then on production
-- unchanged. Identical script both times.
--
-- Adds declaration_text, consent_text and supporting_statement to
-- agm_resolution_versions, so a signature binds to the complete signable
-- page, not the resolution body alone. Adds meeting_ref to
-- agm_resolution_versions, agm_signatures and agm_supporters, and
-- current_meeting_ref to site_config, so a second AGM is a config change
-- rather than a migration against real signature records.
--
-- WHY DELETE AND RE-SEED RATHER THAN BACKFILL
--
-- declaration_text and consent_text are real legal content with no sensible
-- default. Backfilling an existing row and then adding NOT NULL means
-- writing migration logic against agm_resolution_versions and reasoning
-- about the immutability trigger mid-change. Instead: assert that nothing
-- yet references any version, delete the table's contents, add the columns
-- NOT NULL to a provably empty table, then insert one fresh placeholder.
-- Nothing is migrated, because nothing has signed against anything yet.
--
-- The assertion below is the only thing standing between this script and a
-- real signed record. It is checked, not assumed, and it fails loudly. On
-- production the two preserved pre_rebuild rows are expected to carry
-- resolution_version_id = NULL (confirmed during the Package 2 migration),
-- so the assertion should pass there for the same reason it passes on
-- staging.
--
-- Whole script runs as one transaction: the assertion, the delete, both
-- ALTERs, the trigger replacement and the re-seed either all happen or none
-- do.

BEGIN;

DO $$
DECLARE
  v_referenced INTEGER;
BEGIN
  SELECT count(*) INTO v_referenced
  FROM agm_signatures
  WHERE resolution_version_id IS NOT NULL;

  IF v_referenced > 0 THEN
    RAISE EXCEPTION
      'Refusing to delete agm_resolution_versions: % signature(s) reference a version. This script only runs before any signature has been recorded against a real version. A nonzero count here means something has signed - stop and investigate rather than proceeding.',
      v_referenced;
  END IF;
END $$;

-- Nothing references any version. Safe to clear the catalogue and rebuild it
-- with the columns required from the start.
DELETE FROM agm_resolution_versions;

ALTER TABLE agm_resolution_versions ADD COLUMN declaration_text TEXT NOT NULL;
ALTER TABLE agm_resolution_versions ADD COLUMN consent_text TEXT NOT NULL;
-- Nullable: whether the section 314 supporting statement appears at all has
-- not been decided. See docs/agm/CSL_AGM_Package3_ResolutionContent_ClaudeCode_Prompt.md
-- section 5.
ALTER TABLE agm_resolution_versions ADD COLUMN supporting_statement TEXT;

-- Meeting scoping. DEFAULT means every existing and future row is populated
-- with no application code change: the point is that this changes no
-- behaviour while there is one meeting.
ALTER TABLE agm_resolution_versions ADD COLUMN meeting_ref TEXT NOT NULL DEFAULT '2026-AGM';
ALTER TABLE agm_signatures          ADD COLUMN meeting_ref TEXT NOT NULL DEFAULT '2026-AGM';
ALTER TABLE agm_supporters          ADD COLUMN meeting_ref TEXT NOT NULL DEFAULT '2026-AGM';

-- Extend the immutability trigger to cover every column added above. Content
-- is immutable from creation, always, regardless of whether signatures
-- exist, because a change of wording or of meeting is a new version, not an
-- edit. A column left out of this function is silently mutable, which
-- defeats the whole design. is_current stays excluded: it is a pointer, not
-- content, and moving it does not change what any signatory agreed to.
CREATE OR REPLACE FUNCTION agm_resolution_versions_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.body                 IS DISTINCT FROM OLD.body                 THEN RAISE EXCEPTION 'agm_resolution_versions.body is immutable; create a new version instead'; END IF;
  IF NEW.version_label         IS DISTINCT FROM OLD.version_label        THEN RAISE EXCEPTION 'agm_resolution_versions.version_label is immutable; create a new version instead'; END IF;
  IF NEW.is_placeholder        IS DISTINCT FROM OLD.is_placeholder       THEN RAISE EXCEPTION 'agm_resolution_versions.is_placeholder is immutable; create a new version instead'; END IF;
  IF NEW.declaration_text      IS DISTINCT FROM OLD.declaration_text     THEN RAISE EXCEPTION 'agm_resolution_versions.declaration_text is immutable; create a new version instead'; END IF;
  IF NEW.consent_text          IS DISTINCT FROM OLD.consent_text         THEN RAISE EXCEPTION 'agm_resolution_versions.consent_text is immutable; create a new version instead'; END IF;
  IF NEW.supporting_statement  IS DISTINCT FROM OLD.supporting_statement THEN RAISE EXCEPTION 'agm_resolution_versions.supporting_statement is immutable; create a new version instead'; END IF;
  IF NEW.meeting_ref           IS DISTINCT FROM OLD.meeting_ref          THEN RAISE EXCEPTION 'agm_resolution_versions.meeting_ref is immutable; create a new version instead'; END IF;
  IF NEW.id                   IS DISTINCT FROM OLD.id                   THEN RAISE EXCEPTION 'agm_resolution_versions.id is immutable'; END IF;
  IF NEW.created_at           IS DISTINCT FROM OLD.created_at           THEN RAISE EXCEPTION 'agm_resolution_versions.created_at is immutable'; END IF;
  IF NEW.created_by           IS DISTINCT FROM OLD.created_by           THEN RAISE EXCEPTION 'agm_resolution_versions.created_by is immutable'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fresh placeholder. declaration_text and consent_text carry drafted wording
-- in the correct section 338 frame, clearly marked unapproved - the point of
-- this package is to make the solicitor's eventual answer a data change, not
-- a rebuild. supporting_statement stays null: whether it is shown at all is
-- undecided, and leaving it null here is the seeded state the page is built
-- to render correctly, not a gap.
INSERT INTO agm_resolution_versions
  (body, declaration_text, consent_text, supporting_statement, is_placeholder, is_current, created_by)
VALUES (
  'PLACEHOLDER - THIS IS NOT THE RESOLUTION. The resolution wording is with CSL''s solicitor and has not been settled. No signature may be collected against this text. Use the admin Version Management page to create and activate the approved wording once it arrives.',
  'DRAFT - NOT APPROVED BY THE SOLICITOR. I am a member of Celtic plc. Under section 338 of the Companies Act 2006 I require the company to give notice of the resolution set out above to members entitled to receive notice of the next Annual General Meeting.',
  'DRAFT - NOT APPROVED BY THE SOLICITOR. I consent to Celtic Supporters Limited holding the details I have given for the purpose of this requisition, and I understand that my name and address will be provided to Celtic plc as part of the request. See the privacy policy.',
  NULL,
  TRUE,
  TRUE,
  'AGM P3 migration'
);

INSERT INTO site_config (key, value, updated_at)
VALUES ('current_meeting_ref', '2026-AGM', NOW())
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- Verification. Expect exactly one row: the placeholder, both new text
-- columns populated, supporting_statement null, meeting_ref the default.
SELECT id, version_label, is_placeholder, is_current, meeting_ref,
       declaration_text IS NOT NULL AS has_declaration,
       consent_text     IS NOT NULL AS has_consent,
       supporting_statement
FROM agm_resolution_versions;

SELECT key, value FROM site_config WHERE key = 'current_meeting_ref';

-- Confirm the new columns exist with the right defaults on the other two
-- tables and that existing rows were populated by the DEFAULT, not left null.
SELECT count(*) AS null_meeting_ref_signatures
FROM agm_signatures WHERE meeting_ref IS NULL;

SELECT count(*) AS null_meeting_ref_supporters
FROM agm_supporters WHERE meeting_ref IS NULL;
