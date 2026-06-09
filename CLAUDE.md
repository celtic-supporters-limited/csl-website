# CSL Website — Claude Code Project Brief

## Organisation

**Celtic Supporters Limited (CSL)** is a not-for-profit shareholder activism organisation
focused on governance-led change at Celtic FC. We are building a new public website to
replace the existing WordPress site at celticsupporters.net, currently managed by Pure Baltic.

The website is operated by two volunteers (Gary Phinn — Volunteer IT Lead, and Martin Kenny —
Shareholder Register Manager) and four directors. All correspondence uses role-based shared
mailboxes under `celticsupporters.net` — **personal names and email addresses are
never exposed externally**.

## Demo Site Reference

A visual HTML prototype of the site lives at `../CSL_Website_Demo/` (one level above the
project root, i.e. `C:\Claude Code Projects\Celtic Supporters Limited\CSL_Website_Demo\`).
When building any page, open the corresponding HTML file, identify all sections, and build
each as a Next.js + Tailwind component.

| Demo file | Next.js route |
|-----------|--------------|
| `index.html` | `app/page.tsx` |
| `membership.html` | `app/membership/page.tsx` |
| `share-tracing.html` | `app/share-tracing/page.tsx` |
| `proxy.html` | `app/proxy/page.tsx` |
| `member-portal.html` | `app/member-portal/page.tsx` |
| `style.css` | `tailwind.config.ts` colours (`csl-dark`, `csl-mid`, `csl-light`) |

**Do NOT copy HTML directly** — translate each section into Next.js + Tailwind components.

## Goals for this website

1. **Membership sign-up and payment** — the primary conversion goal; prospects must be able
   to join CSL and pay a subscription via Stripe Checkout in as few steps as possible.
2. **Shareholder re-tracing** — a self-service page allowing Celtic's ~28,000 shareholders
   to initiate contact about their shares (proxy assignment to CSL or off-market sale).
3. **Proxy assignment** — separate page for shareholders who want to assign their AGM proxy
   vote to CSL without necessarily going through share tracing.
4. **Member portal** — authenticated area for active members: membership status, payment
   history, Members Library (meeting minutes, recordings, governance documents), and enquiry tracking.
5. **Trust and credibility** — the site must convey governance seriousness to Celtic PLC,
   institutional shareholders, and media. It is not a fan site.

## Tech Stack

| Component | Tool / Service | Cost |
|-----------|---------------|------|
| Framework | Next.js 14 (App Router) | Free |
| Styling | Tailwind CSS | Free |
| Hosting | Vercel | Free tier |
| Payments | Stripe | 1.4% + 20p/txn |
| Database + Auth | Supabase (EU region) | Free tier |
| Email sending | Resend | Free (3,000/mo) |
| Version control | GitHub | Free |
| CRM | Zoho CRM (EU data centre) | Free (3 users) |

**Supabase must use the EU region only — never the US region.**

## Brand

| Token | Tailwind name | Hex | Usage |
|-------|--------------|-----|-------|
| `csl-dark` | `csl-dark` | `#1D6130` | Primary brand / headers / buttons |
| `csl-mid` | `csl-mid` | `#2E7D4F` | Secondary / hover states |
| `csl-light` | `csl-light` | `#E8F5EE` | Alternate row / section backgrounds |

In `tailwind.config.ts`:
```js
colors: {
  'csl-dark':  '#1D6130',
  'csl-mid':   '#2E7D4F',
  'csl-light': '#E8F5EE',
}
```

Font: Inter (already in demo via Google Fonts — load via `next/font/google` in layout.tsx).
The Celtic FC crest must NOT appear — CSL is a separate legal entity. Text-based identity only.

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Hero, membership progress bar, financial transparency strip, service cards, Celtic Paradox teaser, how-we-work steps, membership growth panel, CTA |
| Share Tracing | `/share-tracing` | Hero, explainer, 4-step process, intake form |
| Proxy Assignment | `/proxy` | Hero, stats panel, 4-step process, registration form |
| Membership | `/membership` | Pricing tiers, Stripe Checkout, benefit cards, FAQ |
| Membership Success | `/membership/success` | Post-payment confirmation; links to `/signup` |
| Member Portal | `/member-portal` | Authenticated dashboard (see portal tabs below) |
| Login | `/login` | Email + password primary; magic link fallback; forgot password |
| Signup | `/signup` | Post-payment account activation; accepts `?email=` query param |
| Our Team | `/our-team` | Board director cards (4 directors, initials avatar, dark green header) |
| The Celtic Paradox | `/celtic-paradox` | Research page; 3 callout cards; 4 download links (PDF/XLSX); legal disclaimer |
| FAQ | `/faq` | Accordion FAQ; 18 Q&As across 4 sections (client component) |
| Privacy Policy | `/privacy` | 11 numbered GDPR sections |
| Terms & Conditions | `/terms` | 7 numbered sections |
| Membership Agreement | `/membership-agreement` | Member obligations + Volunteer Data Processing Contract |
| Articles of Association | `/articles-of-association` | Full legal document |
| Auth Callback | `/auth/callback` | Handles PKCE codes for magic link and password reset |
| Update Password | `/auth/update-password` | Landed on after password reset email link |

**Member portal tabs:** Dashboard, Subscription, Payments, Members Library (sub-tabs: Meetings, Documents),
My Enquiries, Edit Profile.

## Stripe Membership Tiers

These are the live tiers — **do not change without board approval.**
All five plans use dynamic `price_data`; no pre-created Stripe Price IDs are needed.

| Plan | Price | Billing | `plan_name` stored | `membership_tier` |
|------|-------|---------|-------------------|------------------|
| Standard | £10/month | Monthly subscription | `"Monthly 10"` | `"monthly"` |
| Accelerator | £25/month | Monthly subscription | `"Monthly 25"` | `"monthly"` |
| Custom Monthly | Min £30, £5 inc | Monthly subscription | `"Monthly {N}"` | `"monthly"` |
| Custom Annual | Min £300, £10 inc | Annual subscription | `"Annual {N}"` | `"annual"` |
| Lifetime | £5,000 one-off | Single payment | `"Lifetime Member"` | `"lifetime"` |

**`plan_name` derivation (webhook `derivePlanName()`):**
- `mode === "payment"` → `"Lifetime Member"`
- `interval === "year"` → `"Annual {poundsAmount}"`
- `unit_amount === 1000` → `"Monthly 10"`
- `unit_amount === 2500` → `"Monthly 25"`
- any other monthly → `"Monthly {poundsAmount}"`

**Custom plan validation (enforce client-side AND server-side via `validatePlan()`):**
- Custom Monthly: minimum £30, must be divisible by £5
- Custom Annual: minimum £300, must be divisible by £10

**Important:** `subscription_data` and `payment_intent_data` description fields were removed
from checkout session creation — they caused silent Stripe rejections.

All work uses Stripe test keys only. Test card: `4242 4242 4242 4242`, any future expiry, any CVC.
Do not switch to live keys until go-live sign-off.

## Database Schema

Run migrations in Supabase Dashboard > SQL Editor. Files in `sql/` directory.

```sql
-- Members enrolled after successful Stripe payment
-- Migrations: sql/phase-5-schema.sql, sql/phase-5b-schema.sql,
--             sql/add-is-admin-column.sql, sql/add-payment-failed-at.sql,
--             sql/add-pending-email.sql, sql/add-user-id-to-members.sql,
--             sql/rls-members-user-id.sql
-- RLS: SELECT and UPDATE use auth.uid() = user_id (set by rls-members-user-id.sql)
members (
  id                     uuid primary key default gen_random_uuid(),
  email                  text unique not null,
  name                   text,
  stripe_customer_id     text,
  stripe_subscription_id text,
  membership_tier        text,      -- 'monthly' | 'annual' | 'lifetime'
  plan_name              text,      -- 'Monthly 10' | 'Monthly 25' | 'Monthly N' | 'Annual N' | 'Lifetime Member'
  amount_pence           integer,
  status                 text,      -- 'active' | 'payment_failed' | 'cancelled'
  created_at             timestamptz default now(),
  first_name             text,
  last_name              text,
  phone                  text,
  fan_status             text,      -- 'Season Ticket' | 'Away Member' | 'Home Only' | 'Supporter (no match)'
  contact_email          boolean default true,
  contact_sms            boolean default false,
  contact_telephone      boolean default false,
  is_admin               boolean default false,
  payment_failed_at      timestamptz,                     -- set on invoice.payment_failed; cleared on invoice.paid
  pending_email          text,                            -- set on email change initiation; cleared after confirmation
  user_id                uuid references auth.users(id)   -- backfilled from auth.users by email; RLS uses auth.uid() = user_id
)

-- Payments table (legacy — no longer written to or queried by the portal)
-- Migration: sql/phase-5b-schema.sql created it; webhook INSERT was later removed.
-- Portal Payments tab now reads directly from stripe.charges.list. Table can be dropped.
payments (
  id                       uuid primary key default gen_random_uuid(),
  member_id                uuid references members(id),
  stripe_payment_intent_id text,
  amount_pence             integer not null,
  plan_name                text,
  paid_at                  timestamptz not null,
  status                   text not null default 'completed'
)

-- Share tracing and proxy enquiries from public forms
shareholder_cases (
  id             uuid primary key,
  contact_name   text,
  email          text,
  phone          text,
  case_type      text,      -- 'Share Tracing' | 'Proxy Assignment'
  enquiry_source text,
  notes          text,
  status         text default 'New',  -- 'New' | 'In Progress' | 'Resolved'
  assigned_to    text,
  created_at     timestamptz default now()
)

-- Meeting recordings and governance briefings
-- Migration: sql/add-members-library.sql adds minutes_url TEXT, description TEXT
events (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  event_date    date,
  description   text,
  recording_url text,
  slides_url    text,
  minutes_url   text,
  members_only  boolean default true
)

-- Member-only governance documents (papers, reports, meeting minutes, notices)
-- Migration: sql/add-members-library.sql (original) + sql/add-document-library-columns.sql (adds new columns)
-- Storage: Google Drive - drive_url holds the shareable link; no Supabase Storage bucket
-- To add a document: upload to CSL Google Drive subfolder (documentscsl@gmail.com), right-click
--   -> Get link, then INSERT a row in Supabase with the link in drive_url
-- RLS: authenticated users only; members_only=true rows visible to all logged-in users
documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  category      text,  -- 'Meeting Minutes' | 'Research & Papers' | 'AGM Documents' | 'Governance' | 'Guides & Templates'
  document_type text not null default 'paper',  -- legacy column, kept for backwards compat
  drive_url     text,  -- Google Drive shareable URL (canonical); use /preview transform in DocumentCard
  file_url      text not null,  -- legacy column, kept for backwards compat with Members Library tab
  file_type     text not null default 'PDF',  -- 'PDF' | 'DOCX' | 'XLSX' | 'PPTX'
  published_at  timestamptz not null default now(),
  members_only  boolean not null default true,
  is_published  boolean not null default false,  -- legacy column
  created_at    timestamptz not null default now()
)

-- Runtime-editable key/value settings (AGM date, shares represented count, etc.)
-- Migration: sql/add-site-config.sql
-- Default values: agm_date=NULL, shares_represented='15000'
-- RLS: authenticated users can SELECT; no member UPDATE (admin-only via service role)
site_config (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
)
```

## Authentication

- **Primary:** email + password via `supabase.auth.signInWithPassword()`
- **Fallback:** magic link via `signInWithOtp()` — accessible via "Send me a login link instead"
- **New member flow:** `/membership/success` → `/signup?email=xxx` → `signUp()` → portal
- **Password reset:** `/login` "Forgot password" → `POST /api/auth/reset-password`
  → Supabase emails link → `/auth/callback?redirectTo=/auth/update-password`
  → `updateUser({ password })` → portal
- **Auth callback** (`/auth/callback`): handles PKCE codes for both magic links and
  password resets via the same `code` + `redirectTo` pattern — no separate handling needed
- **Post-auth redirect:** uses `window.location.href = '/member-portal'` (not `router.push`)
  so the browser sends the new Supabase session cookie with the request and the middleware
  sees the session immediately. `router.push` without a prior `router.refresh()` races the
  cookie and causes the middleware to redirect back to login.

**IMPORTANT:** Users who first authenticated via magic link have no password set. They must
use the "Forgot password" flow to set one — `signUp()` will reject already-registered emails.

**Supabase Auth settings required:**
- Email provider: enabled
- Confirm email: **OFF** (members have already verified intent via Stripe payment)
- Site URL: set to production domain in Supabase Dashboard > Authentication > URL Configuration

## Key API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/checkout` | Creates Stripe Checkout session; all plans use dynamic `price_data` |
| `POST` | `/api/webhooks/stripe` | Handles `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed` |
| `POST` | `/api/billing-portal` | Creates Stripe Billing Portal session (requires portal config in Stripe Dashboard) |
| `PATCH` | `/api/profile` | Updates member profile fields (auth-verified) |
| `POST` | `/api/auth/reset-password` | Triggers Supabase password reset email; always returns 200 |
| `POST` | `/api/share-tracing` | Validates + inserts share tracing enquiry into `shareholder_cases` |
| `POST` | `/api/proxy` | Validates + inserts proxy assignment enquiry into `shareholder_cases` |

## Zoho CRM Integration

- API base: `https://www.zohoapis.eu/crm/v2` — **EU data centre only, never `.com`**
- On intake form submit: call `lib/zoho.ts` → `findOrCreateZohoContact()` then `createZohoCase()`
- Case types: `Share Tracing` | `Proxy Assignment`
- Zoho calls must be **non-blocking** (fire-and-forget, catch errors, never throw)
- Env vars: `ZOHO_ACCESS_TOKEN`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`
- **Currently a stub** — logs only, no real API calls. Implement when Zoho env vars are set.

## Email (Resend)

- All outbound email sent via Resend from verified `.co.uk` or `.com` domain (not `.net`)
- Volunteer notification: new intake form → notify `shares@celticsupporters.net` or `proxy@celticsupporters.net`
- Member welcome email: sent from `membership@celticsupporters.net` after Stripe success
- Env var: `RESEND_API_KEY`
- All Resend calls wrapped in try/catch — email failure must never block a form submission
- **Currently not implemented** — placeholder only. Implement when `RESEND_API_KEY` is set.

## Key Role-Based Contacts (never use personal addresses externally)

| Purpose | Address |
|---------|---------|
| General | `info@celticsupporters.net` |
| Membership | `membership@celticsupporters.net` |
| Press | `press@celticsupporters.net` |
| Share re-tracing | `shares@celticsupporters.net` |
| Proxy | `proxy@celticsupporters.net` |

## Constraints

- **No personal names on the site** — use role titles only ("Volunteer IT Lead", "Shareholder
  Register Manager", "Director"). Volunteer identities are protected.
- **GDPR compliant** — all forms must have explicit consent checkbox; privacy policy page
  required before Stripe goes live.
- **Mobile-first** — majority of members will use phones.
- **Accessible** — WCAG AA minimum; semantic HTML, sufficient colour contrast.
- **No analytics in v1** — add only after consent framework is in place.
- **No em dashes** — use hyphens. Avoid AI-obvious phrasing.
- **Never commit `.env` files or secret keys to GitHub.**
- **All personal data must stay EU/UK** — Supabase EU region only.

## Development Conventions

- TypeScript throughout; strict mode on
- Component files: `components/Nav.tsx`, `components/Footer.tsx`, `components/Container.tsx`
  - `components/Container.tsx` — shared layout primitive: `max-w-7xl mx-auto px-6 lg:px-8`; accepts `className` prop. Used in Nav, Footer, and every public page. **All new sections must use Container — never hardcode `px-[5%]` or `max-w-[1100px]` on sections.**
- API routes: `app/api/<resource>/route.ts`
- Lib files: `lib/stripe.ts`, `lib/supabase.ts`, `lib/supabase-browser.ts`, `lib/zoho.ts`, `lib/resend.ts`
  - `lib/supabase.ts` — service-role client (`getSupabase()`) + server auth client (`createServerSupabase()`); server-side only
  - `lib/supabase-browser.ts` — anon key browser client (`createBrowserSupabase()`); client components only
- File naming: lowercase, hyphenated
- Commit messages: imperative present tense ("Add hero section to home page")

## Environment Variables

Required in Vercel (Project Settings > Environment Variables) and `.env.local` for local dev:

| Variable | Purpose | Status |
|----------|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for API routes (never expose to browser) | Required |
| `STRIPE_SECRET_KEY` | Stripe API key — test key until go-live | Required |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Required |
| `NEXT_PUBLIC_SITE_URL` | Production URL — used as fallback for redirect URLs | Recommended |
| `RESEND_API_KEY` | Resend email API key | When email enabled |
| `ZOHO_ACCESS_TOKEN` | Zoho CRM access token | When CRM enabled |
| `ZOHO_CLIENT_ID` | Zoho CRM client ID | When CRM enabled |
| `ZOHO_CLIENT_SECRET` | Zoho CRM client secret | When CRM enabled |

## Deployment

- **Hosting:** Vercel — auto-deploys on push to `main`
- **Production URL:** https://csl-website-ten.vercel.app
- **GitHub repo:** `celtic-supporters-limited/csl-website` (`main` branch)
- **Supabase project:** EU West (Ireland) — EU data residency confirmed

## Deployment Process (preview before production)

All changes must go through a pull request — never push directly to `main`.

**Branches:**
- `main` — production branch; protected, requires PR + 1 approval before merging
- `develop` — default working branch; Vercel auto-generates a Preview URL on every push
- Feature branches — cut from `develop` for larger pieces of work, merged back to `develop`

**Workflow for each Claude Code session:**
1. Work on `develop` (or a feature branch off `develop`)
2. Push to origin — Vercel builds a Preview deployment automatically
3. Review the Preview URL to confirm the change looks correct
4. Open a Pull Request from `develop` (or feature branch) into `main`
5. Approve the PR after reviewing the Preview — merge triggers a Production deployment

**GitHub branch protection (main):**
- Require a pull request before merging
- Require at least 1 approval (Gary Phinn is the approver)
- Do not allow bypassing the above settings

**Starting a session:**
```powershell
git checkout develop
git pull origin develop
# ... make changes ...
git push origin develop
# review Vercel Preview, then open PR to main
```

**SQL migrations — run in order in Supabase Dashboard > SQL Editor:**
1. `sql/phase-5-schema.sql` — creates `members`, `events` tables + RLS policies
2. `sql/phase-5b-schema.sql` — adds new `members` columns, creates `payments` table + RLS
3. `sql/add-members-library.sql` — extends `events` with `minutes_url`/`description`; creates `documents` table + RLS; seeds 14th Members Meeting and The Celtic Paradox paper
4. `sql/add-governance-criteria.sql` — creates `governance_criteria` table + RLS; seeds all 12 demands
5. `sql/add-document-library-columns.sql` — adds `category`, `drive_url`, `file_type`, `members_only` to `documents`; updates RLS; fixes Celtic Paradox stub URL; seeds April 2026 meeting minutes
6. `sql/add-is-admin-column.sql` — adds `is_admin boolean default false` to `members`
7. `sql/add-payment-failed-at.sql` — adds `payment_failed_at timestamptz` to `members`
8. `sql/add-site-config.sql` — creates `site_config` table + RLS; seeds `agm_date` and `shares_represented`
9. `sql/add-pending-email.sql` — adds `pending_email text` to `members` (self-service email change)
10. `sql/add-user-id-to-members.sql` — adds `user_id uuid references auth.users(id)` to `members`; backfills by email match; creates index
11. `sql/rls-members-user-id.sql` — replaces email-based RLS policies with `auth.uid() = user_id` policies

**Stripe webhook registration:**
URL: `https://csl-website-ten.vercel.app/api/webhooks/stripe`
Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`

## Known Issues / Pending

- **Stripe billing portal** — requires one-time configuration in Stripe Dashboard >
  Billing > Customer portal settings before `billingPortal.sessions.create` will work
- **Live Stripe account** — "Build a platform or marketplace" setting is enabled;
  requires director sign-off to disable before go-live
- **Pure Baltic webhooks** — live Stripe account still has webhook endpoints pointing to
  `dev.purebaltic.co.uk`; pending board review and cutover to new endpoint
- **Zoho CRM** — integration is a stub (logs only); implement when `ZOHO_*` env vars are set
- **Resend email** — welcome email and intake form notifications are placeholders;
  implement when `RESEND_API_KEY` is set
- **Members Library Google Drive URLs** — `minutes_url`, `recording_url`, and `slides_url`
  on the `events` table are still stubbed (`STUB_` prefix). Replace with real Drive links.
  The `documents` table now has real Drive URLs for The Celtic Paradox and April 2026 minutes
  (set via `sql/add-document-library-columns.sql`).
- **`sql/add-document-library-columns.sql`** — must be run in Supabase before the Document
  Library page at `/member-portal/documents` shows documents. Also fixes Celtic Paradox stub URL.

## Session Start Prompt (copy-paste to begin each Claude Code session)

> We are building the CSL public website using Next.js 14 (App Router), Tailwind CSS,
> Stripe, Supabase (EU), Resend, and Zoho CRM. The CLAUDE.md in this folder has the full
> brief. The HTML demo lives at `../CSL_Website_Demo/` — read the relevant HTML file before
> building any page. Today's focus is [INSERT TODAY'S TASK HERE]. Please read CLAUDE.md
> and confirm the component/route you are about to build before starting.

## Project Location

```
C:\Claude Code Projects\Celtic Supporters Limited\csl-website\
```

To start a session:
```powershell
cd "C:\Claude Code Projects\Celtic Supporters Limited\csl-website"
git checkout develop
git pull origin develop
claude
```

## Build Progress

### Completed

**Phase 1 — Scaffold**
Next.js 14 (App Router, TypeScript, Tailwind), CSL brand colours in `tailwind.config.ts`,
Inter font, shared `components/Nav.tsx` and `components/Footer.tsx`, full home page
(`app/page.tsx`): Hero, Stats Bar, Service Cards, How We Work steps, Why It Matters, CTA.
Deployed to Vercel; GitHub remote at `celtic-supporters-limited/csl-website` on `main`.

**Phase 2 — Share Tracing** (`app/share-tracing/`)
Full page matching demo. Client form with GDPR consent checkbox, inline success/error states.
`POST /api/share-tracing` validates input, inserts to `shareholder_cases`
(`case_type: 'Share Tracing'`), fire-and-forget Zoho stub. `lib/supabase.ts` lazy-initialised
(throws at call time, not module load). `lib/zoho.ts` stub logs only, never throws.

**Phase 3 — Membership + Stripe Checkout** (`app/membership/`)
Five-tier plan grid (Standard £10/mo, Accelerator £25/mo, Custom Monthly min £30/£5 inc,
Custom Annual min £300/£10 inc, Lifetime £5,000 one-off). All five use dynamic `price_data`
- no pre-created Stripe price IDs needed. Client-side and server-side amount validation for
custom tiers. Two-step UX: card select -> summary panel -> Stripe redirect.
`POST /api/checkout` creates Stripe Checkout session. No `subscription_data` or
`payment_intent_data` fields (removed — caused silent Stripe rejections).
`/membership/success` links to `/signup`. `lib/stripe.ts` lazy-initialised with shared
`validatePlan()`. Required env var: `STRIPE_SECRET_KEY`.

**Phase 4 — Proxy Assignment** (`app/proxy/`)
Full page matching demo: Hero, proxy explainer (2-col with stats panel), 4-step process,
registration form. Client form with GDPR consent. `POST /api/proxy` inserts to
`shareholder_cases` (`case_type: 'Proxy Assignment'`), fire-and-forget Zoho stub.

Also: `app/articles-of-association/` — full Articles of Association page; linked from footer.
Footer updated with X, Bluesky, LinkedIn social links and legal details (registered office,
Company No. SC862186, ICO ZB985030, LEI 984500CDVAFEBEF83781).

**Phase 5 — Authentication + Member Portal**
Auth: email + password primary (`signInWithPassword`), magic link fallback (`signInWithOtp`).
`/login` page with `LoginForm.tsx` client component (4 views: password, forgot, magic, sent).
`/signup` page for post-payment account activation (`signUp()`).
`POST /api/auth/reset-password` triggers Supabase password reset; always returns 200.
`/auth/update-password` — `updateUser({ password })` after clicking reset link.
`/auth/callback` handles PKCE codes for magic link and password reset via same route.
`middleware.ts` protects `/member-portal`, refreshes session tokens on every request.
Portal (`app/member-portal/`) — server component fetches member + events + cases + documents +
live Stripe subscription data; passes to `PortalClient.tsx`. Portal has
six tabs: Dashboard, Subscription, Payments, Members Library (Meetings + Documents sub-tabs),
My Enquiries, Edit Profile. Payments sourced from `stripe.charges.list`; Supabase payments
table no longer used by the portal.
`lib/supabase-browser.ts` exports `createBrowserSupabase()` (anon key, client components).
`lib/supabase.ts` gains `createServerSupabase()` (anon key + cookie adapter, server only).
`sql/phase-5-schema.sql` — `members`, `events` tables + RLS.
Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`.

**Phase 5b — Portal Expansion**
`sql/phase-5b-schema.sql` adds 10 new columns to `members` (plan_name, amount_pence,
stripe_subscription_id, first_name, last_name, phone, fan_status, contact_email/sms/telephone)
and creates the `payments` table with RLS.
Portal Subscription tab: shows live Stripe subscription data (next payment date/amount, card
brand/last4/expiry) fetched via `subscriptions.retrieve` with expanded payment method; falls
back to "Payment details will appear after your next renewal" when no subscription ID.
`POST /api/billing-portal` creates Stripe Billing Portal session for card updates.
`PATCH /api/profile` validates and updates profile fields (fan_status constrained to allowed
values). Edit Profile tab: first/last name, phone, fan status dropdown, contact preference
checkboxes (email required, SMS + telephone optional).
Payments tab: initially read from Supabase payments table — superseded in Phase 7 by
`stripe.charges.list` (see Phase 7 for current behaviour).

**Phase 6 — Stripe Webhook** (`app/api/webhooks/stripe/`)
`POST /api/webhooks/stripe` verifies Stripe signature (returns 400 on failure).
`checkout.session.completed`: retrieves full session with expanded line_items + customer;
derives `membership_tier` and `plan_name` from mode/interval/unit_amount; upserts `members`
row (including `stripe_subscription_id`, `amount_pence`). Payments table INSERT removed —
portal now reads payment history directly from `stripe.charges.list`.
`customer.subscription.deleted`: sets `status = 'cancelled'` by `stripe_customer_id`.
`invoice.payment_failed`: sets `status = 'payment_failed'` by `stripe_customer_id`.
Handler errors return 200 to prevent Stripe retrying transient failures.
Required env var: `STRIPE_WEBHOOK_SECRET`.
Webhook endpoint: `https://csl-website-ten.vercel.app/api/webhooks/stripe`.

**Phase 7 — Members Library + portal fixes**
Nav button swaps "Member Login" / "Member Portal" based on live Supabase session
(`onAuthStateChange` in `Nav.tsx`). Post-auth redirect uses `window.location.href` to
ensure middleware sees the session cookie before navigation. Stripe `current_period_end`
field corrected for dahlia API (moved to `items[0].current_period_end`). Payments tab
now reads from `stripe.charges.list`; generic Stripe descriptions fall back to
`member.plan_name`. Recordings Library replaced by Members Library with two sub-tabs:
Meetings (backed by `events` table, with Minutes/Recording/Slides buttons) and Documents
(backed by new `documents` table). STUB_ URLs render as disabled "Coming soon" buttons.
`sql/add-members-library.sql` extends `events` with `minutes_url` and `description`;
creates `documents` table with RLS; seeds 14th Members Meeting and The Celtic Paradox paper.
Google Drive URLs are stubbed — replace with real Drive share links before go-live.

**Phase 8 — Public Pages, Brand Refresh + Layout System**

Six new public pages: `/our-team` (4 director cards, initials avatars, dark green header bands),
`/celtic-paradox` (research page, 3 callout cards, 4 download links, legal disclaimer),
`/faq` (client component accordion, 18 Q&As across 4 sections), `/privacy` (11 GDPR sections),
`/terms` (7 sections), `/membership-agreement` (member obligations + volunteer data processing contract).

Navigation: The Celtic Paradox added to main links. About hover-dropdown added (Our Team, FAQs,
Articles of Association). Gold active-page indicator; inactive links white/80 + hover white.
Mobile hamburger: animated 3-line → X toggle, full dropdown with all links, auto-closes on route
change. Footer: all `#` placeholder links replaced; Terms & Conditions and Membership Agreement added.

Brand palette (Option C — Deep Forest Green):
- `csl-dark` #1B4D2E, `csl-mid` #246038, `csl-light` #F8F6F1, `csl-gold` #C8A951
- Playfair Display added via `next/font` (variable `--font-playfair`); h1/h2/h3 globally
  set to serif in `globals.css`; body remains Inter
- Nav: `bg-csl-dark` sticky, white links, gold active state, gold "Join CSL" CTA (h-11 logo),
  white ghost "Member Login" button

CSL logo: downloaded from `celticsupporters.net` → `public/images/csl-logo.png`; rendered via
`next/image` at `h-11 w-auto` in Nav.

Homepage redesign:
- Hero: "Own Your Club. Shape Its Future." (Playfair Display h1), gold CTAs
- Membership progress bar: `CURRENT_MEMBERS = 487`, `MEMBER_TARGET = 5000`, gold bar on dark
  green, hardcoded (will wire to Stripe later)
- Financial transparency strip: Members 487 + Shares Held 15,000 (hardcoded; Invested deferred)
- Services, How We Work (gold arrows), Celtic Paradox teaser, Why It Matters, CTA all updated

Layout system — `components/Container.tsx` (`max-w-7xl mx-auto px-6 lg:px-8`):
Applied to Nav inner bar, Nav mobile menu, Footer, and all 10 public pages. Hero sections keep
full-width coloured background; `<Container className="relative z-10">` wraps content so nav logo,
hero headlines, body headings, card grids and footer all share the same left edge.

**Phase 9 — Spam Protection**

Cloudflare Turnstile bot-protection widget added to the membership checkout panel
(`app/membership/MembershipPlans.tsx`). Widget renders below the email field; token
is required before `proceedToStripe()` sends the request. Server-side verification
in `app/api/checkout/route.ts` calls `challenges.cloudflare.com/turnstile/v0/siteverify`
before any plan or email checks. Dev uses Cloudflare dummy test keys (always pass).
New env vars: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`.

Honeypot field (`name="website"`, `display:none`) added to `app/proxy/ProxyForm.tsx`.
Bot submissions that fill the hidden field are silently swallowed — form shows the
normal success state without hitting the API.

Disposable email blocklist (`lib/disposable-email-domains.ts`) — 17 domains. Checked
in `app/api/checkout/route.ts` after email regex validation, and in
`app/api/webhooks/stripe/route.ts` after extracting `customer_details.email`.
Returns 400 with "Please use a permanent email address to register."

In-memory rate limiter in `app/api/checkout/route.ts`: 5 requests per IP per 10 minutes.
Returns 429 on breach. Resets on cold starts; best-effort deterrent only.

**Phase 10 — Governance Dashboard**
Public page at `/governance` showing CSL's 12-point Celtic Paradox Accountability Framework.
`governance_criteria` table in Supabase (id 1-12, tier, demand, status, commentary, last_reviewed).
ISR page (`revalidate=3600`); `components/GovernanceDashboard.tsx` is a pure presentational
component receiving criteria as props (auth-ready: adding a session guard to `page.tsx` is the
only change needed to restrict to members). Hero, summary score bar (Met/Partial/Not Met pills),
three tier sections with criterion cards, explainer, CTA footer.
`PATCH /api/governance` — Bearer token endpoint (GOVERNANCE_UPDATE_TOKEN env var) for updating
criterion status/commentary without a database UI.
Nav reordered: Home / Take Action / About / Governance / Membership. Footer adds Accountability column.
SQL: `sql/add-governance-criteria.sql`. Env var: `GOVERNANCE_UPDATE_TOKEN`.

**Phase 11 — Member Document Library**
Dedicated route at `/member-portal/documents` for member-only document access.
Documents stored in CSL Google Drive (documentscsl@gmail.com); Supabase `documents` table holds
only metadata and the Drive shareable link — no Supabase Storage, no file uploads.
`sql/add-document-library-columns.sql` adds `category`, `drive_url`, `file_type`, `members_only`
to the existing `documents` table; replaces old RLS policy; seeds Celtic Paradox (real URL) and
April 2026 meeting minutes.
Architecture: `app/member-portal/documents/page.tsx` (server component, fetches with auth client)
-> `components/DocumentLibrary.tsx` (client component, category filter pills) ->
`components/DocumentCard.tsx` (static card; transforms drive_url to /preview for clean viewer).
Portal sidebar (`PortalClient.tsx`) gains a "Document Library" Link item (navigates to the
standalone route; active state via usePathname). Unauthenticated access redirects to /login via
middleware. Drive URL transformation: `.../view?usp=...` -> `.../preview` at render time only;
`drive_url` in DB stores the standard shareable link unchanged.

**Session 2026-06-09 — Self-service email change + user_id alignment**

*PR #8 — Self-service email change (core)*
Members can change their login email from the Edit Profile tab without contacting a volunteer.
Flow: `supabase.auth.updateUser({ email, emailRedirectTo })` triggers Supabase to send a
confirmation email to the new address. `emailRedirectTo` must use `NEXT_PUBLIC_SITE_URL`
directly — never `window.location.origin` — because Supabase only honours whitelisted redirect
URLs and preview subdomain URLs are not on that list. On confirmation click, `/auth/callback`
detects `type=email_change`, looks up the member row by `pending_email`, and performs four
updates atomically: `members.email`, clears `members.pending_email`, updates the Stripe
customer email, and bulk-updates `shareholder_cases.email` so My Enquiries remains populated.
SQL: `sql/add-pending-email.sql`.

*PR #9 — user_id alignment*
Added `user_id UUID REFERENCES auth.users(id)` to `members`. SQL migration backfills by
email match. RLS policies replaced with `auth.uid() = user_id`. Portal page tries user_id
lookup first, falls back to email with `console.warn` for unmigrated rows (safe until Supabase
confirms the backfill). All portal queries changed from `.eq("email", user.email)` to
`.eq("user_id", user.id)`. Note: `auth.admin.getUserByEmail()` does not exist in the installed
`@supabase/auth-js` version — the webhook does not set `user_id` on new members (handled by
the backfill migration + fallback guard). SQL: `sql/add-user-id-to-members.sql`,
`sql/rls-members-user-id.sql`.

*PR #10 — Persistent pending banner + enquiry visibility*
Added `pending_email` to `Member` type. Edit Profile tab shows an amber banner whenever
`member.pending_email` is non-null (reads from DB — survives page reload). Banner reads:
"Email change pending. A confirmation link was sent to [address]. Check your inbox..."
`/auth/callback` updated to capture `previousEmail` before overwriting `members.email`, then
bulk-updates `shareholder_cases.email` so member enquiries remain visible post-change.

*PR #11 — PATCH response guard + cancel pending change*
The `pending_email` PATCH was fire-and-forget; now checks response and shows `errorMsg` on
failure before suppressing the confirmation banner. Added "Cancel pending change" button
inside the amber banner — PATCHes `{ pending_email: null }`, calls `router.refresh()` on
success, shows inline `cancelError` on failure. Two new state vars: `cancellingPending`,
`cancelError`. `/api/profile` already handles `null` correctly via `pe || null` coercion —
no API changes needed.

**Phase 12 — Security hardening (architecture review P1 fixes)**
Rate limiter added to `POST /api/auth/reset-password`: 3 requests per IP per 15 minutes.
On breach the endpoint returns `200 { sent: true }` (identical to the legitimate response)
so the limit is not detectable by a caller. Resets on cold starts; best-effort deterrent only.
Test card hint ("Test mode: use card 4242 4242 4242 4242") removed from the checkout summary
panel in `app/membership/MembershipPlans.tsx` — text was visible to all public visitors.

**Phase 13 — Intake notification emails**
`lib/resend.ts` gains `sendShareTracingNotification()` and `sendProxyNotification()`, both
accepting `{ name, email, message, submittedAt }`. Shared `intakeHtml()` helper produces a
simple HTML body with submitter details and a Supabase login prompt. Both send to
`info@celticsupporters.net`. Missing `RESEND_API_KEY` is handled gracefully — logs and
returns, never throws. Called fire-and-forget (IIFE with try/catch) in
`app/api/share-tracing/route.ts` and `app/api/proxy/route.ts` immediately after the
successful Supabase insert — a failed notification never blocks the form response.

**Phase 14 — Welcome email on membership checkout**
`lib/resend.ts` gains `sendWelcomeEmail({ name, email, planName })`. Subject: "Welcome to
Celtic Supporters Limited". Body greets member by name (falls back to "Member" if Stripe
returns null), confirms their plan, links to `/member-portal`, and closes with the mission
line "Together we are building the shareholder voice Celtic FC needs." Called fire-and-forget
in `app/api/webhooks/stripe/route.ts` inside `checkout.session.completed` immediately after
the successful upsert — a failed email never affects the webhook `200` response.

## Document Library

- **Route:** `/member-portal/documents` — members only (middleware auth guard)
- **Storage:** CSL Google Drive (`documentscsl@gmail.com`) — NOT Supabase Storage, no storage costs
- **Metadata:** `documents` table in Supabase (`category`, `drive_url`, `file_type`, `published_at`, `members_only`)
- **Access model:** soft gate — must be logged in to see links; Drive files set to "anyone with the link - viewer"
- **Drive URL transform:** `drive_url` stores the standard `/view?usp=drive_link` shareable URL; `DocumentCard.tsx` converts to `/preview` at render time for a clean viewer with no Drive chrome
- **To add a document:**
  1. Upload file to the correct CSL Google Drive subfolder (no sharing step - root folder is already shared)
  2. Right-click -> Get link -> Copy link
  3. In Supabase table editor, insert a row into `documents` with: `title`, `description`, `category` (one of the five values), `drive_url` (the link), `file_type` (PDF/DOCX/etc), `published_at` (document date, not today), `members_only = true`
- **Categories:** Meeting Minutes | Research & Papers | AGM Documents | Governance | Guides & Templates
- **No upload endpoint, no signed URLs, no storage API calls**

### Next — Go-Live Checklist
- Configure Stripe Billing Portal in Dashboard > Billing > Customer portal settings
- Board sign-off on Pure Baltic webhook cutover
- Disable "Build a platform or marketplace" in live Stripe account (director sign-off)
- Switch `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to live values
- Implement Resend welcome email on `checkout.session.completed`
- Implement Zoho CRM integration (replace stubs in `lib/zoho.ts`)
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel production environment
