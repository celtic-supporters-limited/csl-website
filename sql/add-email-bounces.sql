-- Tracks bounced emails for deliverability monitoring on the Operations page.
-- Populated by POST /api/webhooks/resend when Resend fires an email.bounced event.
-- Bounce rate = rows in this table (this month) / rows in email_log (this month).
--
-- RLS enabled with no policies for anon/authenticated —
-- service_role (used by the webhook route) bypasses RLS.

CREATE TABLE IF NOT EXISTS email_bounces (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bounced_at  timestamptz NOT NULL DEFAULT now(),
  to_email    text,
  resend_id   text
);

ALTER TABLE email_bounces ENABLE ROW LEVEL SECURITY;
