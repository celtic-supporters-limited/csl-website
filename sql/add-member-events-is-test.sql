-- Adds is_test flag to member_events so test-mode Stripe events can be
-- filtered out of production support timelines.
-- Run after add-member-events.sql.
-- If the table was just created and not yet used, you can add this column
-- directly to add-member-events.sql instead.

alter table member_events
  add column if not exists is_test boolean not null default false;

create index if not exists idx_member_events_is_test
  on member_events(is_test)
  where is_test = true;
