-- AGM Package 2 - grant read access to the preserve log
--
-- Only needed on a database where agm-p2-production-preserve.sql was run before
-- the GRANT was added to it, which is staging as of the first rehearsal. A
-- fresh run of the preserve script already includes this.
--
-- Safe to run repeatedly. Does not touch any data and does not trip the
-- preserve script's run-once guard, which is why it is a separate file: the
-- guard raises an exception, and an exception would roll back a GRANT issued in
-- the same script.
--
-- Background: tables created in the Supabase SQL Editor are owned by postgres
-- and carry no privileges for service_role. Without an explicit GRANT the
-- application cannot read them, and the failure is silent at the API layer.

ALTER TABLE agm_p2_preserve_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE agm_p2_preserve_log TO service_role;

SELECT * FROM agm_p2_preserve_log;
