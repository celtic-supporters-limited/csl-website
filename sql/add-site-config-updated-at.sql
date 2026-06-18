-- Adds updated_at column to site_config (missing from original migration).
-- Also seeds active_members key used by the home page and portal dashboard.

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

INSERT INTO site_config (key, value, updated_at)
VALUES ('active_members', '493', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
