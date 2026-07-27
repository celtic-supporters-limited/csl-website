-- Fixes a real bug found while building the pending-cancellation feature:
-- member_events.stripe_event_id had a UNIQUE constraint on that column
-- ALONE (sql/add-member-events.sql), intended to stop a Stripe webhook
-- retry from duplicating a log row. Every existing webhook branch only
-- ever wrote one member_events row per event, so this never surfaced.
--
-- The new customer.subscription.updated pending-cancellation code writes
-- TWO rows per webhook delivery — the existing generic "subscription.updated"
-- row (unconditional, every update) plus a new specific "cancellation.pending"
-- or "cancellation.reversed" row, both carrying the same stripe_event_id.
-- The second insert collided with the first and was silently swallowed by
-- logMemberEvent()'s existing 23505-duplicate handling (lib/member-events.ts)
-- — which is correct behaviour for a genuine Stripe retry, wrong for two
-- distinct event_types sharing one Stripe event ID by design.
--
-- Replaces the single-column uniqueness with (event_type, stripe_event_id),
-- matching the pattern already used for email_log
-- (sql/add-email-log-correlation.sql) — still prevents a true webhook
-- retry from duplicating any one specific event_type/event_id pair, while
-- allowing multiple distinct event_types to log against the same delivery.

ALTER TABLE member_events DROP CONSTRAINT IF EXISTS member_events_stripe_event_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS member_events_type_event_unique
  ON member_events (event_type, stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
