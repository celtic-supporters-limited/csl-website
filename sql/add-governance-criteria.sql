-- governance_criteria table — 12-point Celtic Paradox Accountability Framework
-- Run in Supabase Dashboard > SQL Editor

create table if not exists governance_criteria (
  id            integer primary key,
  tier          integer not null check (tier in (1, 2, 3)),
  demand        text not null,
  status        text not null default 'red' check (status in ('red', 'amber', 'green')),
  commentary    text,
  last_reviewed date not null,
  updated_by    text
);

alter table governance_criteria enable row level security;

-- Anyone (including anon key) can read
create policy "Public read" on governance_criteria
  for select using (true);

-- service_role bypasses RLS by default — no separate write policy needed

-- Seed all 12 demands verbatim from Chapter 13 of The Celtic Paradox (v8.5, May 2026)
insert into governance_criteria (id, tier, demand, status, last_reviewed) values
  (1,  1, 'Publish a multi-year strategic plan with measurable KPIs, reviewed annually',                                                                    'red', '2026-06-04'),
  (2,  1, 'Establish a formal fan advisory board with elected representatives and published minutes',                                                        'red', '2026-06-04'),
  (3,  1, 'Publish a relationship agreement between Celtic PLC and Desmond/Telsar',                                                                         'red', '2026-06-04'),
  (4,  1, 'Reform AGM conduct — minimum three-hour session, pre-submitted questions answered, independent moderator',                                       'red', '2026-06-04'),
  (5,  1, 'Publish interim management statements (half-yearly minimum)',                                                                                    'red', '2026-06-04'),
  (6,  2, 'Board renewal programme — 9-year NED maximum, independent nominations committee, open recruitment',                                             'red', '2026-06-04'),
  (7,  2, 'Annual board effectiveness review by external party',                                                                                            'red', '2026-06-04'),
  (8,  2, 'Capital allocation framework — published policy covering cash targets, infrastructure criteria, player investment, dividend policy',             'red', '2026-06-04'),
  (9,  2, 'Digital and commercial strategy — published plan for global fanbase monetisation',                                                              'red', '2026-06-04'),
  (10, 3, 'Consider Main Market listing — formal board assessment of costs and benefits',                                                                  'red', '2026-06-04'),
  (11, 3, 'Academy investment plan — published five-year plan targeting Benfica-level throughput',                                                         'red', '2026-06-04'),
  (12, 3, 'Stadium investment decision — published position on South Stand: timeline, funding, revenue projections',                                       'red', '2026-06-04')
on conflict (id) do nothing;
