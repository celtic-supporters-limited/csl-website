-- Add subscription_start_date to members table.
-- Stores the date the member first began their CSL subscription,
-- irrespective of platform (WordPress legacy or new platform).
--
-- Population:
--   New platform:   set at checkout.session.completed via Stripe subscription.start_date
--   WP legacy:      set during migration (csl-migration scripts read from WP CSV)
--   Backfill:       upload-wp-snapshot route updates existing rows where null,
--                   matching by email from the WP export

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS subscription_start_date timestamptz;
