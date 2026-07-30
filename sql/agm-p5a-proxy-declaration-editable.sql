-- AGM Package 5a follow-up - make the proxy declaration editable
--
-- Gary's review: brief section 2c applies to the proxy declaration too, and
-- the earlier "leave it as config, document it in the runbook" answer is
-- withdrawn. It needs a Change wording action on the AGM Proxy admin page,
-- logged through agm_change_log like everything else.
--
-- The declaration lives in site_config, not an AGM record table - its
-- primary key is `key` (text), not `id` (uuid). agm_change_log.record_id was
-- declared UUID because every other table it logs against uses a uuid
-- primary key; site_config does not, so the column widens to TEXT. A uuid
-- value stored as text is unaffected - this only removes a restriction, it
-- does not change any existing row's value. table_name's CHECK constraint
-- gains 'site_config' as a fifth allowed value, keeping this one audit
-- trail rather than a second one just for config.
--
-- Safe to run as-is: widening a column type and adding an allowed value to a
-- CHECK constraint cannot invalidate any existing row.

BEGIN;

ALTER TABLE agm_change_log ALTER COLUMN record_id TYPE TEXT;

ALTER TABLE agm_change_log DROP CONSTRAINT IF EXISTS agm_change_log_table_name_check;
ALTER TABLE agm_change_log ADD CONSTRAINT agm_change_log_table_name_check
  CHECK (table_name IN (
    'agm_resolution_versions', 'agm_signatures', 'agm_supporters',
    'agm_proxies', 'shareholder_cases', 'site_config'
  ));

COMMIT;

-- Verification. Expect record_id = text, and the new constraint definition
-- to include site_config.
SELECT data_type FROM information_schema.columns
WHERE table_name = 'agm_change_log' AND column_name = 'record_id';

SELECT pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'agm_change_log'::regclass AND conname = 'agm_change_log_table_name_check';
