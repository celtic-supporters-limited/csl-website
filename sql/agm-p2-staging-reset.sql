-- AGM Package 2 - staging reset
--
-- STAGING ONLY. NEVER RUN THIS ON PRODUCTION.
--
-- Staging agm_signatures data is fully disposable, so the clean path is to drop
-- and recreate rather than migrate. Production holds two real records and must
-- go through agm-p2-production-rename.sql instead.
--
-- Run this, then agm-p2-schema.sql.

DROP TABLE IF EXISTS agm_signatures         CASCADE;
DROP TABLE IF EXISTS agm_supporters         CASCADE;
DROP TABLE IF EXISTS agm_signatures_pre_p2  CASCADE;
DROP TABLE IF EXISTS agm_p2_preserve_log    CASCADE;

-- Versions are dropped too so the rehearsal starts from a known state. On
-- production this table must survive, which is why it is not in the rename or
-- preserve scripts.
DROP TABLE IF EXISTS agm_resolution_versions CASCADE;
