-- Phase 5b: Member Portal Expansion
-- Run in: Supabase Dashboard > SQL Editor
-- Safe to run on an existing database — uses IF NOT EXISTS / IF NOT EXISTS guards.

-- ============================================================
-- MEMBERS TABLE — new columns
-- ============================================================

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS plan_name             TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS amount_pence          INTEGER;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS first_name            TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS last_name             TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS phone                 TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS fan_status            TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS contact_email         BOOLEAN DEFAULT true;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS contact_sms           BOOLEAN DEFAULT false;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS contact_telephone     BOOLEAN DEFAULT false;

-- fan_status allowed values
ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_fan_status_check;
ALTER TABLE public.members ADD CONSTRAINT members_fan_status_check
  CHECK (fan_status IN ('Season Ticket', 'Away Member', 'Home Only', 'Supporter (no match)') OR fan_status IS NULL);


-- ============================================================
-- PAYMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                UUID REFERENCES public.members(id),
  stripe_payment_intent_id TEXT,
  amount_pence             INTEGER NOT NULL,
  plan_name                TEXT,
  paid_at                  TIMESTAMPTZ NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'completed'
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own payments"
  ON public.payments
  FOR SELECT
  USING (
    member_id IN (
      SELECT id FROM public.members WHERE email = auth.email()
    )
  );

CREATE INDEX IF NOT EXISTS payments_member_id_idx ON public.payments (member_id);
CREATE INDEX IF NOT EXISTS payments_paid_at_idx   ON public.payments (paid_at DESC);


-- ============================================================
-- BACKFILL — existing test record
-- ============================================================

UPDATE public.members
SET plan_name    = 'Monthly 10',
    amount_pence = 1000
WHERE email = 'gphinn@gmail.com'
  AND plan_name IS NULL;
