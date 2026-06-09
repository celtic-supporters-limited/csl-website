import { Resend } from "resend";

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
}

export async function sendPaymentFailedEmail(to: string): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  // The from domain must be verified in the Resend Dashboard before this sends.
  await resend.emails.send({
    from: "CSL Membership <membership@celticsupporters.net>",
    to,
    subject: "Action required: your CSL membership payment failed",
    html: `
      <p>Hello,</p>
      <p>We were unable to collect your Celtic Supporters Limited membership payment. This may be because your card has expired or your bank declined the charge.</p>
      <p>To keep your membership active, please update your payment details as soon as possible:</p>
      <p><a href="${SITE_URL}/member-portal/subscription">Update your payment details</a></p>
      <p>If you have any questions, contact us at <a href="mailto:membership@celticsupporters.net">membership@celticsupporters.net</a>.</p>
      <p>Celtic Supporters Limited</p>
    `,
  });
}
