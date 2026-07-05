# CSL Website — Risk Log

Operational risks for the CSL website. Updated as risks are identified, mitigated, or resolved.

| # | Risk | Likelihood | Impact | Status |
|---|------|-----------|--------|--------|
| R01 | Supabase free-tier auto-pause | Medium | High | Partially mitigated |

---

## R01 — Supabase free-tier auto-pause

**Description:** Supabase automatically pauses free-tier projects after 7 days of inactivity. The production database going down takes the entire site offline — auth, member portal, and all data access fail immediately.

**Status:** Partially mitigated. Cron frequency increased from weekly to every 3 days (PR #55, pending merge to main). Staging project was paused on 29 June 2026 and has been manually restored.

**Likelihood:** Medium. The every-3-days cron provides a safety margin, but a single failed run still leaves a gap. Cron execution cannot be confirmed from Vercel logs beyond the current session window.

**Impact:** High. Production outage for all members and volunteers until manually restored. Up to 90 days to restore before data is permanently inaccessible.

**Owner:** Gary Phinn (Volunteer IT Lead).

**Recommended resolution:** Upgrade production Supabase to Pro (~£20/month). Requires board approval. Eliminates auto-pause entirely and removes dependency on cron as a keep-alive mechanism.

**Interim controls:** Every-3-days snapshot cron (once PR #55 is merged to main); Supabase sends an email warning before pausing, giving time to manually restore.
