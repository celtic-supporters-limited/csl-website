import { Resend } from "resend";
import { getSupabase } from "@/lib/supabase";
import { P6_COPY } from "@/lib/agm-p6-copy";

let _client: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.startsWith("re_your-")) {
    console.log("[resend] RESEND_API_KEY not configured — email skipped");
    return null;
  }
  if (!_client) _client = new Resend(key);
  return _client;
}

export function logEmailSend(emailType: string, stripeEventId?: string | null): void {
  // fire-and-forget — never blocks the send, never throws
  ;(async () => {
    try {
      await getSupabase().from("email_log").insert({ email_type: emailType, stripe_event_id: stripeEventId ?? null });
    } catch (e) {
      console.error("[resend] email_log insert failed:", e);
    }
  })();
}

// Read-before-send idempotency guard. Only meaningful for callers that pass
// a stripe_event_id — Stripe retries on any non-200 webhook response, and
// without this a retried event would send the same email twice.
// Fails open (returns false, i.e. "not sent yet") on any DB error — a
// missing idempotency check risks a duplicate email; blocking a genuine
// cancellation email over a DB hiccup is the worse failure mode.
async function hasEmailBeenSent(emailType: string, stripeEventId: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabase()
      .from("email_log")
      .select("id")
      .eq("email_type", emailType)
      .eq("stripe_event_id", stripeEventId)
      .maybeSingle();
    if (error) {
      console.error("[resend] idempotency check failed, proceeding with send:", error.message);
      return false;
    }
    return !!data;
  } catch (e) {
    console.error("[resend] idempotency check failed, proceeding with send:", e);
    return false;
  }
}

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://csl-website-ten.vercel.app";

type IntakeNotificationParams = {
  name: string;
  email: string;
  message: string;
  submittedAt: string;
};

function intakeHtml({
  name,
  email,
  message,
  submittedAt,
}: IntakeNotificationParams): string {
  return `
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
    ${message ? `<p><strong>Details:</strong><br>${message.replace(/\n/g, "<br>")}</p>` : ""}
    <p><strong>Submitted:</strong> ${submittedAt}</p>
    <hr>
    <p style="color:#666;font-size:0.9em">Log in to Supabase to view the full submission.</p>
  `;
}

export async function sendShareTracingNotification(
  params: IntakeNotificationParams
): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: "CSL Website <info@celticsupporters.net>",
      to: "info@celticsupporters.net",
      subject: `New Share Tracing Enquiry - ${params.name}`,
      html: intakeHtml(params),
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "share_tracing", to: "info@celticsupporters.net", err });
    throw err;
  }
  logEmailSend("share_tracing");
}

export async function sendProxyNotification(
  params: IntakeNotificationParams
): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: "CSL Website <info@celticsupporters.net>",
      to: "info@celticsupporters.net",
      subject: `New Proxy Assignment Request - ${params.name}`,
      html: intakeHtml(params),
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "proxy", to: "info@celticsupporters.net", err });
    throw err;
  }
  logEmailSend("proxy");
}

export async function sendWelcomeEmail({
  name,
  email,
  planName,
}: {
  name: string | null;
  email: string;
  planName: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const displayName = name
    ? name.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
    : "Member";

  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to: email,
      subject: "Welcome to Celtic Supporters Limited",
      html: `
        <p>Hello ${displayName},</p>
        <p>Thank you for joining Celtic Supporters Limited. Your membership is now active.</p>
        <p><strong>Your plan:</strong> ${planName}</p>
        <p>Access your member portal:</p>
        <p><a href="${SITE_URL}/member-portal" style="display:inline-block;background:#1B4D2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Go to your member portal</a></p>
        <p>From your member portal you can manage your membership, view documents, and track your enquiries.</p>
        <p>Together we are building the shareholder voice Celtic FC needs.</p>
        <p>Celtic Supporters Limited</p>
      `,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "welcome", to: email, err });
    throw err;
  }
  logEmailSend("welcome");
}

export async function sendPasswordResetEmail({
  to,
  resetLink,
}: {
  to: string;
  resetLink: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: "Reset your CSL password",
      html: `
        <p>Hello,</p>
        <p>We received a request to reset the password for your Celtic Supporters Limited account.</p>
        <p><a href="${resetLink}" style="display:inline-block;background:#1B4D2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Reset my password</a></p>
        <p style="color:#666;font-size:0.9em">This link expires in 24 hours. If you did not request a password reset, you can ignore this email - your account is safe.</p>
        <p>Celtic Supporters Limited</p>
      `,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "password_reset", to, err });
    throw err;
  }
  logEmailSend("password_reset");
}

export async function sendMagicLinkEmail({
  to,
  magicLink,
}: {
  to: string;
  magicLink: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: "Your CSL sign-in link",
      html: `
        <p>Hello,</p>
        <p>Here is your one-click sign-in link for Celtic Supporters Limited. This link is valid for 24 hours.</p>
        <p><a href="${magicLink}" style="display:inline-block;background:#1B4D2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Sign in to CSL</a></p>
        <p style="color:#666;font-size:0.9em">If you did not request this link, you can ignore this email - your account is safe.</p>
        <p>Celtic Supporters Limited</p>
      `,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "magic_link", to, err });
    throw err;
  }
  logEmailSend("magic_link");
}

export async function sendPaymentFailedEmail({
  to,
  firstName,
  attemptCount,
}: {
  to: string;
  firstName: string | null;
  attemptCount: number;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const greeting = firstName ? `Hello ${firstName},` : "Hello,";
  const attemptNote =
    attemptCount > 1 ? ` (attempt ${attemptCount})` : "";

  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: "Action required: your CSL membership payment failed",
      html: `
        <p>${greeting}</p>
        <p>We were unable to collect your Celtic Supporters Limited membership payment${attemptNote}. This may be because your card has expired or your bank declined the charge.</p>
        <p>To keep your membership active, please update your payment details as soon as possible:</p>
        <p><a href="${SITE_URL}/member-portal?tab=subscription">Update your payment details</a></p>
        <p>If you have any questions, contact us at <a href="mailto:info@celticsupporters.net">info@celticsupporters.net</a>.</p>
        <p>Celtic Supporters Limited</p>
      `,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "payment_failed", to, err });
    throw err;
  }
  logEmailSend("payment_failed");
}

export async function sendPaymentFailedVolunteerAlert({
  memberEmail,
  planName,
  attemptCount,
}: {
  memberEmail: string;
  planName: string | null;
  attemptCount: number;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: "CSL Website <info@celticsupporters.net>",
      to: "info@celticsupporters.net",
      subject: `Payment failure: ${memberEmail} (attempt ${attemptCount})`,
      html: `
        <p>A membership payment has failed.</p>
        <p><strong>Member:</strong> ${memberEmail}</p>
        <p><strong>Plan:</strong> ${planName ?? "Unknown"}</p>
        <p><strong>Attempt:</strong> ${attemptCount}</p>
        <p>Stripe will retry automatically. The member has been notified by email and directed to update their card.</p>
        <p><a href="${SITE_URL}/member-portal/admin/members?q=${encodeURIComponent(memberEmail)}">View member timeline</a></p>
      `,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "payment_failed_alert", to: "info@celticsupporters.net", err });
    throw err;
  }
  logEmailSend("payment_failed_alert");
}

export async function sendCardExpiryWarningEmail({
  to,
  firstName,
  cardBrand,
  expMonth,
  expYear,
}: {
  to: string;
  firstName: string | null;
  cardBrand: string | null;
  expMonth: number;
  expYear: number;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const greeting = firstName ? `Hello ${firstName},` : "Hello,";
  const cardDesc = cardBrand
    ? `Your ${cardBrand.charAt(0).toUpperCase() + cardBrand.slice(1)} card ending in the details we hold`
    : "Your card on file";
  const expiry = `${String(expMonth).padStart(2, "0")}/${expYear}`;

  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: "Your CSL membership card expires soon",
      html: `
        <p>${greeting}</p>
        <p>${cardDesc} expires ${expiry}. To avoid any interruption to your Celtic Supporters Limited membership, please update your payment details before then.</p>
        <p><a href="${SITE_URL}/member-portal?tab=subscription">Update your payment details</a></p>
        <p>If you have any questions, contact us at <a href="mailto:info@celticsupporters.net">info@celticsupporters.net</a>.</p>
        <p>Celtic Supporters Limited</p>
      `,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "card_expiry", to, err });
    throw err;
  }
  logEmailSend("card_expiry");
}

// ── Monitoring digest ─────────────────────────────────────────────────────────

export type DigestTrafficLight = "green" | "amber" | "red";

export type DigestData = {
  dateRange: string;
  overall: DigestTrafficLight;
  email: {
    sent24h: number;
    sentMonth: number;
    bounces24h: number;
    bounceRate: number;
    todayStatus: DigestTrafficLight;
    monthStatus: DigestTrafficLight;
    bounceStatus: DigestTrafficLight;
  };
  members: {
    newJoins24h: number;
    paymentFailures24h: number;
    cancellations24h: number;
  };
  backup: {
    lastStatus: string;
    lastRanAt: string | null;
    ageHours: number | null;
    backupStatus: DigestTrafficLight;
  };
  stripe: {
    ok: boolean;
    latencyMs: number;
    mode: "test" | "live" | "unknown";
    stripeStatus: DigestTrafficLight;
  };
  supabase: {
    dbSizeMb: number;
    dbStatus: DigestTrafficLight;
  };
  attentionItems: string[];
};

export async function sendMonitoringDigest(data: DigestData): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const statusLabel =
    data.overall === "red"   ? "ACTION REQUIRED" :
    data.overall === "amber" ? "AMBER"           : "ALL CLEAR";

  const statusColour =
    data.overall === "red"   ? "#B91C1C" :
    data.overall === "amber" ? "#B45309" : "#166534";

  const attentionHtml = data.attentionItems.length > 0
    ? `<p style="color:${statusColour};font-weight:600;margin-top:16px">Attention required:</p>
       <ul style="margin:4px 0 16px;padding-left:20px;color:#374151">
         ${data.attentionItems.map((i) => `<li style="margin-bottom:4px">${i}</li>`).join("")}
       </ul>`
    : `<p style="color:#166534;margin-top:16px">No action required.</p>`;

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 8px 4px 0;color:#6B7280;font-size:13px">${label}</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#111827">${value}</td></tr>`;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <div style="background:#1B4D2E;padding:20px 24px;border-radius:8px 8px 0 0">
        <p style="color:#C8A951;font-weight:700;font-size:16px;margin:0">Celtic Supporters Limited</p>
        <p style="color:#fff;font-size:22px;font-weight:700;margin:4px 0 0">Daily Operations Digest</p>
      </div>
      <div style="background:#F9FAFB;padding:16px 24px;border:1px solid #E5E7EB;border-top:none">
        <p style="color:#6B7280;font-size:12px;margin:0">${data.dateRange}</p>
        <p style="font-size:18px;font-weight:700;color:${statusColour};margin:8px 0 0">Overall: ${statusLabel}</p>
      </div>
      <div style="background:#fff;padding:20px 24px;border:1px solid #E5E7EB;border-top:none">

        <p style="font-weight:700;color:#111827;margin:0 0 8px;border-bottom:1px solid #F3F4F6;padding-bottom:6px">Email</p>
        <table style="width:100%;border-collapse:collapse">
          ${row("Sent (24h)", `${data.email.sent24h} / 100 per day`)}
          ${row("Sent (this month)", `${data.email.sentMonth} / 3,000 per month`)}
          ${row("Bounces (24h)", String(data.email.bounces24h))}
          ${row("Bounce rate", `${data.email.bounceRate.toFixed(1)}%`)}
        </table>

        <p style="font-weight:700;color:#111827;margin:16px 0 8px;border-bottom:1px solid #F3F4F6;padding-bottom:6px">Members</p>
        <table style="width:100%;border-collapse:collapse">
          ${row("New joins (24h)", String(data.members.newJoins24h))}
          ${row("Payment failures (24h)", String(data.members.paymentFailures24h))}
          ${row("Cancellations (24h)", String(data.members.cancellations24h))}
        </table>

        <p style="font-weight:700;color:#111827;margin:16px 0 8px;border-bottom:1px solid #F3F4F6;padding-bottom:6px">Backup</p>
        <table style="width:100%;border-collapse:collapse">
          ${row("Last success", data.backup.lastRanAt
            ? `${new Date(data.backup.lastRanAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC (${data.backup.ageHours != null ? Math.round(data.backup.ageHours) + "h ago" : "unknown"})`
            : "None recorded")}
          ${row("Status", data.backup.lastStatus)}
        </table>

        <p style="font-weight:700;color:#111827;margin:16px 0 8px;border-bottom:1px solid #F3F4F6;padding-bottom:6px">Stripe</p>
        <table style="width:100%;border-collapse:collapse">
          ${row("Connectivity", data.stripe.ok ? `Connected (${data.stripe.latencyMs} ms)` : "Unreachable")}
          ${row("Key mode", data.stripe.mode)}
        </table>

        <p style="font-weight:700;color:#111827;margin:16px 0 8px;border-bottom:1px solid #F3F4F6;padding-bottom:6px">Supabase</p>
        <table style="width:100%;border-collapse:collapse">
          ${row("Database size", `${data.supabase.dbSizeMb} MB / 500 MB`)}
        </table>

        ${attentionHtml}

        <p style="margin-top:20px;border-top:1px solid #F3F4F6;padding-top:16px">
          <a href="${SITE_URL}/member-portal/admin/operations"
             style="display:inline-block;background:#1B4D2E;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px">
            View Operations Dashboard
          </a>
        </p>
      </div>
    </div>
  `;

  const subject = `CSL Operations Digest - ${data.dateRange.split(" - ")[0]} - ${statusLabel}`;

  try {
    await resend.emails.send({
      from: "CSL Website <info@celticsupporters.net>",
      to: "info@celticsupporters.net",
      subject,
      html,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "monitoring_digest", to: "info@celticsupporters.net", err });
    throw err;
  }
  logEmailSend("monitoring_digest");
}

// ── Cancellation emails ──────────────────────────────────────────────────────
// Branched on Stripe's cancellation_details.reason: "cancellation_requested"
// is voluntary (member chose to leave); anything else is treated as
// involuntary — dunning exhaustion after repeated card declines, the only
// other realistic cause of customer.subscription.deleted. Both branches are
// idempotency-guarded on stripeEventId — Stripe retries on any non-200
// response, and without this guard a retry would send the email twice.

export async function sendCancellationEmail({
  to,
  firstName,
  voluntary,
  periodEndDate,
  stripeEventId,
}: {
  to: string;
  firstName: string | null;
  voluntary: boolean;
  periodEndDate: string | null;
  stripeEventId: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const emailType = "cancellation_confirmed";
  if (await hasEmailBeenSent(emailType, stripeEventId)) {
    console.log(`[resend] ${emailType} already sent for event ${stripeEventId} — skipping`);
    return;
  }

  const greeting = firstName ? `Hello ${firstName},` : "Hello,";
  const endedPhrase = periodEndDate
    ? `Your membership access ended on ${periodEndDate}.`
    : "Your membership access has now ended.";

  const html = voluntary
    ? `
        <p>${greeting}</p>
        <p>We're confirming that your Celtic Supporters Limited membership has been cancelled, as requested.</p>
        <p>${endedPhrase}</p>
        <p>We'd welcome you back at any time — you can rejoin from the membership page below, and your membership will restart immediately.</p>
        <p><a href="${SITE_URL}/membership" style="display:inline-block;background:#1B4D2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Rejoin CSL</a></p>
        <p>If you have any feedback on why you're leaving, or any questions, contact us at <a href="mailto:info@celticsupporters.net">info@celticsupporters.net</a>.</p>
        <p>Celtic Supporters Limited</p>
      `
    : `
        <p>${greeting}</p>
        <p>We were unable to collect your Celtic Supporters Limited membership payment after several attempts, and your membership has now ended.</p>
        <p>${endedPhrase}</p>
        <p>Stripe automatically retries a failed payment up to 8 times over 15 days before a membership is cancelled — this usually happens when a card has expired or been replaced, not because of anything you did.</p>
        <p>If you'd like to continue your membership, you're welcome to rejoin with an up-to-date card at any time:</p>
        <p><a href="${SITE_URL}/membership" style="display:inline-block;background:#1B4D2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Rejoin CSL</a></p>
        <p>If you'd rather speak to us first, contact us at <a href="mailto:info@celticsupporters.net">info@celticsupporters.net</a>.</p>
        <p>Celtic Supporters Limited</p>
      `;

  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: voluntary
        ? "Your CSL membership has been cancelled"
        : "Your CSL membership has ended — payment could not be collected",
      html,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType, to, err });
    throw err;
  }
  logEmailSend(emailType, stripeEventId);
}

export async function sendCancellationVolunteerAlert({
  memberEmail,
  planName,
  voluntary,
  stripeEventId,
}: {
  memberEmail: string;
  planName: string | null;
  voluntary: boolean;
  stripeEventId: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const emailType = "cancellation_volunteer_alert";
  if (await hasEmailBeenSent(emailType, stripeEventId)) {
    console.log(`[resend] ${emailType} already sent for event ${stripeEventId} — skipping`);
    return;
  }

  const subject = voluntary
    ? `Membership cancelled (member requested): ${memberEmail}`
    : `Membership ended (payment failure, not requested): ${memberEmail}`;

  const bodyNote = voluntary
    ? "The member requested this cancellation. They may be open to a call to discuss their reasons and, if appropriate, reactivation."
    : "This was NOT a voluntary cancellation — the member's card was declined through all 8 Smart Retries attempts over 15 days. They may not be aware their membership has ended. Worth a proactive check-in, since this is often a recoverable card issue, not a decision to leave.";

  try {
    await resend.emails.send({
      from: "CSL Website <info@celticsupporters.net>",
      to: "info@celticsupporters.net",
      subject,
      html: `
        <p>A membership has ended.</p>
        <p><strong>Member:</strong> ${memberEmail}</p>
        <p><strong>Plan:</strong> ${planName ?? "Unknown"}</p>
        <p><strong>Reason:</strong> ${voluntary ? "Member requested cancellation" : "Payment failure — dunning exhausted"}</p>
        <p>${bodyNote}</p>
        <p><a href="${SITE_URL}/member-portal/admin/members?q=${encodeURIComponent(memberEmail)}">View member timeline</a></p>
      `,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType, to: "info@celticsupporters.net", err });
    throw err;
  }
  logEmailSend(emailType, stripeEventId);
}

// ── Pending-cancellation emails (click-time) ────────────────────────────────
// Fires on customer.subscription.updated when cancel_at transitions from
// null to a timestamp — NOT on cancel_at_period_end, which our own
// /api/subscription/* annual-switch flow also sets, and which the Stripe
// Dashboard's "cancel at period end" option sets too (confirmed against
// Stripe's own docs) — sending "your cancellation has been received" in
// either of those cases would be wrong. See app/api/webhooks/stripe/route.ts
// for the detection logic and the per-member one-hour repeat guard.

export async function sendPendingCancellationEmail({
  to,
  firstName,
  periodEndDate,
  stripeEventId,
}: {
  to: string;
  firstName: string | null;
  periodEndDate: string | null;
  stripeEventId: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const emailType = "cancellation_pending";
  if (await hasEmailBeenSent(emailType, stripeEventId)) {
    console.log(`[resend] ${emailType} already sent for event ${stripeEventId} — skipping`);
    return;
  }

  const greeting = firstName ? `Hello ${firstName},` : "Hello,";
  const endedPhrase = periodEndDate
    ? `right up until ${periodEndDate}`
    : "right up until your current billing period ends";

  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: "We've received your cancellation",
      html: `
        <p>${greeting}</p>
        <p>We've received your request to cancel your Celtic Supporters Limited membership. We're sorry to see you go.</p>
        <p>You'll keep full access to your membership - the portal, documents, and everything else - ${endedPhrase}. Nothing changes before then.</p>
        <p>If you change your mind, you can reverse this at any time before then from your member portal:</p>
        <p><a href="${SITE_URL}/member-portal?tab=membership" style="display:inline-block;background:#1B4D2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Manage my membership</a></p>
        <p>A volunteer may be in touch to hear how we can do better, but there's nothing you need to do.</p>
        <p>Celtic Supporters Limited</p>
      `,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType, to, err });
    throw err;
  }
  logEmailSend(emailType, stripeEventId);
}

export async function sendPendingCancellationVolunteerAlert({
  memberEmail,
  planName,
  amountPence,
  memberSinceDate,
  periodEndDate,
  daysRemaining,
  stripeEventId,
}: {
  memberEmail: string;
  planName: string | null;
  amountPence: number | null;
  memberSinceDate: string | null;
  periodEndDate: string | null;
  daysRemaining: number | null;
  stripeEventId: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const emailType = "cancellation_pending_volunteer_alert";
  if (await hasEmailBeenSent(emailType, stripeEventId)) {
    console.log(`[resend] ${emailType} already sent for event ${stripeEventId} — skipping`);
    return;
  }

  const amountDisplay = amountPence != null ? `£${(amountPence / 100).toFixed(2)}` : "Unknown";
  const daysNote = daysRemaining != null
    ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} from now`
    : "unknown";

  try {
    await resend.emails.send({
      from: "CSL Website <info@celticsupporters.net>",
      to: "info@celticsupporters.net",
      subject: `Cancellation scheduled: ${memberEmail} — act before ${periodEndDate ?? "the end date"}`,
      html: `
        <p>A member has scheduled their cancellation - this is still reversible.</p>
        <p><strong>Member:</strong> ${memberEmail}</p>
        <p><strong>Plan:</strong> ${planName ?? "Unknown"}</p>
        <p><strong>Amount:</strong> ${amountDisplay}</p>
        <p><strong>Member since:</strong> ${memberSinceDate ?? "Unknown"}</p>
        <p><strong>Access ends:</strong> ${periodEndDate ?? "Unknown"} (${daysNote})</p>
        <p>This is the best window to reach out - they haven't left yet. A short, genuine call to understand why and offer to help often turns this around.</p>
        <p><a href="${SITE_URL}/member-portal/admin/members?q=${encodeURIComponent(memberEmail)}">View member timeline</a></p>
      `,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType, to: "info@celticsupporters.net", err });
    throw err;
  }
  logEmailSend(emailType, stripeEventId);
}

export async function sendCancellationReversedEmail({
  to,
  firstName,
  stripeEventId,
}: {
  to: string;
  firstName: string | null;
  stripeEventId: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const emailType = "cancellation_reversed";
  if (await hasEmailBeenSent(emailType, stripeEventId)) {
    console.log(`[resend] ${emailType} already sent for event ${stripeEventId} — skipping`);
    return;
  }

  const greeting = firstName ? `Hello ${firstName},` : "Hello,";

  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: "Your cancellation has been reversed - you're still a member",
      html: `
        <p>${greeting}</p>
        <p>Good news - your Celtic Supporters Limited membership cancellation has been reversed. Your membership will continue as normal, and nothing further is required from you.</p>
        <p>Thank you for staying with us.</p>
        <p>Celtic Supporters Limited</p>
      `,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType, to, err });
    throw err;
  }
  logEmailSend(emailType, stripeEventId);
}

// ── AGM Package 6 - one email per public submission ─────────────────────────
// Six flows, section 6 of the package brief. Attachments carry the same PDF
// the submitter can download at the point of completion - lib/resend.ts does
// not regenerate different content for the email than for the download.
// Callers are responsible for the log-then-record pattern that writes
// email_sent_at/email_error back onto the row; these functions only send.

type PdfAttachment = { filename: string; content: Buffer };

export async function sendRequisitionSignatureEmail({
  to,
  firstName,
  pdf,
}: {
  to: string;
  firstName: string;
  pdf: PdfAttachment;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const c = P6_COPY.requisitionSignature;
  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: c.subject,
      html: `<p>Hello ${firstName},</p><p>${c.intro}</p><p>${c.nextStep}</p><p>Celtic Supporters Limited</p>`,
      attachments: [pdf],
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "agm_requisition_signature", to, err });
    throw err;
  }
  logEmailSend("agm_requisition_signature");
}

export async function sendRequisitionSupporterEmail({
  to,
  firstName,
}: {
  to: string;
  firstName: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const c = P6_COPY.requisitionSupporter;
  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: c.subject,
      html: `
        <p>Hello ${firstName},</p>
        <p>${c.intro}</p>
        <p>${c.nextStep}</p>
        <p><a href="${SITE_URL}/membership" style="display:inline-block;background:#1B4D2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Join CSL</a></p>
        <p>Celtic Supporters Limited</p>
      `,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "agm_requisition_supporter", to, err });
    throw err;
  }
  logEmailSend("agm_requisition_supporter");
}

export async function sendProxyInterestEmail({
  to,
  firstName,
}: {
  to: string;
  firstName: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const c = P6_COPY.proxyInterestPreNotice;
  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: c.subject,
      html: `<p>Hello ${firstName},</p><p>${c.intro}</p><p>${c.nextStep}</p><p>Celtic Supporters Limited</p>`,
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "agm_proxy_interest", to, err });
    throw err;
  }
  logEmailSend("agm_proxy_interest");
}

export async function sendProxyAppointmentWeLodgeEmail({
  to,
  firstName,
  pdf,
}: {
  to: string;
  firstName: string;
  pdf: PdfAttachment;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const c = P6_COPY.proxyAppointmentWeLodge;
  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: c.subject,
      html: `<p>Hello ${firstName},</p><p>${c.intro}</p><p>${c.nextStep}</p><p>Celtic Supporters Limited</p>`,
      attachments: [pdf],
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "agm_proxy_appointment_we_lodge", to, err });
    throw err;
  }
  logEmailSend("agm_proxy_appointment_we_lodge");
}

export async function sendProxyAppointmentMemberLodgesEmail({
  to,
  firstName,
  pdf,
}: {
  to: string;
  firstName: string;
  pdf: PdfAttachment;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const c = P6_COPY.proxyAppointmentMemberLodges;
  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: c.subject,
      html: `<p>Hello ${firstName},</p><p>${c.intro}</p><p>${c.nextStep}</p><p>Celtic Supporters Limited</p>`,
      attachments: [pdf],
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "agm_proxy_appointment_member_lodges", to, err });
    throw err;
  }
  logEmailSend("agm_proxy_appointment_member_lodges");
}

export async function sendProxyAppointmentNomineeEmail({
  to,
  firstName,
  pdf,
  confirmId,
}: {
  to: string;
  firstName: string;
  pdf: PdfAttachment;
  /** agm_proxies.id - the confirmation link's only token, per section 7. */
  confirmId: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const c = P6_COPY.proxyAppointmentNominee;
  const confirmUrl = `${SITE_URL}/proxy/confirm/${confirmId}`;
  try {
    await resend.emails.send({
      from: "Celtic Supporters Limited <info@celticsupporters.net>",
      to,
      subject: c.subject,
      html: `
        <p>Hello ${firstName},</p>
        <p>${c.intro}</p>
        <p>${c.nextStep}</p>
        <p><a href="${confirmUrl}" style="display:inline-block;background:#1B4D2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">${c.confirmButtonLabel}</a></p>
        <p>Celtic Supporters Limited</p>
      `,
      attachments: [pdf],
    });
  } catch (err) {
    console.error("[resend] send failed", { emailType: "agm_proxy_appointment_nominee", to, err });
    throw err;
  }
  logEmailSend("agm_proxy_appointment_nominee");
}
