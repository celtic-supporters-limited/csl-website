-- membership_snapshots: aggregate-only membership metrics history
-- IMPORTANT: This table stores only computed counts and totals.
-- No per-member rows, no email addresses, no individual identifiers from WordPress.
-- See Section 0.5 guardrail in reporting requirements.

create table if not exists membership_snapshots (
  id             uuid        primary key default gen_random_uuid(),
  snapshotted_at timestamptz not null default now(),
  wp_as_of_date  date,        -- date of the WP CSV export used; null on Supabase-only snapshots
  metrics        jsonb       not null   -- aggregate counts/totals only
);

-- Append-only: admins may INSERT and SELECT; no UPDATE or DELETE policies.
alter table membership_snapshots enable row level security;

create policy "Admins can insert snapshots"
  on membership_snapshots for insert
  to authenticated
  with check (
    exists (
      select 1 from members where user_id = auth.uid() and is_admin = true
    )
  );

create policy "Admins can read snapshots"
  on membership_snapshots for select
  to authenticated
  using (
    exists (
      select 1 from members where user_id = auth.uid() and is_admin = true
    )
  );

-- No UPDATE or DELETE policies: table is intentionally append-only for auditability.

-- Explicit grants required in some Supabase project configurations
grant all on table membership_snapshots to service_role;
grant select, insert on table membership_snapshots to authenticated;
