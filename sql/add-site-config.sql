-- Site configuration table
-- Stores runtime-editable key/value settings (AGM date, shares represented, etc.)
-- Run in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.site_config (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read config (AGM date shown in member portal dashboard)
CREATE POLICY "Authenticated users can read site config"
  ON public.site_config FOR SELECT
  TO authenticated
  USING (true);

-- Seed default values — do not overwrite if already set
INSERT INTO public.site_config (key, value)
VALUES
  ('agm_date',           NULL),
  ('shares_represented', '15000')
ON CONFLICT (key) DO NOTHING;
