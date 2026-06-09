-- Add user_id column linking members to auth.users
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Backfill user_id for existing members where email matches an auth user
UPDATE public.members m
SET user_id = u.id
FROM auth.users u
WHERE m.email = u.email AND m.user_id IS NULL;

-- Index for fast RLS lookups
CREATE INDEX IF NOT EXISTS members_user_id_idx ON public.members(user_id);
