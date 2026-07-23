-- member_events table - activity audit log for member support triage
-- Run in Supabase Dashboard > SQL Editor

create table if not exists member_events (
  id              uuid        primary key default gen_random_uuid(),
  member_id       uuid        references members(id) on delete set null,
  event_type      text        not null,
  detail          jsonb,
  stripe_event_id text        unique,   -- null for non-Stripe events; unique prevents webhook replay duplicates
  event_email     text,                 -- email at time of event (survives later email changes for debugging)
  created_at      timestamptz not null default now()
);

-- event_type values:
--   checkout.completed      member joined or upgraded via Stripe Checkout
--   invoice.paid            subscription renewal confirmed
--   payment.failed          invoice payment failed
--   subscription.updated    plan/amount changed (amount_pence in detail)
--   subscription.cancelled  membership cancelled (subscription.deleted webhook)
--   email_change.initiated  member requested email change (old_email -> new_email in detail)
--   email_change.confirmed  confirmation link clicked; email swap completed
--   password_reset.requested  reset email dispatched
--   password.changed        member successfully set a new password
--   profile.updated         member changed profile fields (changed_fields in detail)

-- Primary lookup: all events for a member (join key survives email changes)
create index idx_member_events_member_id  on member_events(member_id);

-- Timeline ordering for the admin page
create index idx_member_events_created_at on member_events(created_at desc);

alter table member_events enable row level security;

-- Authenticated admins (is_admin = true) can read all events.
-- All inserts come from server-side service-role clients which bypass RLS.
create policy "Admins can read member_events"
  on member_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from   members
      where  members.user_id = auth.uid()
      and    members.is_admin = true
    )
  );

-- ── Auth event lookup ─────────────────────────────────────────────────────────
-- security definer + search_path = auth lets the function read auth.audit_log_entries.
-- execute is restricted to service_role only — never callable from anon or authenticated keys.
-- Called via: getSupabase().rpc("get_member_auth_events", { p_user_id: member.user_id })
create or replace function public.get_member_auth_events(p_user_id uuid)
returns table (
  id         uuid,
  action     text,
  ip_address varchar,
  created_at timestamptz
)
language sql
security definer
set search_path = auth, public
as $$
  select
    id,
    (payload->>'action')::text as action,
    ip_address,
    created_at
  from auth.audit_log_entries
  where payload->>'actor_id' = p_user_id::text
    and payload->>'action' in ('login', 'logout', 'user_updated', 'password_recovery')
  order by created_at desc
  limit 100;
$$;

revoke execute on function public.get_member_auth_events(uuid) from public, anon, authenticated;
grant  execute on function public.get_member_auth_events(uuid) to service_role;
