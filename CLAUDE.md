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
| Share Tracing | `/share-tracing` | Hero, explainer, 4-step process, intake form → Supabase + Zoho |
| Proxy Assignment | `/proxy` | Hero, stats panel, 4-step process, registration form → Supabase + Zoho |
| Membership | `/membership` | Pricing tiers, Stripe Checkout, benefit cards, FAQ |
| Member Portal | `/member-portal` | Authenticated: dashboard, subscription, recordings, enquiries, settings |
| Login | `/login` | Magic-link login via Supabase Auth |
| Membership Success | `/membership/success` | Post-payment confirmation, Supabase enrolment, welcome email |

## Stripe Membership Tiers

These are the live tiers from celticsupporters.net/member-plans/ — **do not change without
board approval.** The two fixed-price plans use pre-created Stripe price IDs. The three
variable plans require dynamic `price_data` objects at checkout creation time.

| Plan | Price | Billing | Stripe implementation |
|------|-------|---------|----------------------|
| Standard | £10/month | Monthly subscription | Dynamic `price_data`, amount hardcoded £10 |
| Accelerator | £25/month | Monthly subscription | Dynamic `price_data`, amount hardcoded £25 |
| Custom Monthly | Min £30, £5 increments | Monthly subscription | Dynamic `price_data` (unit_amount set by user input) |
| Custom Annual | Min £300, £10 increments | Annual subscription | Dynamic `price_data` (unit_amount set by user input) |
| Lifetime | £5,000 one-off | Single payment | `mode: 'payment'`, dynamic `price_data` |

**Plan descriptions (from live site — use this copy verbatim):**
- **Standard £10/month**: "Help activate the supporter base and fund the work needed to trace
  shares, build membership and establish CSL as a credible shareholder organisation."
- **Accelerator £25/month**: "Accelerate CSL's work. Your support helps fund share purchases,
  professional advice and the infrastructure needed to build real voting strength."
- **Custom Monthly / Annual**: "For supporters who want to contribute more, in a way that
  reflects their means and commitment."
- **Lifetime £5,000**: "For supporters who want to contribute a one-time fee, reflecting their
  means and commitment for life."

**Custom plan validation rules (enforce client-side AND server-side):**
- Custom Monthly: minimum £30, must be divisible by £5
- Custom Annual: minimum £300, must be divisible by £10
- Reject any amount below the minimum; reject any amount not on the correct increment

All Phase 3 work uses Stripe test keys only.
Test card: `4242 4242 4242 4242`, any future expiry, any CVC.
Do not switch to live keys until Phase 7 (go-live).

## Supabase Schema

```sql
-- Members enrolled after successful Stripe payment
members (
  id               uuid primary key,
  email            text unique not null,
  name             text,
  stripe_customer_id text,
  membership_tier  text,           -- 'monthly' | 'annual' | 'lifetime'
  status           text,           -- 'active' | 'payment_failed' | 'cancelled'
  created_at       timestamptz default now()
)

-- Share tracing and proxy enquiries from public forms
shareholder_cases (
  id            uuid primary key,
  contact_name  text,
  email         text,
  phone         text,
  case_type     text,    -- 'Share Tracing' | 'Proxy Assignment'
  enquiry_source text,
  notes         text,
  status        text default 'New',  -- 'New' | 'In Progress' | 'Resolved'
  assigned_to   text,
  created_at    timestamptz default now()
)

-- Meeting recordings and events shown in member portal
events (
  id            uuid primary key,
  title         text,
  event_date    date,
  recording_url text,
  slides_url    text,
  members_only  boolean default true
)
```

## Zoho CRM Integration

- API base: `https://www.zohoapis.eu/crm/v2` — **EU data centre only, never `.com`**
- On intake form submit: call `lib/zoho.ts` → `findOrCreateZohoContact()` then `createZohoCase()`
- Case types: `Share Tracing` | `Proxy Assignment`
- Zoho calls must be **non-blocking** (fire-and-forget, catch errors, never throw)
- Env vars: `ZOHO_ACCESS_TOKEN`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`
- Refresh token automatically if 401 returned

## Email (Resend)

- All outbound email sent via Resend from verified `.co.uk` or `.com` domain (not `.net`)
- Volunteer notification: new intake form → notify `shares@celticsupporterslimited.net` or `proxy@celticsupporterslimited.net`
- Member welcome email: sent from `membership@celticsupporterslimited.net` after Stripe success
- Env var: `RESEND_API_KEY`
- All Resend calls wrapped in try/catch — email failure must never block a form submission

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
- Lib files: `lib/stripe.ts`, `lib/supabase.ts`, `lib/zoho.ts`, `lib/resend.ts`
- File naming: lowercase, hyphenated
- Commit messages: imperative present tense ("Add hero section to home page")
- Run `npm run dev` to confirm render at `localhost:3000` after each session
- Git: `git add . && git commit -m 'Session summary: <what was built>'` at end of every session

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
`POST /api/checkout` creates Stripe Checkout session; subscription plans use
`subscription_data.description`, lifetime uses `payment_intent_data.description`.
`product_data.name` values: "Monthly 10", "Monthly 25", "Custom Monthly",
"£{amount} Annually", "Lifetime £5000". `/membership/success` confirmation page.
`lib/stripe.ts` lazy-initialised with shared `validatePlan()`.
Required env var: `STRIPE_SECRET_KEY` (test key only until Phase 7).

**Phase 4 — Proxy Assignment** (`app/proxy/`)
Full page matching demo: Hero, proxy explainer (2-col with stats panel), 4-step process,
registration form. Client form with GDPR consent. `POST /api/proxy` inserts to
`shareholder_cases` (`case_type: 'Proxy Assignment'`), fire-and-forget Zoho stub.

**Phase 5 — Member Portal**
Magic-link auth via Supabase Auth. `middleware.ts` protects `/member-portal` and refreshes
session tokens on every request. `/login` page with `LoginForm.tsx` client component calls
`signInWithOtp`. `/auth/callback` route exchanges the PKCE code for a session cookie.
`app/member-portal/page.tsx` is a server component: verifies auth, fetches member record,
events, and shareholder_cases via service-role client, then passes data to
`PortalClient.tsx` (client component). Portal has five tabs: Dashboard, Subscription,
Recordings Library, My Enquiries, Account Settings. `PATCH /api/member/settings` updates
member name (auth-verified server-side). `lib/supabase-browser.ts` exports
`createBrowserSupabase()` (anon key, for client components); `lib/supabase.ts` gains
`createServerSupabase()` (anon key + cookie adapter, for server components/route handlers).
`sql/phase-5-schema.sql` contains CREATE TABLE for `members` and `events`, RLS policies,
and indexes - run in Supabase Dashboard > SQL Editor before deploying.
Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`.

### Next — Phase 6: Stripe Webhook + Billing
Stripe webhook handler (`POST /api/webhooks/stripe`) to enrol members in Supabase on
`checkout.session.completed`, handle `invoice.payment_failed` and
`customer.subscription.deleted`. Stripe Customer Portal link in the Subscription tab.
Full payment history from Stripe Charges API.
