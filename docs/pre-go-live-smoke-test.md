# CSL Website — Pre-Go-Live Smoke Test Checklist

**Run against:** https://csl-website-ten.vercel.app  
**Who runs it:** Gary Phinn (Volunteer IT Lead)  
**When:** After all go-live env vars are set, before DNS cutover from celticsupporters.net  
**Stripe mode:** Test keys only — do not run with live keys until this checklist is fully signed off

Mark each item ✅ pass / ❌ fail. Do not go live with any ❌.

---

## 1. Public Pages — Render and Navigation

| # | Test | Expected | Result |
|---|------|----------|--------|
| 1.1 | Load `/` | Hero renders, no console errors, no broken images | |
| 1.2 | Load `/membership` | All 5 plan cards visible | |
| 1.3 | Load `/share-tracing` | Form visible, GDPR consent checkbox present | |
| 1.4 | Load `/proxy` | Form visible, GDPR consent checkbox present | |
| 1.5 | Load `/governance` | Criteria cards render, score bar visible | |
| 1.6 | Load `/our-team` | 4 director cards visible, no personal names | |
| 1.7 | Load `/celtic-paradox` | Download links present | |
| 1.8 | Load `/privacy` | 11 sections render | |
| 1.9 | Load `/faq` | Accordion opens and closes | |
| 1.10 | Nav mobile menu | Hamburger opens/closes on viewport < 768px | |

---

## 2. Share Tracing Form

| # | Test | Expected | Result |
|---|------|----------|--------|
| 2.1 | Submit form with all fields blank | Inline validation errors shown, no API call | |
| 2.2 | Submit form without ticking GDPR consent | Blocked — consent is required | |
| 2.3 | Submit valid form | Success message shown; row appears in Supabase `shareholder_cases` with `case_type = 'Share Tracing'` | |
| 2.4 | Check Supabase after 2.3 | Row present with correct name, email, notes | |
| 2.5 | Check `info@celticsupporters.net` inbox after 2.3 | Notification email received (only if `RESEND_API_KEY` is set) | |

---

## 3. Proxy Assignment Form

| # | Test | Expected | Result |
|---|------|----------|--------|
| 3.1 | Submit form with all fields blank | Inline validation errors, no API call | |
| 3.2 | Submit valid form | Success message shown; row in Supabase `shareholder_cases` with `case_type = 'Proxy Assignment'` | |
| 3.3 | Check Supabase after 3.2 | Row present with correct data | |

---

## 4. Membership Checkout — Bot and Spam Protection

| # | Test | Expected | Result |
|---|------|----------|--------|
| 4.1 | Choose Standard plan, enter `test@mailinator.com`, click Proceed | Error: "Please use a permanent email address" — no Stripe redirect | |
| 4.2 | Choose Standard plan, enter invalid email `notanemail`, click Proceed | Client-side validation error — no API call | |
| 4.3 | POST directly to `/api/checkout` with `{"plan":"standard","email":"test@example.com"}` (no turnstileToken) via browser DevTools or curl | 400 response: "Bot detection token missing" | |
| 4.4 | Turnstile widget visible on checkout panel | Widget renders (green checkbox or challenge) — not blank | |

---

## 5. Membership Checkout — Full Stripe Flow

Use Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.

| # | Test | Expected | Result |
|---|------|----------|--------|
| 5.1 | Choose Standard (£10/mo), enter a fresh test email, click Proceed to Stripe | Redirects to `checkout.stripe.com` | |
| 5.2 | Complete payment on Stripe Checkout page | Redirects to `/membership/success` | |
| 5.3 | Check Supabase `members` table within 60s | Row present with correct email, `membership_tier = 'monthly'`, `plan_name = 'Monthly 10'`, `status = 'active'` | |
| 5.4 | Check Supabase `member_events` table | `checkout.completed` event logged with `is_test = true` | |
| 5.5 | Check Stripe Dashboard > Webhooks > recent deliveries | `checkout.session.completed` event shows 200 response from Vercel | |
| 5.6 | Check test email inbox | Welcome email received from `membership@celticsupporters.net` (only if `RESEND_API_KEY` is set) | |
| 5.7 | Repeat 5.1–5.3 for Lifetime plan (£5,000) | `membership_tier = 'lifetime'`, `plan_name = 'Lifetime Member'`, `is_lifetime = true` | |

---

## 6. Authentication — Sign Up and Login

| # | Test | Expected | Result |
|---|------|----------|--------|
| 6.1 | Navigate to `/signup?email=<email used in 5.2>` | Form pre-filled with that email | |
| 6.2 | Complete signup (set password) | Redirected to `/member-portal` | |
| 6.3 | Portal Dashboard tab | Member name, plan name, and status visible | |
| 6.4 | Portal Subscription tab | Next payment date and card last 4 visible | |
| 6.5 | Portal Payments tab | At least one payment row from test in section 5 | |
| 6.6 | Log out and log back in with email + password | Successful login, redirected to portal | |
| 6.7 | Log out. Click "Send me a login link instead" on `/login` | Magic link email received; clicking it logs in | |

---

## 7. Password Reset Flow

| # | Test | Expected | Result |
|---|------|----------|--------|
| 7.1 | On `/login`, click "Forgot your password?", enter test email | "If that email is registered..." message shown (no error) | |
| 7.2 | Check inbox | Reset email received with link pointing to `https://csl-website-ten.vercel.app/auth/callback` (not localhost) | |
| 7.3 | Click reset link | Redirected to `/auth/update-password` | |
| 7.4 | Set new password | Redirected to `/member-portal` | |
| 7.5 | Log out and log in with new password | Successful | |

---

## 8. Member Portal — Edit Profile and Email Change

| # | Test | Expected | Result |
|---|------|----------|--------|
| 8.1 | Edit Profile tab — update first name and save | Success toast; name updated in Supabase | |
| 8.2 | Initiate email change to a second test address | Amber "Email change pending" banner appears | |
| 8.3 | Check new address inbox | Confirmation email received | |
| 8.4 | Click confirmation link | Portal email updated; banner cleared | |
| 8.5 | Cancel pending change (before confirming) | Banner disappears; `pending_email` cleared in Supabase | |

---

## 9. Admin — Member Timeline

| # | Test | Expected | Result |
|---|------|----------|--------|
| 9.1 | Log in as admin (`is_admin = true`) and navigate to `/member-portal/admin/members` | Admin search page visible | |
| 9.2 | Search for the test email used in section 5 | Member record found | |
| 9.3 | Click member | Timeline shows `checkout.completed` and any subsequent events | |
| 9.4 | Log in as a non-admin member and navigate to `/member-portal/admin/members` | 403 or redirect — page not accessible | |

---

## 10. Security Spot-Checks

| # | Test | Expected | Result |
|---|------|----------|--------|
| 10.1 | Navigate to `/member-portal` while logged out | Redirected to `/login` | |
| 10.2 | Navigate to `/member-portal/documents` while logged out | Redirected to `/login` | |
| 10.3 | POST to `/api/checkout` with `Content-Type: application/json` and body `not json {{{` | 400 response | |
| 10.4 | POST to `/api/auth/reset-password` 4+ times rapidly with the same IP | 4th and subsequent requests return 200 (indistinguishable from success — rate limit is silent) | |
| 10.5 | Check Stripe Dashboard > Webhooks | Webhook endpoint is `https://csl-website-ten.vercel.app/api/webhooks/stripe` — no Pure Baltic endpoints receiving live events | |

---

## 11. Pre-Go-Live Environment Checklist

Confirm each before DNS cutover — these are not functional tests but are go-live blockers.

| # | Item | Confirmed |
|---|------|-----------|
| 11.1 | `STRIPE_SECRET_KEY` switched to live key in Vercel Production | |
| 11.2 | `STRIPE_WEBHOOK_SECRET` updated to match live webhook endpoint secret | |
| 11.3 | `RESEND_API_KEY` set in Vercel Production | |
| 11.4 | Stripe Billing Portal configured (Dashboard > Billing > Customer portal settings) | |
| 11.5 | "Build a platform or marketplace" disabled in live Stripe account (director sign-off) | |
| 11.6 | Pure Baltic webhook endpoints removed or disabled in live Stripe account | |
| 11.7 | Supabase Auth > URL Configuration > Redirect URLs includes production domain | |
| 11.8 | `localhost:3000` removed from Supabase Auth > Redirect URLs | |
| 11.9 | `NEXT_PUBLIC_SITE_URL` Preview value removed from Vercel (Production only) | |
| 11.10 | Production cleardown SQL (`sql/production-cleardown.sql`) run and verified | |
| 11.11 | DNS cutover planned with Pure Baltic — rollback window agreed | |

---

**Sign-off**

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Volunteer IT Lead | | | |
| Director | | | |
