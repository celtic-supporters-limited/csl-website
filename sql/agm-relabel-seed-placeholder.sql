-- AGM admin redesign - relabel the seeded not-yet-final wording
--
-- Corrected version. The first attempt at this script assumed
-- sql/agm-p3-amend-editable-label.sql had already been run, carving
-- version_label out of the immutability trigger. It had not: the trigger
-- still deployed is the original agm_resolution_versions_no_edit from
-- sql/agm-p2-schema.sql, which blocks version_label along with everything
-- else, and the UPDATE below failed with exactly that error.
--
-- This version does not depend on that amendment, and deliberately does not
-- run it either. The admin redesign removed the inline label-edit feature
-- entirely - there is no UI path left that needs version_label to be
-- generally mutable, and permanently loosening the trigger for a feature
-- that no longer exists would be widening scope, not fixing the one label
-- that is wrong. Instead this script disables the trigger, makes the one
-- correction, and re-enables it in the same transaction - immutability is
-- intact before this runs and intact after, for every row and every column,
-- including this one, going forward.
--
-- Safe on staging and production, and safe to run more than once: matched by
-- created_by, and re-running finds nothing left to change.

BEGIN;

ALTER TABLE agm_resolution_versions DISABLE TRIGGER agm_resolution_versions_no_edit;

UPDATE agm_resolution_versions
SET version_label = 'Not yet final (pre-solicitor)'
WHERE created_by IN ('AGM P2 migration', 'AGM P3 migration')
  AND is_placeholder = true;

ALTER TABLE agm_resolution_versions ENABLE TRIGGER agm_resolution_versions_no_edit;

COMMIT;

-- Expect one row, label updated, everything else unchanged.
SELECT id, version_label, is_placeholder, is_current, created_by
FROM agm_resolution_versions
WHERE created_by IN ('AGM P2 migration', 'AGM P3 migration')
  AND is_placeholder = true;

-- Confirm immutability actually came back on: this must fail with
-- "version_label is immutable", the same error the first attempt hit, or the
-- trigger was not correctly re-enabled above.
DO $$
BEGIN
  UPDATE agm_resolution_versions
  SET version_label = 'trigger re-enable check - should never be seen'
  WHERE created_by IN ('AGM P2 migration', 'AGM P3 migration')
    AND is_placeholder = true;
  RAISE EXCEPTION 'Trigger did not re-enable: the check update above should have been blocked and was not.';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%version_label is immutable%' THEN
      RAISE NOTICE 'Trigger re-enabled correctly: % ', SQLERRM;
    ELSE
      RAISE;
    END IF;
END $$;
