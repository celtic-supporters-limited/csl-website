-- AGM Package 3 - staging cleanup
--
-- STAGING ONLY. NEVER RUN ON PRODUCTION.
--
-- Removes the throwaway resolution version created during Package 2 manual
-- form testing (version_label 'Staging test wording (P2 form check)',
-- created_by 'staging form check'). It predates declaration_text and
-- consent_text and is referenced by no signature, so it cannot be carried
-- forward into the Package 3 shape. Production never had this row - it was
-- created directly on staging to exercise the Package 2 signing form.
--
-- Kept in its own file rather than folded into agm-p3-resolution-content.sql,
-- which runs on both staging and production: a staging-only deletion embedded
-- in a script that also runs on production is safe right up until someone
-- runs the wrong file at the wrong time. Same pattern as
-- agm-p2-staging-reset.sql.
--
-- Run this first, then agm-p3-resolution-content.sql, so staging starts from
-- the same single-placeholder shape production already has.

DO $$
DECLARE
  v_referenced INTEGER;
BEGIN
  SELECT count(*) INTO v_referenced
  FROM agm_signatures s
  JOIN agm_resolution_versions v ON v.id = s.resolution_version_id
  WHERE v.created_by = 'staging form check';

  IF v_referenced > 0 THEN
    RAISE EXCEPTION
      'Refusing to delete: % signature(s) reference the staging test version. Investigate before proceeding.',
      v_referenced;
  END IF;
END $$;

DELETE FROM agm_resolution_versions
WHERE created_by = 'staging form check'
  AND is_placeholder = false;

-- Should show exactly one row: the real placeholder, matching production.
SELECT id, version_label, is_placeholder, is_current FROM agm_resolution_versions;
