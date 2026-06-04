-- Add is_admin flag to members table
-- Run in Supabase Dashboard > SQL Editor

alter table members add column if not exists is_admin boolean not null default false;

-- After running this migration, set is_admin = true for authorised volunteers
-- directly in the Supabase table editor, or run:
-- update members set is_admin = true where email = 'gary.phinn@outlook.com';
-- update members set is_admin = true where email = '<martin_email>';
