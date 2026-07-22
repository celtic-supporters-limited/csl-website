insert into site_config (key, value, updated_at)
values ('membership_open', 'false', now())
on conflict (key) do nothing;
