# CSL Website — Claude Code Project Brief

## Organisation

**Celtic Supporters Limited (CSL)** is a not-for-profit shareholder activism organisation
focused on governance-led change at Celtic FC. We are building a new public website to
replace the existing WordPress site at celticsupporters.net, currently managed by Pure Baltic.

The website is operated by two volunteers (Gary Phinn — Volunteer IT Lead, and Martin Kenny —
Shareholder Register Manager) and four directors. All correspondence uses role-based shared
mailboxes under `celticsupporterslimited.net` — **personal names and email addresses are
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
   history, meeting recordings, and enquiry tracking.
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
| Home | `/` | Hero, stats bar, service cards, how-we-work steps, membership growth panel, CTA |
| Share Tracing | `/share-tracing` | Hero, explainer, 4-step process, intake form |
| Proxy Assignment | `/proxy` | Hero, stats panel, 4-step process, registration form |
| Membership | `/membership` | Pricing tiers, Stripe Checkout, benefit cards, FAQ |
| Membership Success | `/membership/success` | Post-payment confirmation; links to `/signup` |
| Member Portal | `/member-portal` | Authenticated dashboard (see portal tabs below) |
| Login | `/login` | Email + password primary; magic link fallback; forgot password |
| Signup | `/signup` | Post-payment account activation; accepts `?email=` query param |
| Articles of Association | `/articles-of-association` | Full legal document |
| Auth Callback | `/auth/callback` | Handles PKCE codes for magic link and password reset |
| Update Password | `/auth/update-password` | Landed on after password reset email link |

**Member portal tabs:** Dashboard, Subscription, Payments, Recordings Library,
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
-- Migration: sql/phase-5-schema.sql + sql/phase-5b-schema.sql
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
  contact_telephone      boolean default false
)

-- Payments logged on checkout.session.completed
-- Migration: sql/phase-5b-schema.sql
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
events (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  event_date    date,
  recording_url text,
  slides_url    text,
  members_only  boolean default true
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
- Volunteer notification: new intake form → notify `shares@celticsupporterslimited.net` or `proxy@celticsupporterslimited.net`
- Member welcome email: sent from `membership@celticsupporterslimited.net` after Stripe success
- Env var: `RESEND_API_KEY`
- All Resend calls wrapped in try/catch — email failure must never block a form submission
- **Currently not implemented** — placeholder only. Implement when `RESEND_API_KEY` is set.

## Key Role-Based Contacts (never use personal addresses externally)

| Purpose | Address |
|---------|---------|
| General | `info@celticsupporterslimited.net` |
| Membership | `membership@celticsupporterslimited.net` |
| Press | `press@celticsupporterslimited.net` |
| Share re-tracing | `shares@celticsupporterslimited.net` |
| Proxy | `proxy@celticsupporterslimited.net` |

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
- Component files: `components/Nav.tsx`, `components/Footer.tsx`
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

**SQL migrations to run before using the portal:**
1. `sql/phase-5-schema.sql` — creates `members`, `events` tables + RLS policies
2. `sql/phase-5b-schema.sql` — adds new `members` columns, creates `payments` table + RLS

**Stripe webhook registration:**
URL: `https://csl-website-ten.vercel.app/api/webhooks/stripe`
Events: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`

## Known Issues / Pending

- **Stripe billing portal** — requires one-time configuration in Stripe Dashboard >
  Billing > Customer portal settings before `billingPortal.sessions.create` will work
- **Live Stripe account** — "Build a platform or marketplace" setting is enabled;
  requires director sign-off to disable before go-live
- **Pure Baltic webhooks** — live Stripe account still has webhook endpoints pointing to
  `dev.purebaltic.co.uk`; pending board review and cutover to new endpoint
- **Privacy policy page** — required before Stripe live keys are switched on (GDPR)
- **Zoho CRM** — integration is a stub (logs only); implement when `ZOHO_*` env vars are set
- **Resend email** — welcome email and intake form notifications are placeholders;
  implement when `RESEND_API_KEY` is set
- **`SUPABASE_SERVICE_ROLE_KEY`** not listed in the minimum env vars above — must be set
  or all Supabase API route calls will throw at runtime

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
Portal (`app/member-portal/`) — server component fetches member + events + cases + payments +
live Stripe subscription data (two-batch fetch); passes to `PortalClient.tsx`. Portal has
six tabs: Dashboard, Subscription, Payments, Recordings Library, My Enquiries, Edit Profile.
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
Payments tab: table of paid_at, plan_name, amount, payment intent ref (last 8 chars), status.

**Phase 6 — Stripe Webhook** (`app/api/webhooks/stripe/`)
`POST /api/webhooks/stripe` verifies Stripe signature (returns 400 on failure).
`checkout.session.completed`: retrieves full session with expanded line_items + customer;
derives `membership_tier` and `plan_name` from mode/interval/unit_amount; upserts `members`
row (including `stripe_subscription_id`, `amount_pence`); inserts row into `payments` table.
`customer.subscription.deleted`: sets `status = 'cancelled'` by `stripe_customer_id`.
`invoice.payment_failed`: sets `status = 'payment_failed'` by `stripe_customer_id`.
Handler errors return 200 to prevent Stripe retrying transient failures.
Required env var: `STRIPE_WEBHOOK_SECRET`.
Webhook endpoint: `https://csl-website-ten.vercel.app/api/webhooks/stripe`.

### Next — Go-Live Checklist
- Configure Stripe Billing Portal in Dashboard > Billing > Customer portal settings
- Privacy policy page (GDPR requirement before live Stripe keys)
- Board sign-off on Pure Baltic webhook cutover
- Disable "Build a platform or marketplace" in live Stripe account (director sign-off)
- Switch `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to live values
- Implement Resend welcome email on `checkout.session.completed`
- Implement Zoho CRM integration (replace stubs in `lib/zoho.ts`)
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel production environment
