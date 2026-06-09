-- Supports self-service email change flow.
-- Set when a member initiates an email change in the portal Edit Profile tab.
-- Cleared once the confirmation link is clicked and the auth callback has
-- updated both members.email and the Stripe customer record.
ALTER TABLE members ADD COLUMN IF NOT EXISTS pending_email text;
