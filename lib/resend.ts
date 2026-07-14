import { Resend } from "resend";
import { getSupabase } from "@/lib/supabase";

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

export function logEmailSend(emailType: string): void {
  // fire-and-forget — never blocks the send, never throws
  ;(async () => {
    try {
      await getSupabase().from("email_log").insert({ email_type: emailType });
    } catch (e) {
      console.error("[resend] email_log insert failed:", e);
    }
  })();
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

  await resend.emails.send({
    from: "CSL Website <info@celticsupporters.net>",
    to: "info@celticsupporters.net",
    subject: `New Share Tracing Enquiry - ${params.name}`,
    html: intakeHtml(params),
  });
  logEmailSend("share_tracing");
}

export async function sendProxyNotification(
  params: IntakeNotificationParams
): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: "CSL Website <info@celticsupporters.net>",
    to: "info@celticsupporters.net",
    subject: `New Proxy Assignment Request - ${params.name}`,
    html: intakeHtml(params),
  });
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

  const displayName = name ?? "Member";

  await resend.emails.send({
    from: "Celtic Supporters Limited <info@celticsupporters.net>",
    to: email,
    subject: "Welcome to Celtic Supporters Limited",
    html: `
      <p>Hello ${displayName},</p>
      <p>Thank you for joining Celtic Supporters Limited. Your membership is now active.</p>
      <p><strong>Your plan:</strong> ${planName}</p>
      <p>You can log in to your member portal at any time to manage your membership, view documents, and track your enquiries:</p>
      <p><a href="${SITE_URL}/member-portal">${SITE_URL}/member-portal</a></p>
      <p>Together we are building the shareholder voice Celtic FC needs.</p>
      <p>Celtic Supporters Limited</p>
    `,
  });
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

  await resend.emails.send({
    from: "Celtic Supporters Limited <info@celticsupporters.net>",
    to,
    subject: "Reset your CSL password",
    html: `
      <p>Hello,</p>
      <p>We received a request to reset the password for your Celtic Supporters Limited account.</p>
      <p><a href="${resetLink}" style="display:inline-block;background:#1B4D2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Reset my password</a></p>
      <p style="color:#666;font-size:0.9em">This link expires in 24 hours. If you did not request a password reset, you can ignore this email — your account is safe.</p>
      <p>Celtic Supporters Limited</p>
    `,
  });
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

  await resend.emails.send({
    from: "Celtic Supporters Limited <info@celticsupporters.net>",
    to,
    subject: "Your CSL sign-in link",
    html: `
      <p>Hello,</p>
      <p>Here is your one-click sign-in link for Celtic Supporters Limited. This link is valid for 24 hours.</p>
      <p><a href="${magicLink}" style="display:inline-block;background:#1B4D2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Sign in to CSL</a></p>
      <p style="color:#666;font-size:0.9em">If you did not request this link, you can ignore this email — your account is safe.</p>
      <p>Celtic Supporters Limited</p>
    `,
  });
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

  await resend.emails.send({
    from: "Celtic Supporters Limited <info@celticsupporters.net>",
    to,
    subject: "Action required: your CSL membership payment failed",
    html: `
      <p>${greeting}</p>
      <p>We were unable to collect your Celtic Supporters Limited membership payment${attemptNote}. This may be because your card has expired or your bank declined the charge.</p>
      <p>To keep your membership active, please update your payment details as soon as possible:</p>
      <p><a href="${SITE_URL}/member-portal?tab=subscription">Update your payment details</a></p>
      <p>If you have any questions, contact us at <a href="mailto:membership@celticsupporters.net">membership@celticsupporters.net</a>.</p>
      <p>Celtic Supporters Limited</p>
    `,
  });
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

  await resend.emails.send({
    from: "CSL Website <info@celticsupporters.net>",
    to: "membership@celticsupporters.net",
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

  await resend.emails.send({
    from: "Celtic Supporters Limited <info@celticsupporters.net>",
    to,
    subject: "Your CSL membership card expires soon",
    html: `
      <p>${greeting}</p>
      <p>${cardDesc} expires ${expiry}. To avoid any interruption to your Celtic Supporters Limited membership, please update your payment details before then.</p>
      <p><a href="${SITE_URL}/member-portal?tab=subscription">Update your payment details</a></p>
      <p>If you have any questions, contact us at <a href="mailto:membership@celticsupporters.net">membership@celticsupporters.net</a>.</p>
      <p>Celtic Supporters Limited</p>
    `,
  });
  logEmailSend("card_expiry");
}
