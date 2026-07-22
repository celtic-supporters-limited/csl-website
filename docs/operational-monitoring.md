# Operational Monitoring Design

**Status:** Design only - no implementation code yet  
**Author:** Gary Phinn (Volunteer IT Lead)  
**Date:** 2026-07-22  
**Scope:** CSL Website (Next.js 14, Supabase, Stripe, Resend, Cloudflare Turnstile)

---

## Contents

1. [What to monitor and where each log lives](#1-what-to-monitor)
2. [Structured logging improvements](#2-structured-logging-improvements)
3. [Proactive monitoring - daily error digest](#3-daily-error-digest)
4. [Member query response playbook](#4-member-query-playbook)
5. [Free tooling assessment - Axiom](#5-axiom-assessment)

---

## 1. What to Monitor

### 1.1 Vercel (hosting + serverless functions)

**Dashboard:** https://vercel.com/celtic-supporters-limited/csl-website  
**Plan:** Hobby

| Signal | Where it lives | Retention | API queryable? |
|--------|---------------|-----------|----------------|
| Function invocations | Vercel Dashboard > Functions | ~1 hour (Hobby) | No |
| Function errors (5xx) | Vercel Dashboard > Logs | ~1 hour (Hobby) | No (requires Pro + log drain) |
| Build failures | Vercel Dashboard > Deployments | Indefinite | Via Vercel API (token required) |
| Runtime logs (console.*) | Vercel Dashboard > Logs > Runtime | ~1 hour (Hobby) | No |
| Cron execution status | Vercel Dashboard > Cron Jobs | ~1 hour (Hobby) | No |

**Critical constraint:** Hobby plan provides no log drain and approximately 1 hour of function log retention. Any console.error written to a route that is not observed within that window is permanently lost. The only durable log storage is what we write to Supabase tables.

**Cron slot constraint:** Hobby plan allows exactly 1 Vercel cron job. The `membership-snapshot` cron (`0 6 */3 * *`) occupies that slot. A second cron (monitoring digest) requires either:
- Vercel Pro upgrade (~£20/month), which increases to unlimited cron jobs; or
- GitHub Actions as the external scheduler (zero additional cost, existing Actions account).

**What to watch:**
- Build failures on the `develop` and `main` branches (check after every push)
- Cron execution: both `membership-snapshot` and `backup-members` must succeed
- Any deployment that introduces a runtime 500 on critical API routes (`/api/checkout`, `/api/webhooks/stripe`, `/api/billing-portal`)

### 1.2 Stripe

**Dashboard:** https://dashboard.stripe.com (currently test mode)  
**Plan:** Pay-as-you-go (1.4% + 20p/transaction)

| Signal | Where it lives | Retention | API queryable? |
|--------|---------------|-----------|----------------|
| Payment events | Stripe Dashboard > Events | 30 days (API) | Yes - `stripe.events.list()` |
| Webhook delivery attempts | Stripe Dashboard > Webhooks > Attempts | 30 days | No public API for delivery failures |
| Failed charges | Stripe Dashboard > Payments | Indefinite | Yes - `stripe.charges.list({ limit })` |
| Subscription cancellations | Stripe Dashboard > Customers | Indefinite | Yes - `stripe.subscriptions.list()` |
| API key mode | Derived from `STRIPE_SECRET_KEY` prefix | N/A | Yes - `sk_test_` vs `sk_live_` |
| Connectivity / latency | N/A - must probe | Real-time | Yes - `stripe.balance.retrieve()` |

**Already monitored:** `stripe.balance.retrieve()` latency and mode in `operations/page.tsx` and the PDF export.

**What to watch:**
- Connectivity health (already in place)
- Payment failure events in `member_events` table (`event_type = 'payment.failed'`)
- Webhook delivery: there is no Stripe API endpoint to query "did my webhook endpoint receive all events in the last 24h." The best proxy is to compare `stripe.events.list()` count (events Stripe created) against `member_events` rows written by the webhook handler. A gap indicates missed deliveries.
- Webhook signing mode: if `STRIPE_WEBHOOK_SECRET` is a test secret (`whsec_` prefix from test dashboard), connecting a live key will break all signature verifications.

**Gaps to address:**
- The webhook handler does not log a count of successfully processed events per run. Add a summary log line at the end of each event case.
- Failed webhook signature verifications currently return 400 with no logging. Add `console.error("[stripe-webhook] Signature verification failed:", err.message)`.

### 1.3 Supabase

**Dashboard:** https://supabase.com/dashboard/project/[project-ref]  
**Plan:** Hobby (EU West - Ireland)

| Signal | Where it lives | Retention | API queryable? |
|--------|---------------|-----------|----------------|
| Database size | Supabase Dashboard > Reports | Real-time | Yes - `admin_get_db_size_bytes` RPC |
| Auth events (sign-ins, resets) | `auth.audit_log_entries` | 90 days | Yes - via service-role `get_member_auth_events` RPC |
| Failed sign-in attempts | `auth.audit_log_entries` | 90 days | Yes - filter on `action = 'user_signedin'` where `is_anonymous = false` |
| Row counts per table | Supabase Dashboard > Table Editor | Real-time | Yes - `pg_class` query |
| Active connections | Supabase Dashboard > Reports | Real-time | No direct API |
| Auto-pause risk | N/A - triggers after 7 days inactivity | N/A | Prevented by cron activity |

**Already monitored:** DB size via `admin_get_db_size_bytes` RPC in `operations/page.tsx`.

**What to watch:**
- Database size approaching 500 MB free tier limit (green < 70%, amber 70-89%, red >= 90%)
- `auth.audit_log_entries` for bulk failed sign-in attempts (potential credential stuffing)
- Auto-pause: the membership-snapshot cron runs every 3 days (`0 6 */3 * *`), which is sufficient to keep the database active (7-day inactivity threshold). No action needed.
- `email_log` table row count as a proxy for transactional email volume

**Durable log tables (data written by our code, survives Vercel log expiry):**

| Table | Written by | Retention |
|-------|-----------|-----------|
| `member_events` | All 4 API routes (webhook, profile, auth, email-change callback) | Indefinite |
| `email_log` | `lib/resend.ts` after every successful send | Indefinite |
| `email_bounces` | Resend webhook (`/api/webhooks/resend`) | Indefinite |
| `backup_log` | GitHub Actions cron + manual backup route | Indefinite |
| `membership_snapshots` | Membership-snapshot cron | Indefinite |

These tables are the foundation for any aggregate monitoring. All digest queries should read from these tables, not from Vercel logs.

### 1.4 Resend (transactional email)

**Dashboard:** https://resend.com/dashboard  
**Plan:** Free (3,000 emails/month, 100/day)

| Signal | Where it lives | Retention | API queryable? |
|--------|---------------|-----------|----------------|
| Send count (today) | `email_log` table | Indefinite | Yes - COUNT by `sent_at >= today` |
| Send count (this month) | `email_log` table | Indefinite | Yes - COUNT by `sent_at >= month start` |
| Bounce events | `email_bounces` table | Indefinite | Yes |
| Bounce rate | Derived from `email_log` + `email_bounces` | Indefinite | Yes |
| Delivery status per email | Resend API `GET /emails/{id}` | 30 days (Resend) | Yes per-email, not in aggregate |
| Aggregate send volume | **Resend has no aggregate API** | N/A | No |

**Critical constraint:** Resend does not expose an aggregate "emails sent in period" API. The only durable aggregate count is what we write to `email_log`. If a send completes but `logEmailSend()` fails, the count will be understated. This is acceptable for monitoring purposes; the discrepancy would be 1 row at most per failure.

**Already monitored:** today/month counts, bounce rate, traffic-light status in `operations/page.tsx`.

**What to watch:**
- Daily sends approaching 100 (amber at 70, red at 90)
- Monthly sends approaching 3,000 (amber at 2,100, red at 2,700)
- Bounce rate above 2% (amber), above 5% (red) - thresholds matching the Operations page
- The `email_log` deployment date (2026-07-14) means pre-deployment sends are not counted. This is expected and documented.

**Email type breakdown** (for future digest query):

```sql
SELECT email_type, COUNT(*) as count
FROM email_log
WHERE sent_at >= NOW() - INTERVAL '24 hours'
GROUP BY email_type
ORDER BY count DESC;
```

Types in current use: `welcome`, `password_reset`, `magic_link`, `payment_failed`, `payment_failed_alert`, `card_expiry`, `share_tracing`, `proxy`, `backup`, `backup_failure_alert`.

### 1.5 Cloudflare Turnstile (bot protection)

**Dashboard:** https://dash.cloudflare.com > Turnstile  
**Plan:** Free

| Signal | Where it lives | Retention | API queryable? |
|--------|---------------|-----------|----------------|
| Challenge pass rate | Cloudflare Dashboard > Turnstile > Analytics | 30 days | No API |
| Challenge failures | Cloudflare Dashboard only | 30 days | No API |
| Server-side failures | Vercel logs (`[checkout] Bot detection check failed`) | ~1 hour | No (lost after Vercel expiry) |

**Constraint:** Cloudflare Turnstile exposes no analytics API. The pass/fail counts are visible in the dashboard only. If you need to count bot-blocked checkout attempts, add a Supabase table write on failure (not recommended for v1 - adds DB writes for bot traffic).

**What to watch:** Check the Cloudflare Turnstile dashboard periodically for elevated failure rates, which would indicate an ongoing bot attack against the membership form.

---

## 2. Structured Logging Improvements

The audit identified three silent failure paths where errors occur but no console.error is written. These are gaps in our durable signal - once Vercel logs expire, there is no record that the failure happened.

### 2.1 Gap: Turnstile verification failure (checkout)

**File:** `app/api/checkout/route.ts` line 96  
**Current code:**
```typescript
if (!verifyData.success) {
  return NextResponse.json(
    { error: "Bot detection check failed. Please try again." },
    { status: 400 }
  );
}
```

**Proposed change:**
```typescript
if (!verifyData.success) {
  console.error("[checkout] Turnstile verification failed", {
    ip,
    email,
    errorCodes: (verifyData as Record<string, unknown>)["error-codes"],
  });
  return NextResponse.json(
    { error: "Bot detection check failed. Please try again." },
    { status: 400 }
  );
}
```

**Rationale:** Repeated Turnstile failures from the same IP indicate an active bot attack. Without the log, there is no signal at all (Cloudflare dashboard is not API-queryable). The IP and email context will appear in Vercel logs while they are within the retention window.

### 2.2 Gap: OTP verification failure (auth/verify)

**File:** `app/api/auth/verify/route.ts` line 52  
**Current code:**
```typescript
if (error) {
  return NextResponse.redirect(/* confirm page */);
}
```

**Proposed change:**
```typescript
if (error) {
  console.error("[auth/verify] OTP verification failed:", error.message, {
    email: body?.email,
  });
  return NextResponse.redirect(/* confirm page */);
}
```

**Rationale:** A redirect-only response means a failed magic link verification is completely invisible in our logs. This matters for diagnosing member login issues.

### 2.3 Gap: Resend send function exceptions

**File:** `lib/resend.ts` - all 8 send functions  
**Current behaviour:** If `resend.emails.send()` throws (network error, Resend 5xx, invalid from address), the exception propagates to the caller's try/catch. The error is logged by the caller, but the log message does not identify which email type failed.

**Proposed change:** Wrap `resend.emails.send()` inside each function with a try/catch that logs the email type before re-throwing:
```typescript
try {
  await resend.emails.send({ ... });
} catch (err) {
  console.error("[resend] send failed", { emailType: "welcome", to: email, err });
  throw err;
}
logEmailSend("welcome");
```

**Rationale:** When a Resend send fails and is caught by the caller (which logs only a generic `[stripe-webhook] ... email error`), there is no record of which template failed or what the Resend error code was.

### 2.4 Gap: Stripe webhook signature failure

**File:** `app/api/webhooks/stripe/route.ts`  
**Current code:** Returns 400 on `constructEvent` failure with no log.

**Proposed change:**
```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[stripe-webhook] Signature verification failed:", msg);
  return NextResponse.json({ error: "Webhook signature invalid" }, { status: 400 });
}
```

**Rationale:** Signature failures almost always mean a misconfigured `STRIPE_WEBHOOK_SECRET` after a deployment change. Without a log, diagnosing this requires reading Stripe's webhook delivery failures dashboard manually.

### 2.5 Existing good patterns to preserve

The following already follow best practice and should be used as the template for any new routes:

- `app/api/webhooks/stripe/route.ts`: Every event case has a distinct `console.error` with `[stripe-webhook]` prefix, event type, and member email. Errors return 200 to prevent Stripe retries on transient failures.
- `app/api/checkout/route.ts`: `[checkout]` prefix on all errors; Stripe error object passed directly (Stripe errors carry `.type`, `.code`, `.statusCode`).
- `lib/backup.ts`: Comprehensive try/catch with structured context at every step; sends a failure alert email as well as logging.

---

## 3. Daily Error Digest

### 3.1 Purpose

A lightweight daily summary delivered to `info@celticsupporters.net` at 07:00 UTC covering the previous 24 hours. The digest queries Supabase durable tables only - it does not depend on Vercel logs, which are gone before the digest runs.

The digest is proactive: it surfaces issues before volunteers check the Operations page. A green digest requires no action.

### 3.2 Vercel cron slot constraint

`vercel.json` currently has 1 cron entry:

```json
{
  "crons": [
    {
      "path": "/api/cron/membership-snapshot",
      "schedule": "0 6 */3 * *"
    }
  ]
}
```

The Hobby plan allows exactly 1 Vercel cron. Adding a second entry would fail silently or require a plan upgrade.

**Recommended trigger mechanism: GitHub Actions**

The daily backup (`backup-members`) is already triggered by a GitHub Actions workflow (not a Vercel cron). The same pattern works for the monitoring digest:

```yaml
# .github/workflows/monitoring-digest.yml
name: Daily monitoring digest
on:
  schedule:
    - cron: '0 7 * * *'   # 07:00 UTC every day
  workflow_dispatch:        # manual trigger for testing

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger digest
        run: |
          curl -s -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            ${{ secrets.NEXT_PUBLIC_SITE_URL }}/api/cron/monitoring-digest
```

This costs nothing (free Actions minutes). The `CRON_SECRET` and `NEXT_PUBLIC_SITE_URL` secrets are already in the GitHub repository from the backup workflow.

**Alternative (if Vercel Pro is adopted):** Add a second cron entry to `vercel.json`:
```json
{ "path": "/api/cron/monitoring-digest", "schedule": "0 7 * * *" }
```

### 3.3 Route design

**Route:** `POST /api/cron/monitoring-digest`  
**Auth:** `Authorization: Bearer ${CRON_SECRET}` (same pattern as `backup-members` and `membership-snapshot`)  
**Returns:** `200 { ok: true, summary }` on success; `500 { error }` on failure

```
app/api/cron/monitoring-digest/route.ts
```

### 3.4 Data queries (all via Supabase service-role client)

```
Window: last 24 hours (NOW() - INTERVAL '24 hours')
```

| Metric | Query |
|--------|-------|
| Emails sent | `COUNT(*) FROM email_log WHERE sent_at >= window` |
| Email breakdown by type | `SELECT email_type, COUNT(*) FROM email_log GROUP BY email_type` |
| Bounces | `COUNT(*) FROM email_bounces WHERE bounced_at >= window` |
| Bounce rate | `bounces / sends * 100` |
| New members | `COUNT(*) FROM members WHERE created_at >= window` |
| Payment failures | `COUNT(*) FROM member_events WHERE event_type = 'payment.failed' AND created_at >= window` |
| Subscription cancellations | `COUNT(*) FROM member_events WHERE event_type = 'subscription.cancelled' AND created_at >= window` |
| Auth events | `COUNT(*) FROM member_events WHERE event_type IN ('email_change.initiated', 'password_reset.requested') AND created_at >= window` |
| Last backup status | `SELECT status, ran_at FROM backup_log ORDER BY ran_at DESC LIMIT 1` |
| Stripe connectivity | `stripe.balance.retrieve()` (live check at digest time) |
| DB size | `admin_get_db_size_bytes` RPC |

### 3.5 Traffic light logic

| Signal | Green | Amber | Red |
|--------|-------|-------|-----|
| Email sends/day | < 70 | 70-99 | >= 100 |
| Bounce rate | < 2% | 2-5% | >= 5% |
| Payment failures | 0 | 1-2 | >= 3 |
| Last backup | < 26h ago | 26-48h ago | > 48h or none |
| Stripe connectivity | Connected (live key) | Connected (test key) | Unreachable |
| DB size | < 350 MB | 350-449 MB | >= 450 MB |

Overall status is the worst of all individual signals.

### 3.6 Email format

Plain-text primary, HTML fallback. Sent via `sendMonitoringDigest()` in `lib/resend.ts`.

```
Subject: CSL Operations Digest - [DATE] - [STATUS: ALL CLEAR / AMBER / ACTION REQUIRED]

---
CSL Daily Operations Digest
[Date range: 21 Jul 07:00 - 22 Jul 07:00 UTC]

OVERALL: ALL CLEAR

EMAIL
  Sent (24h):        12 (limit 100/day)
  Sent (this month): 187 (limit 3,000/month)
  Bounces (24h):     0
  Bounce rate:       0.0%

MEMBERS
  New joins (24h):   2
  Payment failures:  0
  Cancellations:     0

BACKUP
  Last success:      22 Jul 2026 06:00 UTC (1h ago)
  Status:            OK

STRIPE
  Connectivity:      OK (test mode, 43ms)

SUPABASE
  DB size:           84 MB / 500 MB

---
No action required.
View full dashboard: https://csl-website-ten.vercel.app/member-portal/admin/operations
---
```

When amber or red, the email lists specific items requiring attention:

```
ATTENTION REQUIRED:

  - Payment failures: 3 in last 24h (check member timelines)
  - Bounce rate: 3.2% this month (approaching Resend warning threshold)

View full dashboard: [URL]
```

### 3.7 `logEmailSend` for the digest itself

The digest email is sent via Resend and must call `logEmailSend("monitoring_digest")`. This prevents the digest from incrementing untracked send counts.

### 3.8 Failure handling

If the digest handler throws, it must:
1. `console.error("[cron/monitoring-digest] Failed:", err)` 
2. Return `500 { error }` so GitHub Actions marks the workflow run as failed
3. NOT send a partial digest

A failed digest is visible in the GitHub Actions run history, which is a durable log. The volunteer can check https://github.com/celtic-supporters-limited/csl-website/actions.

---

## 4. Member Query Playbook

### 4.1 Purpose

When a member contacts CSL about a billing, access, or account issue, the responding volunteer needs to locate the relevant records quickly without digging through multiple dashboards. The Operations page should include a "Member Query" section that wraps the most common lookups.

### 4.2 Placement on Operations page

Add a collapsible "Member Query" panel below the Service Status grid. Collapsed by default (reduces visual noise for routine checks). When expanded, shows a search field and result panel.

This does NOT replace the full Admin Members search at `/member-portal/admin/members` - that page shows the complete audit timeline. The Operations page query is a quick lookup for status checks, not investigations.

### 4.3 Queries to expose

**Query by email (exact match):**

```sql
SELECT
  m.email, m.first_name, m.last_name, m.status, m.plan_name,
  m.membership_tier, m.amount_pence, m.created_at,
  m.stripe_customer_id, m.stripe_subscription_id,
  m.payment_failed_at, m.pending_email, m.is_lifetime
FROM members m
WHERE m.email = $1
```

**Plus live Stripe data:**
- `stripe.customers.retrieve(stripe_customer_id, { expand: ["subscriptions"] })`
- `stripe.charges.list({ customer: stripe_customer_id, limit: 5 })`

**Display fields in Operations panel:**

| Field | Source |
|-------|--------|
| Status | `members.status` (active / payment_failed / cancelled) |
| Plan | `members.plan_name` |
| Amount | `members.amount_pence / 100` formatted as GBP |
| Member since | `members.created_at` |
| Last payment | Latest charge from Stripe |
| Next payment | Subscription `current_period_end` from Stripe |
| Card on file | Brand + last4 from Stripe payment method |
| Pending email change | `members.pending_email` if set |
| Stripe links | Direct links to Stripe Dashboard customer and subscription |

**Link to full timeline:** Always include a "View full timeline" link to `/member-portal/admin/members?q=[email]`.

### 4.4 Common scenarios and responses

| Member reports | Check first | Likely cause |
|---------------|-------------|--------------|
| "I can't log in" | `member_events` for `password_reset.requested`; auth events for failed sign-ins | Wrong email, unconfirmed account, or magic link used |
| "My payment failed" | `members.payment_failed_at`; `member_events` for `payment.failed` | Card expired; bank declined |
| "I was charged twice" | Stripe charges list | Rare; check for duplicate `stripe_customer_id` rows |
| "I cancelled but still being charged" | `members.status`; Stripe subscription status | Webhook delivery failure on cancellation event |
| "I can't see the member portal" | `members.status`; `site_config.portal_open` | `payment_failed` status or portal gate closed |
| "I changed my email and lost access" | `members.pending_email`; `member_events` for `email_change` events | Confirmation link not clicked; Supabase auth email still old address |

### 4.5 Implementation notes

- The Operations page is already a server component. The member query panel requires client-side interactivity (search field, result fetch) - use a client component `MemberQueryPanel.tsx` that calls a new `GET /api/admin/member-lookup?email=...` route.
- The lookup route must have the same `is_admin` guard as all other admin routes.
- Never display the raw Stripe customer ID or subscription ID to the operator UI - link directly to the Stripe Dashboard instead: `https://dashboard.stripe.com/customers/[id]`.
- Rate-limit the lookup route: 20 requests per admin per 5 minutes (prevents scripted scraping).

---

## 5. Axiom Free Tier Assessment

### 5.1 What Axiom provides

Axiom is a log management and observability platform. The free tier (Axiom Cloud) provides:

- **Ingest:** 500 GB/month
- **Retention:** 30 days
- **Log search:** Full-text search across all ingested logs
- **Dashboards:** Custom dashboards with time-series charts
- **Alerts:** Email and webhook alerts on log patterns
- **Vercel integration:** Native one-click integration that forwards all Vercel function logs to Axiom

### 5.2 How it solves the core problem

The root cause of our monitoring gap is Vercel Hobby's ~1 hour log retention. Axiom solves this by pulling logs from Vercel in real time and storing them for 30 days with search. After installing the Vercel integration:

1. Every `console.error`, `console.warn`, and `console.log` from all serverless functions is forwarded to Axiom automatically.
2. Logs are searchable by route, log level, timestamp, and content.
3. An alert can be configured: "if `[stripe-webhook]` error appears, send email to `info@celticsupporters.net`".

This would also make the 3 silent gaps identified in Section 2 automatically visible once the logging improvements are applied.

### 5.3 Fit for CSL

| Criterion | Assessment |
|-----------|-----------|
| Cost | Free tier covers CSL usage (low volume) |
| Setup effort | Vercel integration installs in ~5 minutes via Vercel Dashboard > Integrations > Axiom |
| Data residency | Axiom Cloud is US-hosted. CSL's GDPR policy requires EU/UK residency for personal data. **Vercel function logs must not contain member emails or PII before Axiom is enabled.** |
| Operational value | High - solves the 1-hour retention problem permanently |
| Dependency risk | Low - removing Axiom reverts to status quo; no code changes required |

### 5.4 GDPR concern - PII in logs

Several existing `console.error` calls include member emails:

- `[stripe-webhook] checkout.session.completed: no customer email` - logs `session.id` only (safe)
- `[stripe-webhook] Duplicate email with different Stripe customer` - logs `email=...` (contains PII)
- `[checkout] Could not check existing member for email:` - logs the error only (safe)
- Proposed gap fix 2.1 logs `ip` and `email` (would contain PII)

Before enabling Axiom (a US-hosted service), all log calls that include member email addresses must be replaced with hashed or truncated identifiers:

```typescript
// Instead of:
console.error("[stripe-webhook] Duplicate email", { email })

// Use:
const emailHash = email.split("@")[0].slice(0, 3) + "***@" + email.split("@")[1];
console.error("[stripe-webhook] Duplicate email", { emailHash })
```

This is a pre-requisite for Axiom adoption, not a blocker for the logging improvements themselves.

### 5.5 Recommendation

**Phase A (immediate, no Axiom):** Apply the 4 structured logging improvements from Section 2. These improve signal quality regardless of where logs are eventually stored.

**Phase B (short term, no cost):** Install Axiom via the Vercel integration. Set up one alert: any `console.error` from `[stripe-webhook]` or `[cron/` prefixes. This gives 30-day retention and proactive alerting with zero ongoing cost.

**Pre-requisite for Phase B:** Audit all `console.error` calls for PII (member emails). Replace with hashed identifiers before enabling Axiom. Estimated effort: 1 session.

**Phase C (if digest requires second cron):** Upgrade Vercel to Pro (~£20/month) to unlock a second Vercel cron slot for `monitoring-digest` at 07:00 UTC. Alternatively, keep GitHub Actions as the trigger (no cost, already used for backup-members).

### 5.6 Summary of upgrade costs

| Upgrade | Monthly cost | What it unlocks |
|---------|-------------|----------------|
| Vercel Pro | ~£20 | Unlimited cron jobs, log drain, 30-day log retention |
| Axiom (via Vercel integration) | Free | 30-day log retention, search, alerts (solves the same problem as Vercel Pro logs at lower cost, with GDPR caveat) |
| Resend Pro | ~£20 | Higher send limits, email analytics API, webhook reliability |
| Supabase Pro | ~£25 | Larger DB, point-in-time recovery, no auto-pause |

The monitoring digest + Axiom combination (free + GitHub Actions) solves the core operational visibility problem without requiring any paid upgrade. The Vercel Pro upgrade adds convenience (native cron, log drain in the Vercel UI) but is not required for the monitoring goals in this document.

---

## Appendix A: File locations

| File | Purpose |
|------|---------|
| `app/api/cron/monitoring-digest/route.ts` | Digest handler (to be created) |
| `lib/resend.ts` | Add `sendMonitoringDigest()` function |
| `app/member-portal/admin/operations/page.tsx` | Add Member Query panel |
| `app/api/admin/member-lookup/route.ts` | Member lookup endpoint (to be created) |
| `components/MemberQueryPanel.tsx` | Client component for Operations page query UI |
| `.github/workflows/monitoring-digest.yml` | GitHub Actions schedule trigger (to be created) |
| `vercel.json` | No changes required (1 cron slot stays as membership-snapshot) |

## Appendix B: Environment variables required

| Variable | Purpose | Status |
|----------|---------|--------|
| `CRON_SECRET` | Authenticates cron requests from GitHub Actions | Already set |
| `RESEND_API_KEY` | Sending the digest email | Already set |
| `NEXT_PUBLIC_SITE_URL` | Digest email portal link | Already set |

No new environment variables are required for the monitoring digest.

## Appendix C: Queries for the digest - copy-paste ready

```sql
-- Emails sent in last 24h by type
SELECT email_type, COUNT(*) as count
FROM email_log
WHERE sent_at >= NOW() - INTERVAL '24 hours'
GROUP BY email_type ORDER BY count DESC;

-- Bounces in last 24h
SELECT COUNT(*) FROM email_bounces
WHERE bounced_at >= NOW() - INTERVAL '24 hours';

-- New members in last 24h
SELECT COUNT(*) FROM members
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- Payment failures in last 24h
SELECT COUNT(*), array_agg(event_email) as affected_emails
FROM member_events
WHERE event_type = 'payment.failed'
  AND created_at >= NOW() - INTERVAL '24 hours';

-- Subscription cancellations in last 24h
SELECT COUNT(*), array_agg(event_email) as affected_emails
FROM member_events
WHERE event_type = 'subscription.cancelled'
  AND created_at >= NOW() - INTERVAL '24 hours';

-- Last backup run
SELECT status, ran_at, error_msg
FROM backup_log
ORDER BY ran_at DESC LIMIT 1;

-- DB size
SELECT admin_get_db_size_bytes() / 1024 / 1024 AS size_mb;
```
