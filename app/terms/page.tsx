import type { Metadata } from "next";
import { Container } from "@/components/Container";

export const metadata: Metadata = {
  title: "Terms and Conditions | Celtic Supporters Limited",
  description: "Terms and conditions of use for the Celtic Supporters Limited website and membership.",
};

export default function TermsPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-csl-dark to-csl-mid text-white py-[60px]">
        <div className="absolute -top-[60px] -right-[60px] w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <Container className="relative z-10">
          <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.15] tracking-tight mb-5">
            Terms and Conditions
          </h1>
        </Container>
      </section>

      {/* CONTENT */}
      <section className="py-[72px]">
        <Container>
          <div className="max-w-[780px]">
            <h2 className="text-[1.3rem] font-bold text-gray-900 mb-5">
              Terms and Conditions of Use
            </h2>
            <p className="text-gray-700 leading-[1.8] text-[0.95rem] mb-10">
              By using this website or becoming a member of CSL, you agree to the following terms:
            </p>

            <Section number="1" title="Membership Structure">
              <p>
                Membership is open to individuals aged 16 or over. Each member has one vote under
                CSL&apos;s Articles of Association. Membership fees support operational costs, share
                acquisition and professional services. CSL reserves the right to refuse or terminate
                membership for conduct inconsistent with our values, provided lawful process is followed.
              </p>
            </Section>

            <Section number="2" title="Payments">
              <p>
                All payments are processed by Stripe. Membership renews monthly unless cancelled. CSL
                does not store card details.
              </p>
            </Section>

            <Section number="3" title="User Content and Conduct">
              <p>Members must not:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700 text-[0.95rem] leading-[1.75] mt-2 mb-3">
                <li>Post defamatory, abusive or unlawful content</li>
                <li>Harass or threaten CSL staff or volunteers</li>
                <li>Misrepresent CSL online or offline</li>
                <li>Attempt to gain unauthorised access to systems</li>
              </ul>
              <p>
                Where members submit content, they confirm they own the rights or have lawful
                permission. CSL reserves the right to remove any content at its discretion.
              </p>
            </Section>

            <Section number="4" title="Liability">
              <p>
                CSL provides information and services &quot;as is&quot;. We do not guarantee
                uninterrupted access. CSL is not liable for losses arising from membership decisions,
                website issues or third-party service failures unless required by law.
              </p>
            </Section>

            <Section number="5" title="Intellectual Property">
              <p>
                Content on this site is owned by CSL unless stated otherwise. Members must not copy
                or distribute content without permission. CSL does not claim ownership of content
                submitted by users.
              </p>
            </Section>

            <Section number="6" title="Governing Law">
              <p>
                These Terms and Conditions shall be governed by and construed in accordance with the
                laws of Scotland. The courts of Scotland shall have exclusive jurisdiction to settle
                any dispute or claim.
              </p>
            </Section>

            <Section number="7" title="Amendments">
              <p>CSL may amend these terms. Updates will be posted on the website.</p>
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
