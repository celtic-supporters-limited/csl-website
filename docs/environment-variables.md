# Environment Variables Reference

All variables must be set in both `.env.local` (local development) and
Vercel > Project Settings > Environment Variables (production and preview).

Copy `.env.local.example` to `.env.local` to get started. Never commit `.env.local`.

---

## Supabase

CSL uses Supabase for both the PostgreSQL database and user authentication.
The project must use the EU West (Ireland) region — never the US region.

### `NEXT_PUBLIC_SUPABASE_URL`

| | |
|---|---|
| **What it does** | The base URL for all Supabase API calls — used to initialise both the browser client and the server client. |
| **Where to find it** | Supabase Dashboard > Project Settings > API > Project URL |
| **Format** | `https://<project-id>.supabase.co` |
| **Files that use it** | `lib/supabase.ts`, `lib/supabase-browser.ts`, `middleware.ts`, `app/auth/callback/route.ts`, `app/member-portal/page.tsx` |
| **Needed in Vercel** | Yes — required for all environments |
| **Notes** | Prefixed `NEXT_PUBLIC_` so it is available in client components. Not a secret but must be correct. |

---

### `NEXT_PUBLIC_SUPABASE_ANON_KEY`

| | |
|---|---|
| **What it does** | The public anon key used by the browser client and the server auth client. Respects Row Level Security (RLS) policies. |
| **Where to find it** | Supabase Dashboard > Project Settings > API > anon public |
| **Format** | Long JWT string starting with `eyJ...` |
| **Files that use it** | `lib/supabase.ts`, `lib/supabase-browser.ts`, `middleware.ts`, `app/auth/callback/route.ts`, `app/member-portal/page.tsx` |
| **Needed in Vercel** | Yes — required for all environments |
| **Notes** | Prefixed `NEXT_PUBLIC_` — safe to expose to the browser. RLS policies in Supabase protect data access. |

---

### `SUPABASE_SERVICE_ROLE_KEY`

| | |
|---|---|
| **What it does** | The service role key used by API routes to bypass RLS for trusted server-side writes (e.g. upserting a member after a Stripe webhook). |
| **Where to find it** | Supabase Dashboard > Project Settings > API > service_role |
| **Format** | Long JWT string starting with `eyJ...` |
| **Files that use it** | `lib/supabase.ts` (via `getSupabase()`) — called from `app/api/webhooks/stripe/route.ts`, `app/api/billing-portal/route.ts`, `app/api/profile/route.ts`, `app/api/share-tracing/route.ts`, `app/api/proxy/route.ts` |
| **Needed in Vercel** | Yes — required for all environments |
| **Notes** | **Never expose to the browser.** No `NEXT_PUBLIC_` prefix. If this key leaks, it bypasses all RLS and gives full database access. Rotate immediately if compromised. |

---

## Stripe

CSL uses Stripe for membership payments (Checkout), subscription management
(Billing Portal), and event-driven member status updates (Webhooks).

All development work uses test mode keys (`sk_test_` / `whsec_`).
Do not switch to live keys until the go-live checklist is complete and the
board has signed off.

### `STRIPE_SECRET_KEY`

| | |
|---|---|
| **What it does** | Authenticates all server-side Stripe API calls — creating checkout sessions, retrieving subscriptions, listing charges, and creating billing portal sessions. |
| **Where to find it** | Stripe Dashboard > Developers > API keys > Secret key |
| **Format** | `sk_test_...` (test) or `sk_live_...` (production) |
| **Files that use it** | `lib/stripe.ts` (via `getStripe()`) — called from all `/api/checkout`, `/api/billing-portal`, `/api/webhooks/stripe`, and `/member-portal` |
| **Needed in Vercel** | Yes — required for all environments |
| **Notes** | **Never expose to the browser.** Use `sk_test_` until go-live sign-off. The live Stripe account has "Build a platform or marketplace" enabled — requires director sign-off to disable before switching to live keys. |

---

### `STRIPE_WEBHOOK_SECRET`

| | |
|---|---|
| **What it does** | Used to verify the `stripe-signature` header on incoming webhook POSTs, ensuring they genuinely originate from Stripe and have not been tampered with. |
| **Where to find it** | Stripe Dashboard > Developers > Webhooks > select the endpoint > Signing secret |
| **Format** | `whsec_...` |
| **Files that use it** | `app/api/webhooks/stripe/route.ts` |
| **Needed in Vercel** | Yes — production only (the webhook endpoint is the production URL) |
| **Notes** | The registered webhook URL is `https://csl-website-ten.vercel.app/api/webhooks/stripe`. Listens for `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`. For local testing use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` — it prints a local `whsec_` secret to use in `.env.local`. |

---

## Site URL

### `NEXT_PUBLIC_SITE_URL`

| | |
|---|---|
| **What it does** | The full public URL of the deployment. Used as the base for Stripe Checkout success/cancel redirect URLs and for Supabase password-reset email links when the `origin` header is not available. |
| **Where to find it** | Set manually — production value is `https://csl-website-ten.vercel.app` |
| **Format** | `https://your-domain.com` — no trailing slash |
| **Files that use it** | `app/api/checkout/route.ts`, `app/api/billing-portal/route.ts`, `app/api/auth/reset-password/route.ts` |
| **Needed in Vercel** | Yes — set to `https://csl-website-ten.vercel.app` for production; optionally set per preview deployment |
| **Notes** | Falls back to `http://localhost:3000` if unset, so local development works without it. Must be updated if the domain changes. |

---

## Resend (email — not yet implemented)

Resend will be used to send the member welcome email after a successful Stripe
payment and to notify volunteers when a share tracing or proxy enquiry is submitted.
The integration is currently a stub in `lib/resend.ts` (file not yet created).

### `RESEND_API_KEY`

| | |
|---|---|
| **What it does** | Authenticates outbound email sends via the Resend API. |
| **Where to find it** | Resend Dashboard > API Keys > Create API key |
| **Format** | `re_...` |
| **Files that use it** | `lib/resend.ts` (to be created) — called from `app/api/webhooks/stripe/route.ts` (welcome email on `checkout.session.completed`) and intake form API routes |
| **Needed in Vercel** | Yes — add when implementing the email integration |
| **Notes** | All outbound email must send from a verified `.co.uk` or `.com` domain, not `.net`. Sending addresses: `membership@celticsupporters.net` (welcome), `shares@celticsupporters.net` (share tracing), `proxy@celticsupporters.net` (proxy). Free tier covers 3,000 emails/month. |

---

## Zoho CRM (not yet implemented)

Zoho CRM (EU data centre) will be used to log share tracing and proxy assignment
enquiries as contacts and cases. The integration is currently a stub in `lib/zoho.ts`
that logs to console only. All Zoho API calls must use `zohoapis.eu` — never `zohoapis.com`.

### `ZOHO_CLIENT_ID`

| | |
|---|---|
| **What it does** | OAuth 2.0 client ID for authenticating with the Zoho CRM API. |
| **Where to find it** | Zoho API Console (EU) > your registered app > Client ID |
| **Files that use it** | `lib/zoho.ts` (to be wired up) |
| **Needed in Vercel** | Yes — add when implementing the CRM integration |

---

### `ZOHO_CLIENT_SECRET`

| | |
|---|---|
| **What it does** | OAuth 2.0 client secret for authenticating with the Zoho CRM API. |
| **Where to find it** | Zoho API Console (EU) > your registered app > Client Secret |
| **Files that use it** | `lib/zoho.ts` (to be wired up) |
| **Needed in Vercel** | Yes — add when implementing the CRM integration |
| **Notes** | **Keep secret.** Do not expose to the browser. |

---

### `ZOHO_ACCESS_TOKEN`

| | |
|---|---|
| **What it does** | Short-lived OAuth access token used in the `Authorization` header for Zoho API calls. |
| **Where to find it** | Generated via the Zoho OAuth 2.0 flow using `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET` |
| **Files that use it** | `lib/zoho.ts` (to be wired up) |
| **Needed in Vercel** | Yes — add when implementing the CRM integration |
| **Notes** | Access tokens expire (typically 1 hour). The implementation will need a refresh token mechanism or a server-side token refresh cron. Consider storing the refresh token as a separate env var `ZOHO_REFRESH_TOKEN`. |

---

## Cloudflare Turnstile (bot protection)

Turnstile protects the membership checkout form against automated bot submissions.
The widget appears client-side; the server verifies the token before creating a Stripe session.

For local development use Cloudflare's dummy test keys — they always pass without a real Cloudflare account:
- Site key: `1x00000000000000000000AA`
- Secret key: `1x0000000000000000000000000000000AA`

### `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

| | |
|---|---|
| **What it does** | Identifies the Turnstile widget to Cloudflare's challenge endpoint. Rendered client-side in the membership checkout panel. |
| **Where to find it** | Cloudflare Dashboard > Turnstile > your site > Site Key |
| **Format** | Alphanumeric string |
| **Files that use it** | `app/membership/MembershipPlans.tsx` |
| **Needed in Vercel** | Yes — set to your production Turnstile site key |
| **Notes** | Prefixed `NEXT_PUBLIC_` — it is deliberately public. Use `1x00000000000000000000AA` locally (Cloudflare dummy key, always passes). |

---

### `TURNSTILE_SECRET_KEY`

| | |
|---|---|
| **What it does** | Used server-side to verify the Turnstile token submitted with each checkout request against Cloudflare's siteverify API. |
| **Where to find it** | Cloudflare Dashboard > Turnstile > your site > Secret Key |
| **Format** | Alphanumeric string |
| **Files that use it** | `app/api/checkout/route.ts` |
| **Needed in Vercel** | Yes — set to your production Turnstile secret key |
| **Notes** | **Keep secret.** No `NEXT_PUBLIC_` prefix. If unset in development the verification step is skipped (token presence is still checked). Use `1x0000000000000000000000000000000AA` locally. |

---

## .gitignore coverage

`.env.local` is excluded from version control by the `.gitignore` pattern `.env*.local`.
`.env.local.example` is committed — it contains only placeholder values and serves as the
setup template for new developers and deployment environments.

---

## Adding a new variable

1. Add it to `.env.local.example` with a placeholder value and a comment.
2. Add it to this file under the appropriate service section.
3. Set the real value in Vercel > Project Settings > Environment Variables.
4. Set the real value in your local `.env.local`.
5. If it is `NEXT_PUBLIC_` prefixed, it will be inlined into the client bundle — confirm that is intentional before adding the prefix.
