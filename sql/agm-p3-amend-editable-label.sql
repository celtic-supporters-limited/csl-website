-- AGM Package 3 amendment - make version_label editable.
--
-- version_label is metadata: nobody signs a label, and locking it under the
-- same trigger as body/declaration_text/consent_text/supporting_statement
-- means a typo in the label costs an entire new version. This drops
-- version_label from the immutability check only. Every other column stays
-- immutable, unconditionally, exactly as before - those are what a signature
-- is evidence of.
--
-- Safe to run at any time, including with real signatures on staging or
-- production: this only removes a restriction, it does not add one, and no
-- row's body/declaration_text/consent_text/supporting_statement/is_placeholder
-- is touched by running it.

CREATE OR REPLACE FUNCTION agm_resolution_versions_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.body                 IS DISTINCT FROM OLD.body                 THEN RAISE EXCEPTION 'agm_resolution_versions.body is immutable; create a new version instead'; END IF;
  IF NEW.is_placeholder        IS DISTINCT FROM OLD.is_placeholder       THEN RAISE EXCEPTION 'agm_resolution_versions.is_placeholder is immutable; create a new version instead'; END IF;
  IF NEW.declaration_text      IS DISTINCT FROM OLD.declaration_text     THEN RAISE EXCEPTION 'agm_resolution_versions.declaration_text is immutable; create a new version instead'; END IF;
  IF NEW.consent_text          IS DISTINCT FROM OLD.consent_text         THEN RAISE EXCEPTION 'agm_resolution_versions.consent_text is immutable; create a new version instead'; END IF;
  IF NEW.supporting_statement  IS DISTINCT FROM OLD.supporting_statement THEN RAISE EXCEPTION 'agm_resolution_versions.supporting_statement is immutable; create a new version instead'; END IF;
  IF NEW.meeting_ref           IS DISTINCT FROM OLD.meeting_ref          THEN RAISE EXCEPTION 'agm_resolution_versions.meeting_ref is immutable; create a new version instead'; END IF;
  IF NEW.id                   IS DISTINCT FROM OLD.id                   THEN RAISE EXCEPTION 'agm_resolution_versions.id is immutable'; END IF;
  IF NEW.created_at           IS DISTINCT FROM OLD.created_at           THEN RAISE EXCEPTION 'agm_resolution_versions.created_at is immutable'; END IF;
  IF NEW.created_by           IS DISTINCT FROM OLD.created_by           THEN RAISE EXCEPTION 'agm_resolution_versions.created_by is immutable'; END IF;
  -- version_label deliberately absent: metadata, editable via
  -- POST /api/admin/resolution-versions/relabel. is_current was already
  -- excluded before this change (a pointer, not content).
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Verification. Expect this to succeed (no exception) and to leave every
-- other column on the probed row unchanged.
DO $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM agm_resolution_versions ORDER BY created_at LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'No rows in agm_resolution_versions to verify against - skipping.';
  ELSE
    UPDATE agm_resolution_versions SET version_label = version_label WHERE id = v_id;
    RAISE NOTICE 'version_label update on % succeeded - trigger no longer blocks it.', v_id;
  END IF;
END $$;
