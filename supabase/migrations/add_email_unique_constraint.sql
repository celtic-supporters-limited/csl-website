-- Prevent duplicate email registrations overwriting existing member records.
-- Run in Supabase Dashboard > SQL Editor.
--
-- If either statement fails with "already exists" the constraint is already
-- in place — no action needed. If it fails with "duplicate key" there are
-- existing duplicate values that must be resolved before the constraint can
-- be applied.

ALTER TABLE members ADD CONSTRAINT members_email_unique UNIQUE (email);

ALTER TABLE members ADD CONSTRAINT members_stripe_customer_id_unique UNIQUE (stripe_customer_id);
