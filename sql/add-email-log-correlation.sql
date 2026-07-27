-- Adds a Stripe event correlation key to email_log so a webhook retry
-- (Stripe resends on any non-200 response) does not send the same
-- cancellation email twice.
--
-- Nullable and only populated by the new cancellation emails for now —
-- existing email types (welcome, payment_failed, magic_link, etc.) keep
-- writing NULL. Postgres treats NULLs as distinct under a UNIQUE
-- constraint, so this is non-breaking for every existing call site.
-- Retrofitting the correlation key to other email types is a separate,
-- later piece of work — not part of this migration.

ALTER TABLE email_log ADD COLUMN IF NOT EXISTS stripe_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS email_log_type_event_unique
  ON email_log (email_type, stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- Found while pre-flighting this migration on staging: service_role has no
-- SELECT or INSERT grant on email_log at all (permission denied, code 42501).
-- add-email-log.sql never granted it explicitly and relied on default
-- privileges, which staging apparently didn't inherit. This means every
-- fire-and-forget logEmailSend() call — welcome, payment_failed, magic_link,
-- password_reset, share_tracing, proxy, card_expiry, monitoring_digest,
-- backup — has likely been silently failing on staging since the table was
-- created (Resend sends themselves are unaffected; only the log rows never
-- wrote). Status on production is unknown — this grant is safe to run there
-- regardless, and worth confirming afterward via the Operations page's daily
-- email count.
GRANT SELECT, INSERT ON public.email_log TO service_role;
