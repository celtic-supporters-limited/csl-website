-- Document Library schema migration
-- Adds new columns to the existing documents table and updates seed data.
-- Run in Supabase Dashboard > SQL Editor.

-- 1. Add new columns (nullable to allow backfill of existing rows)
alter table documents add column if not exists category     text;
alter table documents add column if not exists drive_url    text;
alter table documents add column if not exists file_type    text not null default 'PDF';
alter table documents add column if not exists members_only boolean not null default true;

-- 2. Backfill category from existing document_type values
update documents set category = case document_type
  when 'paper'   then 'Research & Papers'
  when 'minutes' then 'Meeting Minutes'
  when 'report'  then 'Governance'
  when 'notice'  then 'Governance'
  else 'Governance'
end where category is null;

-- 3. Update the Celtic Paradox row: real Drive URL, clean title, updated description
update documents set
  title       = 'The Celtic Paradox v8.5',
  description = 'A strategic review of Celtic PLC - governance, financial performance, and the case for change.',
  drive_url   = 'https://drive.google.com/file/d/1RzFfWclHrApSzxJuxMdagywv2JpC8Vt9/view?usp=drive_link',
  file_url    = 'https://drive.google.com/file/d/1RzFfWclHrApSzxJuxMdagywv2JpC8Vt9/view?usp=drive_link'
where document_type = 'paper' and title ilike '%Celtic Paradox%';

-- 4. Copy file_url into drive_url for any remaining rows not yet backfilled
update documents set drive_url = file_url where drive_url is null;

-- 5. Replace old RLS policy with new one
drop policy if exists "Active members can view published documents" on documents;
drop policy if exists "Members can view document metadata" on documents;

create policy "Members can view document metadata"
  on documents for select
  to authenticated
  using (members_only = true);

-- 6. Insert Meeting Minutes seed row (skip if already present)
insert into documents (title, description, category, drive_url, file_type, published_at, members_only)
select
  'Members Meeting Minutes - April 2026',
  'Minutes from the CSL members meeting held 14 April 2026.',
  'Meeting Minutes',
  'https://drive.google.com/file/d/1iIjUfVOGyBX5RSszVP13eodv6jyT6qCy/view?usp=drive_link',
  'PDF',
  '2026-04-14',
  true
where not exists (
  select 1 from documents where title = 'Members Meeting Minutes - April 2026'
);
