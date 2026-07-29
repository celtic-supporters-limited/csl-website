-- AGM admin redesign - relabel the seeded not-yet-final wording
--
-- REQUIRES sql/agm-p3-amend-editable-label.sql to have been run first. That
-- script removes version_label from the immutability trigger and leaves
-- body, declaration_text, consent_text, supporting_statement and
-- is_placeholder immutable and unconditional, exactly as before - a label is
-- auto-generated metadata nobody signs, so it never belonged under the same
-- lock as signed content. Without that script this UPDATE fails with
-- "version_label is immutable".
--
-- Safe on staging and production, and safe to run more than once: matched by
-- created_by, and re-running finds nothing left to change.

UPDATE agm_resolution_versions
SET version_label = 'Not yet final (pre-solicitor)'
WHERE created_by IN ('AGM P2 migration', 'AGM P3 migration')
  AND is_placeholder = true;

-- Expect one row, label updated, everything else unchanged.
SELECT id, version_label, is_placeholder, is_current, created_by
FROM agm_resolution_versions
WHERE created_by IN ('AGM P2 migration', 'AGM P3 migration')
  AND is_placeholder = true;
