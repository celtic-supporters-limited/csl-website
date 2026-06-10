-- Add dedicated lifetime membership flag to members table.
-- Run in: Supabase Dashboard > SQL Editor

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS is_lifetime BOOLEAN NOT NULL DEFAULT false;

-- Backfill any existing lifetime members recorded before this migration.
UPDATE public.members
SET is_lifetime = true
WHERE membership_tier = 'lifetime';
