-- Add payment_failed_at timestamp to members table
-- Run in Supabase Dashboard > SQL Editor BEFORE merging the portal UX PR.
-- This column is used to calculate the 7-day document access grace period
-- for members whose payment has failed.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMPTZ;
