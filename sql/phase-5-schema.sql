-- Phase 5: Member Portal Schema
-- Run this in: Supabase Dashboard > SQL Editor
-- Supabase project must be in EU region.

-- ============================================================
-- MEMBERS TABLE
-- Populated by the /membership/success webhook (Phase 6).
-- For now, rows can be inserted manually or via admin scripts.
-- ============================================================

create table if not exists public.members (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique not null,
  name               text,
  stripe_customer_id text,
  membership_tier    text,      -- 'monthly' | 'annual' | 'lifetime'
  status             text default 'active',  -- 'active' | 'payment_failed' | 'cancelled'
  created_at         timestamptz default now()
);

alter table public.members enable row level security;

-- Authenticated users may read their own member record (matched by JWT email claim)
create policy "members_select_own"
  on public.members
  for select
  to authenticated
  using ((select auth.jwt() ->> 'email') = email);

-- Service role (used by API routes) bypasses RLS automatically and needs no policy.

create index if not exists members_email_idx on public.members (email);


-- ============================================================
-- EVENTS TABLE
-- Meeting recordings and governance briefings shown in portal.
-- ============================================================

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  event_date    date,
  recording_url text,
  slides_url    text,
  members_only  boolean default true
);

alter table public.events enable row level security;

-- Any authenticated (logged-in) member can read events
create policy "events_select_authenticated"
  on public.events
  for select
  to authenticated
  using (true);


-- ============================================================
-- SHAREHOLDER_CASES - additional RLS for portal
-- Table already exists from Phase 2. These policies let
-- authenticated members read their own cases in the portal.
-- The INSERT policy for the public intake form is covered by
-- the service role key used in API routes.
-- ============================================================

alter table public.shareholder_cases enable row level security;

create policy "cases_select_own"
  on public.shareholder_cases
  for select
  to authenticated
  using ((select auth.jwt() ->> 'email') = email);

create index if not exists cases_email_idx on public.shareholder_cases (email);


-- ============================================================
-- SAMPLE DATA (optional — delete before production)
-- ============================================================

-- insert into public.events (title, event_date, recording_url, slides_url, members_only) values
--   ('CSL Members Meeting - April 2026', '2026-04-14', 'https://example.com/recording-apr-2026', 'https://example.com/slides-apr-2026.pdf', true),
--   ('Shareholder Strategy Briefing - March 2026', '2026-03-04', 'https://example.com/recording-mar-2026', null, true);
