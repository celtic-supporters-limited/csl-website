# CSL Website — Security & Operational Risk Assessment

**Date:** 11 July 2026
**Scope:** Codebase as at branch `develop` (commit `0869193`)
**Prepared for:** Board review — pre-Tranche 2 migration
**Method:** Every finding references the specific file inspected. No assumptions were made.

---

## Finding 1 — Stripe Webhook Security

**Severity: Low (no action required)**

**Current state:** `app/api/webhooks/stripe/route.ts` lines 85–96 read the raw request body using `req.text()` (which preserves the exact bytes Stripe signed), then pass it to `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)`. If the signature is missing or does not match, the handler returns HTTP 400 and stops. The webhook secret is read from the `STRIPE_WEBHOOK_SECRET` environment variable; if that variable is not set the handler returns HTTP 500 before processing any event.

**Risk if left unaddressed:** Not applicable — this is implemented correctly.

**Recommended action:** None. This is a strength.

---

## Finding 2 — Supabase Row Level Security

**Severity: Low (one housekeeping item)**

**Current state:** Every table in the database has Row Level Security (RLS) enabled. Verified across all migration files:

| Table | RLS enabled | Access rule |
|-------|-------------|-------------|
| `members` | Yes | Members see only their own row (`auth.uid() = user_id`) — `sql/rls-members-user-id.sql` |
| `shareholder_cases` | Yes | Members see only cases matching their email JWT claim — `sql/phase-5-schema.sql` |
| `documents` | Yes | Authenticated (logged-in) users only — `sql/add-document-library-columns.sql` |
| `governance_criteria` | Yes | Public read — `sql/add-governance-criteria.sql` |
| `site_config` | Yes | Authenticated users read-only — `sql/add-site-config.sql` |
| `member_events` | Yes | Admin members only — `sql/add-member-events.sql` |
| `membership_snapshots` | Yes | Admin members only — `sql/add-membership-snapshots.sql` |
| `email_log` | Yes | Service role only (intentional — operations page uses service role) — `sql/add-email-log.sql` |
| `email_bounces` | Yes | Service role only — `sql/add-email-bounces.sql` |
| `payments` (legacy) | Yes | Members see own rows via `auth.email()` — `sql/phase-5b-schema.sql` |

**Minor issue:** The `payments` table is documented as obsolete (the portal reads payment history directly from Stripe; the table is never written to). It contains a RLS policy using the old `auth.email()` pattern rather than `auth.uid() = user_id`, meaning a member who has changed their email would see no records (though there are no records to see). The table should be dropped as part of the production cleardown.

**Recommended action:** Add `DROP TABLE IF EXISTS payments; DROP TABLE IF EXISTS events;` to `sql/production-cleardown.sql` before running the go-live cleardown. Both tables are confirmed obsolete in `CLAUDE.md`.

---

## Finding 3 — Environment Variable Hygiene

**Severity: Low (no action required)**

**Current state:** `.gitignore` line 42 contains `.env*.local`, which covers `.env.local`, `.env.test.local`, and all similar files. A search across all TypeScript, JavaScript, and configuration files found no hardcoded API keys, Stripe secrets, Supabase keys, or other credentials. All secrets are accessed exclusively via `process.env.*`.

**Risk if left unaddressed:** Not applicable — this is implemented correctly.

**Recommended action:** None. This is a strength.

---

## Finding 4 — Rate Limiting

**Severity: Low (documented limitation)**

**Current state:** Rate limiting exists on all public-facing POST endpoints, implemented in two layers:

| Endpoint | Custom rate limit | Bot protection |
|----------|------------------|----------------|
| `POST /api/checkout` | 5 requests / IP / 10 min (`app/api/checkout/route.ts`) | Turnstile + honeypot |
| `POST /api/share-tracing` | 5 requests / IP / 10 min (`app/api/share-tracing/route.ts`) | Turnstile |
| `POST /api/proxy` | 5 requests / IP / 10 min (`app/api/proxy/route.ts`) | Turnstile |
| `POST /api/auth/reset-password` | 3 requests / IP / 15 min — returns silent 200 on breach (`app/api/auth/reset-password/route.ts`) | — |
| Login / magic link | Supabase platform default (6 attempts / hour) | — |
| `POST /api/billing-portal` | None — authentication required | — |
| `PATCH /api/profile` | None — authentication required | — |

**Limitation:** All custom rate limiters are stored in server memory. Vercel runs API routes as serverless functions with short lifetimes; a cold start resets the counter. This means the limits are best-effort deterrents, not hard guarantees. This is acknowledged in code comments. The highest-risk endpoint (checkout) is additionally protected by Cloudflare Turnstile, which is not affected by cold starts.

**Risk if left unaddressed:** A determined attacker could reset counters by triggering cold starts. In practice, Turnstile on public forms and Supabase's own limits on auth flows provide the real protection layer.

**Recommended action:** No immediate action required before go-live. For a future hardening sprint, replace in-memory maps with Vercel KV (Redis-backed, survives cold starts). Estimated effort: Medium. Target: within 3 months of go-live.

---

## Finding 5 — Authentication Middleware

**Severity: Low (one minor inconsistency — resolved in PR #75 / PR #76)**

**Current state:** `middleware.ts` protects all routes beginning with `/member-portal` — including `/member-portal/admin/members`, `/member-portal/admin/documents/new`, `/member-portal/documents`, and all sub-routes. Unauthenticated requests are redirected to `/login`.

API routes implement their own authentication independently of the middleware:

| Route | Protection |
|-------|-----------|
| `POST /api/billing-portal` | Supabase session check — `createServerSupabase().auth.getUser()` |
| `GET /api/admin/reporting/export` | Session check + `is_admin = true` database check |
| `POST /api/admin/upload-wp-snapshot` | Session check + `is_admin = true` database check |
| `GET /api/cron/membership-snapshot` | `CRON_SECRET` Bearer token |
| `PATCH /api/governance` | `GOVERNANCE_UPDATE_TOKEN` Bearer token |
| `POST /api/webhooks/stripe` | Stripe signature verification |
| `POST /api/checkout`, `/api/share-tracing`, `/api/proxy` | Public — correct (intake forms) |

**Resolution:** PR #75 removed `req.headers.get("origin")` from `app/api/billing-portal/route.ts` to prevent host-header injection. PR #76 partially restored it after a production regression — `origin` is now the primary source with `NEXT_PUBLIC_SITE_URL` as fallback.

---

## Finding 6 — Error Handling

**Severity: Low (resolved in PR #75)**

**Current state:** Public-facing API routes return generic error messages to the client. Internal error details are written to server logs only.

**Resolved:** `app/api/admin/upload-wp-snapshot/route.ts` line 71 previously returned the raw Supabase error message and code directly to the client. PR #75 replaced this with a generic message; Supabase error detail is now logged server-side only.

**Recommended action:** None — resolved.

---

## Finding 7 — Input Validation

**Severity: Low (no action required)**

**Current state:** All public API routes validate input before writing to the database:

- JSON parse errors are caught with try/catch in every route — malformed requests return HTTP 400, not a 500 crash.
- Required fields are checked (name, email, enquiry type in share tracing and proxy forms).
- Email format is validated against a regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).
- Disposable email domains are blocked via a 17-domain blocklist (`lib/disposable-email-domains.ts`).
- Plan names are validated against a whitelist in checkout.
- Governance criteria status is validated against the set `{red, amber, green}` and IDs are validated as integers 1–12.
- Fan status on the profile update is validated against a database constraint and an allowed-values check.

**Risk if left unaddressed:** Not applicable — this is implemented correctly.

**Recommended action:** None. This is a strength.

---

## Finding 8 — Security Headers

**Severity: High (resolved in PR #75)**

**Previous state:** `next.config.mjs` contained only `Cache-Control` headers for the `/member-portal` path. No HTTP security headers were configured.

**Resolution (PR #75):** The following headers are now applied to all routes:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Frame-Options` | `DENY` | Prevents clickjacking via iframe embedding |
| `X-Content-Type-Options` | `nosniff` | Prevents browsers guessing content type |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information sent to third parties |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Restricts browser feature access |

**Verified:** securityheaders.com scan on 11 July 2026 returned Grade A on both the Preview deployment (pre-merge) and the Production deployment (post-merge). Vercel platform additionally provides `Strict-Transport-Security` (HSTS) at the infrastructure level.

**Deferred:** Content-Security-Policy requires Stripe, Cloudflare Turnstile, and Google Drive iframe exceptions — earmarked for a separate hardening sprint.

---

## Finding 9 — Dependency Vulnerabilities

**Severity: Medium**

**Current state:** `npm audit` reported 7 vulnerabilities (2 moderate, 5 high):

| Package | Severity | Vulnerability | Fix available |
|---------|----------|--------------|---------------|
| `xlsx` | **High** | Prototype Pollution (GHSA-4r6h-8v6p-xvw6) and RegEx Denial of Service (GHSA-5pgg-2g8v-p4x9) | No fix available |
| `postcss` < 8.5.10 | Moderate | XSS via unescaped `</style>` in CSS stringify (GHSA-qx2v-qp2m-jg93) | Via `npm audit fix --force` — installs Next.js 16 (breaking) |
| Next.js | Moderate | Middleware bypass in Pages Router with i18n (GHSA-36qx-fr4f-26g5) | Via `npm audit fix --force` — breaking change |

**Assessment by package:**

- **`xlsx` (High):** Used in `lib/reporting-xlsx.ts` to generate the membership report Excel export downloaded by admins. The Prototype Pollution vulnerability is primarily a risk when parsing untrusted XLSX files — CSL uses the library to write files, not parse them, which reduces the attack surface. The ReDoS vulnerability could be triggered by certain cell content during generation. No fix available — the only remediation is to replace the package. `exceljs` is a maintained alternative.
- **`postcss` (Moderate):** Build-time dependency only; not exposed to runtime user input. Risk is negligible.
- **Next.js middleware bypass (Moderate):** Affects Pages Router with i18n only. CSL uses the App Router with no i18n configuration. **Not exploitable** in this codebase.

**Recommended action:** Replace `xlsx` with `exceljs` in `lib/reporting-xlsx.ts`. Estimated effort: Medium. Target: within 4 weeks of go-live.

---

## Finding 10 — Backup and Recovery

**Severity: Critical**

**Current state:** A scheduled cron job runs every 3 days (`vercel.json`, path `/api/cron/membership-snapshot`). It writes a snapshot of aggregate membership counts and totals to the `membership_snapshots` table. **This is a metrics record, not a database backup.** It captures numbers (how many active members, total revenue) but not individual member records, email addresses, Stripe customer IDs, or any data that could be used to recover the database.

No backup mechanism exists for the member data itself. The database is hosted on Supabase's free tier. Supabase free tier does not include Point-in-Time Recovery (PITR). If the `members` table were accidentally cleared (for example, if `sql/production-cleardown.sql` were run on the production database rather than staging), there is no automated recovery path.

The only data that could be reconstructed after total loss is:
- Stripe: payment and subscription history (accessible in the Stripe dashboard)
- WordPress: the original Pure Baltic export (from before migration)
- Member events: aggregate log entries (these are also in the database being lost)

Individual member profile data (name, phone, fan status, contact preferences) entered on the new platform would be permanently lost.

**Recommended action (choose one):**

1. **Upgrade Supabase Production to Pro (~£20/month):** Enables 7-day PITR. Any accidental deletion can be reversed within 7 days. Requires board approval for the recurring cost.
2. **Scheduled export script (free alternative):** Add a weekly cron that exports all rows from `members` and `shareholder_cases` as JSON, then emails it to `info@celticsupporters.net`. Restoring from this would require a manual re-import but provides a safety net.

**This finding must be resolved before Tranche 2 migration begins.**

---

## Finding 11 — Monitoring and Alerting

**Severity: Medium**

**Current state:** No error monitoring or alerting service is integrated. `package.json` contains no Sentry, Datadog, Logtail, BetterStack, or similar package. Vercel provides function logs viewable in the Vercel dashboard, but these require a volunteer to manually log in and check them. There is no automated notification if:

- The Stripe webhook starts returning errors
- The database becomes unreachable
- A member's welcome email silently fails to send
- An API route starts throwing 500 errors at scale

The Operations page at `/member-portal/admin/operations` shows email send counts and bounce rates, which is useful for email health monitoring, but it is not real-time alerting and only covers the email layer.

**Risk if left unaddressed:** During and after the migration, silent failures could go undetected for days. If the webhook stops processing `checkout.session.completed` events, new members would complete payment but their account would not be activated.

**Recommended action:** Integrate Vercel's built-in log drain with BetterStack (free tier available). Approximately 30 minutes to configure in the Vercel dashboard — no code changes required. Set up an alert for any function returning HTTP 500 more than twice in 5 minutes. Estimated effort: Low. Target: before go-live.

---

## Finding 12 — Branch Protection and CI Pipeline

**Severity: Medium**

**Current state:** No `.github/workflows` directory exists in the repository. There is no automated CI pipeline. Branch protection is configured in GitHub settings (requiring at least one pull request approval before merging to `main`), but this only confirms a second person reviewed the changes — it does not run any automated checks. A pull request that introduces a TypeScript compilation error, a failing test, or a broken build would pass the approval requirement and could be merged to production.

Vercel does run a build on every deployment, so a compile error would cause a deployment failure — this is the current safety net.

**Risk if left unaddressed:** A broken build could deploy to production. Given the migration workload, it is easy to miss a TypeScript error that only surfaces at build time.

**Recommended action:** Add a GitHub Actions workflow file at `.github/workflows/ci.yml` that runs on every pull request to `main`:
- TypeScript compilation check: `npx tsc --noEmit`
- Playwright webhook tests: `npx playwright test tests/stripe-webhook.spec.ts`

Estimated effort: Low. Target: within 4 weeks of go-live.

---

## Prioritised Remediation Table

| # | Finding | Severity | Estimated effort | Status | Target |
|---|---------|----------|-----------------|--------|--------|
| 10 | No database backup or PITR | **Critical** | Low (Supabase upgrade) / Medium (export script) | Open | Before Tranche 2 migration |
| 8 | Missing security headers | **High** | Low | **Resolved — PR #75** | Done |
| 9 | `xlsx` package — high-severity vulnerabilities, no fix available | **Medium** | Medium (replace with `exceljs`) | Open | Within 4 weeks of go-live |
| 11 | No error monitoring or alerting | **Medium** | Low (Vercel log drain + BetterStack) | Open | Before go-live |
| 12 | No CI pipeline | **Medium** | Low (GitHub Actions workflow) | Open | Within 4 weeks |
| 6 | Admin upload route leaked Supabase error details | Low | Low | **Resolved — PR #75** | Done |
| 5 | Billing portal origin header inconsistency | Low | Low | **Resolved — PR #75 / PR #76** | Done |
| 2 | Legacy `payments` and `events` tables not dropped in cleardown | Low | Low | Open | Before production cleardown |
| 4 | In-memory rate limiters reset on cold starts | Low | High (requires Vercel KV) | Open | Within 3 months of go-live |

---

## Items Confirmed Secure

The following areas were reviewed and required no remediation:

- **Stripe webhook signature verification** (Finding 1) — `req.text()` + `constructEvent` implemented correctly
- **Supabase Row Level Security** (Finding 2) — all tables protected; no unguarded member data
- **Environment variable hygiene** (Finding 3) — no hardcoded secrets; `.gitignore` covers all `.env*.local` files
- **Input validation** (Finding 7) — all public routes validate, sanitise, and reject invalid input
