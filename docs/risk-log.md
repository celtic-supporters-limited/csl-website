# CSL Website — Risk Log

Operational risks and go-live blockers for the CSL website. Updated as risks are identified, mitigated, or resolved.

## Operational Risks

| # | Risk | Likelihood | Impact | Status |
|---|------|-----------|--------|--------|
| R01 | Supabase free-tier auto-pause | Medium | High | Partially mitigated |
| R02 | Auth emails sent from Supabase default address | Low | Medium | Open — blocked on DNS |
| R03 | card.expiring Stripe event not registered | Low | Medium | Open — pending board sign-off |
| R04 | No cancellation notification emails | Low | Low | Open — not yet built |

---

## R01 — Supabase free-tier auto-pause

**Description:** Supabase automatically pauses free-tier projects after 7 days of inactivity. The production database going down takes the entire site offline — auth, member portal, and all data access fail immediately.

**Status:** Partially mitigated. Cron frequency increased from weekly to every 3 days (PR #55, pending merge to main). Staging project was paused on 29 June 2026 and has been manually restored.

**Likelihood:** Medium. The every-3-days cron provides a safety margin, but a single failed run still leaves a gap. Cron execution cannot be confirmed from Vercel logs beyond the current session window.

**Impact:** High. Production outage for all members and volunteers until manually restored. Up to 90 days to restore before data is permanently inaccessible.

**Owner:** Gary Phinn (Volunteer IT Lead).

**Recommended resolution:** Upgrade production Supabase to Pro (~£20/month). Requires board approval. Eliminates auto-pause entirely and removes dependency on cron as a keep-alive mechanism.

**Interim controls:** Every-3-days snapshot cron (once PR #55 is merged to main); Supabase sends an email warning before pausing, giving time to manually restore.

---

## R02 — Auth emails sent from Supabase default address

**Description:** All Supabase-generated auth emails (magic link, password reset, email change confirmation) send from `noreply@mail.app.supabase.io` rather than `membership@celticsupporters.net`. This undermines trust and increases spam-folder risk.

**Status:** Open. Custom SMTP configuration in Supabase Dashboard > Authentication > SMTP Settings requires DNS records (SPF, DKIM) for `celticsupporters.net`. Currently blocked on access to the domain's DNS settings, which are managed by Pure Baltic.

**Likelihood:** Low. Emails are functional; the risk is member trust and deliverability, not a hard failure.

**Impact:** Medium. Members may not recognise the sender and miss critical emails (password reset, email change confirmation).

**Owner:** Gary Phinn (Volunteer IT Lead) — requires DNS access from Pure Baltic.

**Recommended resolution:** Obtain DNS access for `celticsupporters.net` as part of the Pure Baltic cutover. Add SPF/DKIM records and configure Supabase custom SMTP with credentials from the email provider.

---

## R03 — `customer.source.expiring` Stripe event not registered

**Description:** The Stripe webhook endpoint is not subscribed to `customer.source.expiring`, so the site cannot proactively notify members when their payment card is about to expire. Members may miss renewals without warning.

**Status:** Open. Registration is pending board confirmation that enabling Stripe Smart Retries will not affect Pure Baltic's existing live subscriptions.

**Likelihood:** Low. Members receive Stripe's default expiry communications directly; the risk is a gap in CSL-branded notifications, not a complete failure.

**Impact:** Medium. Failed renewals due to expired cards without proactive warning leads to involuntary churn and manual volunteer intervention.

**Owner:** Board sign-off required; Gary Phinn to register the event once approved.

**Recommended resolution:** Board to confirm Smart Retries decision, then register `customer.source.expiring` on the Stripe webhook endpoint (Stripe Dashboard > Developers > Webhooks > csl-website endpoint > add event).

---

## R04 — No cancellation notification emails

**Description:** When a member cancels (or a subscription is deleted via `customer.subscription.deleted`), neither the member nor the volunteers receive an automated notification. Volunteers have no visibility of churn without checking the admin panel.

**Status:** Open. The webhook handler updates member status to `cancelled` in Supabase but sends no emails.

**Likelihood:** Low. Cancellations happen but are low-volume at current membership size.

**Impact:** Low. Volunteers can identify cancelled members via the admin event log; the gap is proactive awareness, not data loss.

**Owner:** Gary Phinn (Volunteer IT Lead).

**Recommended resolution:** Add `sendMembershipCancelledEmail()` (to member) and `sendCancellationVolunteerAlert()` (to `membership@celticsupporters.net`) in `lib/resend.ts`. Call fire-and-forget in the `customer.subscription.deleted` webhook handler. Blocked on `RESEND_API_KEY` being set in Vercel Production.

---

## Go-live Blockers

Required actions before switching to live Stripe keys and opening the site to the public. None of these are risks in the traditional sense — they are known outstanding tasks.

| # | Blocker | Owner | Notes |
|---|---------|-------|-------|
| G01 | Remove `localhost:3000` from Supabase Auth redirect URLs | Gary Phinn | Supabase Dashboard > Authentication > URL Configuration |
| G02 | Configure Stripe Customer Portal in live Stripe account | Gary Phinn | Done in sandbox; live account still needs it — Dashboard > Billing > Customer portal settings |
| G03 | Board sign-off on Pure Baltic webhook cutover | Board / Gary Phinn | Pure Baltic webhooks still point to `dev.purebaltic.co.uk`; must be redirected before go-live |
| G04 | Switch to live Stripe keys | Gary Phinn | Replace `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Vercel with live values; requires G03 first |
| G05 | Set `RESEND_API_KEY` in Vercel Production | Gary Phinn | Leave Preview environment unset — `getResend()` returns null gracefully on staging |
