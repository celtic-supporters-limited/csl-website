-- Add portal_open flag to site_config
-- Controls whether authenticated members can access /member-portal.
-- Admins (is_admin = true) are always allowed through regardless of this value.
-- Run in Supabase Dashboard > SQL Editor

insert into site_config (key, value, updated_at)
values ('portal_open', 'false', now())
on conflict (key) do nothing;
