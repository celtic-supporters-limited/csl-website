-- ============================================================
-- CSL Production Cleardown Script
-- Run in: Supabase Dashboard > SQL Editor
-- Purpose: Remove all test/dev data before go-live.
--
-- RETAINS:
--   gary.phinn@outlook.com  — Volunteer IT Lead (admin)
--   martimank@hotmail.com   — Shareholder Register Manager (admin)
--
-- CLEARS:
--   members          — all rows except the two above
--   auth.users       — all rows except the two above
--   member_events    — all rows except those tied to the two above
--   shareholder_cases — all rows (no exceptions)
--
-- PRESERVES (untouched):
--   documents, events, site_config, governance_criteria
-- ============================================================

BEGIN;

-- ── Step 1: Delete member_events for non-keeper members ───────────────────────
-- Must run before deleting members (FK constraint: member_events.member_id → members.id)
DELETE FROM member_events
WHERE member_id NOT IN (
  SELECT id FROM members
  WHERE email IN ('gary.phinn@outlook.com', 'martimank@hotmail.com')
);

-- ── Step 2: Empty shareholder_cases ──────────────────────────────────────────
DELETE FROM shareholder_cases;

-- ── Step 3: Delete non-keeper members ────────────────────────────────────────
DELETE FROM members
WHERE email NOT IN ('gary.phinn@outlook.com', 'martimank@hotmail.com');

-- ── Step 4: Delete non-keeper auth users ─────────────────────────────────────
-- Deletes the auth.users row; any linked identities cascade automatically.
DELETE FROM auth.users
WHERE email NOT IN ('gary.phinn@outlook.com', 'martimank@hotmail.com');

-- ── Step 5: Ensure both keepers are admins ────────────────────────────────────
UPDATE members
SET is_admin = true
WHERE email IN ('gary.phinn@outlook.com', 'martimank@hotmail.com');

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
-- Run these SELECTs after the transaction to confirm the result.

SELECT 'members' AS "table", count(*) AS remaining FROM members
UNION ALL
SELECT 'auth.users',         count(*) FROM auth.users
UNION ALL
SELECT 'member_events',      count(*) FROM member_events
UNION ALL
SELECT 'shareholder_cases',  count(*) FROM shareholder_cases;

-- Expected: members=2, auth.users=2, member_events=(Gary+Martin events only), shareholder_cases=0

SELECT id, email, is_admin, status, membership_tier, plan_name
FROM members
ORDER BY email;
