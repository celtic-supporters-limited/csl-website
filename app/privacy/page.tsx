import type { Metadata } from "next";
import { Container } from "@/components/Container";

export const metadata: Metadata = {
  title: "Privacy Policy | Celtic Supporters Limited",
  description: "How Celtic Supporters Limited collects, uses and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-csl-dark to-csl-mid text-white py-[60px]">
        <div className="absolute -top-[60px] -right-[60px] w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <Container className="relative z-10">
          <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.15] tracking-tight mb-5">
            Privacy Policy
          </h1>
        </Container>
      </section>

      {/* CONTENT */}
      <section className="py-[72px]">
        <Container>
          <div className="max-w-[780px]">
            <p className="text-gray-700 leading-[1.8] text-[0.95rem] mb-10">
              Celtic Supporters Limited (&quot;CSL&quot;, &quot;we&quot;, &quot;our&quot;,
              &quot;us&quot;) is committed to protecting the privacy of our members and visitors. This
              Privacy Policy explains how we collect, use and protect your personal data when you use
              our website or join as a member. CSL is a company limited by guarantee, registered in
              Scotland.
            </p>

            <Section number="1" title="Data Controller">
              <p>
                Celtic Supporters Limited is the data controller for all personal data submitted
                through our website or membership portal.
              </p>
              <p>
                Contact:{" "}
                <a href="mailto:info@celticsupporters.net" className="text-csl-dark hover:underline">
                  info@celticsupporters.net
                </a>
              </p>
            </Section>

            <Section number="2" title="What Data We Collect">
              <DataRow label="Identification Data">
                Name, date of birth (if provided), telephone number, email address, postal address (if
                provided), shareholder or season ticket status, membership tier.
              </DataRow>
              <DataRow label="Account Data">
                Login credentials, membership start/renewal/cancellation history, communication
                preferences.
              </DataRow>
              <DataRow label="Payment Data">
                Stripe payment identifiers, subscription details, card expiry month and year (via
                Stripe). CSL does not store full card numbers.
              </DataRow>
              <DataRow label="Technical Data">
                IP address, device and browser information, cookies, analytics.
              </DataRow>
            </Section>

            <Section number="3" title="Cookies">
              <p>
                <strong className="text-gray-900">Types used:</strong> Essential (required for site
                functionality, login, payments, security), Analytics (site usage), Preference (user
                settings).
              </p>
              <p>
                <strong className="text-gray-900">Consent:</strong> Visitors can accept or decline
                analytics cookies. Essential cookies cannot be disabled.
              </p>
            </Section>

            <Section number="4" title="Lawful Basis for Processing">
              <ul className="list-disc pl-5 space-y-2 text-gray-700 text-[0.95rem] leading-[1.75]">
                <li><strong className="text-gray-900">Contract</strong> - to provide membership services, manage subscriptions, communicate operational updates and administer accounts.</li>
                <li><strong className="text-gray-900">Consent</strong> - for marketing communications.</li>
                <li><strong className="text-gray-900">Legitimate Interests</strong> - site security, fraud prevention, improving member experience, tracing lost shareholders, maintaining accurate membership records.</li>
                <li><strong className="text-gray-900">Legal Obligation</strong> - keeping necessary financial and compliance records.</li>
              </ul>
            </Section>

            <Section number="5" title="How We Use Your Data">
              <p>
                To provide membership services, manage subscription payments, communicate updates and
                governance activity, respond to enquiries, maintain shareholder engagement records,
                improve CSL&apos;s services, comply with legal duties, and deliver share tracing support.
              </p>
              <p className="font-medium text-gray-900">We never sell personal data.</p>
            </Section>

            <Section number="6" title="Sharing Your Data">
              <p>
                We share data only with: Stripe (payment processing), email service providers, website
                hosting providers, CRM or membership management platforms, professional advisers
                (legal/accounting), regulators or authorities where required by law. All third-party
                processors are bound by data processing agreements.
              </p>
            </Section>

            <Section number="7" title="Data Retention">
              <ul className="list-disc pl-5 space-y-2 text-gray-700 text-[0.95rem] leading-[1.75]">
                <li>Membership account data: duration of membership + 6 years.</li>
                <li>Payment records: 6 years (legal requirement).</li>
                <li>Communications data: 2 years from last contact.</li>
              </ul>
              <p className="mt-3">You may request deletion at any time unless legal obligations require retention.</p>
            </Section>

            <Section number="8" title="Your Rights">
              <p>Under UK GDPR you have the right to:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700 text-[0.95rem] leading-[1.75] mt-2">
                <li>Access your personal data</li>
                <li>Request correction</li>
                <li>Request deletion</li>
                <li>Restrict processing</li>
                <li>Object to processing (including marketing)</li>
                <li>Data portability</li>
                <li>Withdraw consent</li>
                <li>Lodge a complaint with the ICO</li>
              </ul>
            </Section>

            <Section number="9" title="Security">
              <p>
                We use industry-standard encryption and access controls. Access is restricted to
                authorised personnel and volunteers under strict confidentiality obligations.
              </p>
            </Section>

            <Section number="10" title="Children&apos;s Data">
              <p>We do not knowingly collect data from children under 16. Any such data will be deleted.</p>
            </Section>

            <Section number="11" title="Contact">
              <p>
                For privacy requests:{" "}
                <a href="mailto:info@celticsupporters.net" className="text-csl-dark hover:underline">
                  info@celticsupporters.net
                </a>
              </p>
            </Section>
          </div>
        </Container>
      </section>
    </>
  );
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-[1.1rem] font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">
        <span className="text-csl-dark mr-1.5">{number}.</span>{title}
      </h2>
      <div className="space-y-3 text-gray-700 text-[0.95rem] leading-[1.75]">{children}</div>
    </div>
  );
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <span className="font-semibold text-gray-900">{label}: </span>
      {children}
    </div>
  );
}
