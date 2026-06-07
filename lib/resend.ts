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

export async function sendPaymentFailedEmail(to: string): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  // The from domain must be verified in the Resend Dashboard before this sends.
  await resend.emails.send({
    from: "CSL Membership <membership@celticsupporterslimited.net>",
    to,
    subject: "Action required: your CSL membership payment failed",
    html: `
      <p>Hello,</p>
      <p>We were unable to collect your Celtic Supporters Limited membership payment. This may be because your card has expired or your bank declined the charge.</p>
      <p>To keep your membership active, please update your payment details as soon as possible:</p>
      <p><a href="${SITE_URL}/member-portal/subscription">Update your payment details</a></p>
      <p>If you have any questions, contact us at <a href="mailto:membership@celticsupporterslimited.net">membership@celticsupporterslimited.net</a>.</p>
      <p>Celtic Supporters Limited</p>
    `,
  });
}
