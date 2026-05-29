-- Members Library migration
-- Run in Supabase Dashboard > SQL Editor

-- Extend events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS minutes_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS description TEXT;

-- Standalone documents table
CREATE TABLE IF NOT EXISTS documents (
  id           UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  title        TEXT         NOT NULL,
  description  TEXT,
  document_type TEXT        NOT NULL DEFAULT 'paper',
  published_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  file_url     TEXT         NOT NULL,
  is_published BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active members can view published documents"
  ON documents FOR SELECT
  USING (
    is_published = true AND EXISTS (
      SELECT 1 FROM members
      WHERE members.email = auth.email()
        AND members.status = 'active'
    )
  );

-- Seed events: 14th Members Meeting
INSERT INTO events (title, event_date, description, minutes_url, members_only)
VALUES (
  '14th Members Meeting',
  '2026-04-14',
  'Progress report on membership and shareholding, strategic vision, Recruit Five initiative, share tracing and proxy aggregation. 91 members in attendance.',
  'https://drive.google.com/STUB_MINUTES_14TH_MEETING',
  true
);

-- Seed documents: The Celtic Paradox
INSERT INTO documents (title, description, document_type, published_at, file_url, is_published)
VALUES (
  'The Celtic Paradox — Strategic Review v8.5',
  'A strategic review of Celtic PLC examining how governance structure affects commercial and financial performance relative to comparable clubs. Includes peer benchmarking, scenario modelling, and shareholder analysis based on public disclosures 2020-2025.',
  'paper',
  '2026-05-25 00:00:00+00',
  'https://drive.google.com/STUB_CELTIC_PARADOX_V8_5',
  true
);
