-- AGM launch controls
-- Run in Supabase Dashboard > SQL Editor
--
-- Two gates, both seeded closed so that deploying the code cannot publish
-- either flow. Each is opened deliberately from the admin Operations page:
--   resolution_open - opened when the solicitor confirms the resolution wording
--   proxy_open      - opened when Celtic plc issues the Notice of AGM
--
-- ON CONFLICT DO NOTHING so re-running this never reopens a gate that an
-- admin has since closed, and never closes one they have since opened.

INSERT INTO site_config (key, value, updated_at)
VALUES
  ('resolution_open', 'false', NOW()),
  ('proxy_open',      'false', NOW())
ON CONFLICT (key) DO NOTHING;
