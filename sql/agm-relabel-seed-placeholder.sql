-- AGM admin redesign - relabel the seeded not-yet-final wording
--
-- Safe on staging and production. Relabels only, and version_label is the
-- one column the immutability trigger already permits to change (see
-- sql/agm-p3-amend-editable-label.sql) - nothing about what a signature is
-- evidence of moves.
--
-- The row seeded by sql/agm-p3-resolution-content.sql carries the label
-- "Placeholder (pre-solicitor)". The admin redesign removes the word
-- "placeholder" from the interface entirely - it is now a checkbox, "This
-- wording is final and signing may open" - but this one row's label is data,
-- not code, and nothing in the redesign touched it. It only surfaces once
-- something else becomes current and this row drops into the Wording
-- History disclosure, which is why it was not caught by reading the app - it
-- has to be seen in that state to notice.
--
-- Matched by created_by rather than the current label, so this is safe to
-- run more than once and safe even if the label has already changed.

UPDATE agm_resolution_versions
SET version_label = 'Not yet final (pre-solicitor)'
WHERE created_by IN ('AGM P2 migration', 'AGM P3 migration')
  AND is_placeholder = true;

-- Expect one row, label updated, everything else unchanged.
SELECT id, version_label, is_placeholder, is_current, created_by
FROM agm_resolution_versions
WHERE created_by IN ('AGM P2 migration', 'AGM P3 migration')
  AND is_placeholder = true;
