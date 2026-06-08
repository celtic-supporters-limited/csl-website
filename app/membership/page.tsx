import type { Metadata } from "next";
import MembershipPlans from "./MembershipPlans";
import { Container } from "@/components/Container";

export const metadata: Metadata = {
  title: "Join CSL - Celtic Supporters Limited",
  description:
    "Join Celtic Supporters Limited from £10/month. Your subscription directly funds share acquisition and our governance campaign at Celtic FC.",
};

const FAQ = [
  {
    q: "Can I cancel my membership?",
    a: "Yes. Monthly and custom monthly memberships can be cancelled at any time from your member portal. Annual plans can be cancelled before the next renewal date. Lifetime memberships are a one-off payment with no further charges.",
  },
  {
    q: "Do I need to be a Celtic shareholder to join?",
    a: "No. Any Celtic supporter can join CSL as a member. You do not need to hold Celtic PLC shares to support our work.",
  },
  {
    q: "How is my payment processed?",
    a: "All payments are processed securely through Stripe, a PCI-DSS compliant payment provider. CSL never stores your card details. You will receive an automated receipt email after each payment.",
  },
  {
    q: "Can I change my subscription amount?",
    a: "Yes. You can upgrade or change your plan at any time from within your member portal. Contact info@celticsupporters.net if you would like to discuss a bespoke arrangement.",
  },
];

export default function MembershipPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-csl-dark to-csl-mid text-white py-[64px]">
        <div className="absolute -top-[60px] -right-[60px] w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <div className="absolute -bottom-[100px] left-[20%] w-[300px] h-[300px] bg-white/[0.03] rounded-full" />
        <Container className="relative z-10">
          <div className="max-w-[680px]">
            <div className="inline-flex items-center gap-1.5 bg-white/15 border border-white/25 px-3.5 py-1.5 rounded-full text-[0.82rem] font-medium text-white/90 mb-5 backdrop-blur-sm">
              Choose from the available options below
            </div>
            <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.15] tracking-tight mb-5">
              Join CSL. Fund<br />Real Change.
            </h1>
            <p className="text-[1.1rem] text-white/85 max-w-[540px] leading-[1.7]">
              Your subscription goes directly toward acquiring Celtic PLC shares and
              funding our governance campaign. To discuss other membership options,
              email{" "}
              <a
                href="mailto:info@celticsupporters.net"
                className="underline underline-offset-2 hover:text-white"
              >
                info@celticsupporters.net
              </a>
              .
            </p>
          </div>
        </Container>
      </section>

      {/* PLANS */}
      <section className="py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              Membership Plans
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mb-3.5">
              Choose Your Level of Support
            </h2>
            <p className="text-[1.05rem] text-gray-500 max-w-[600px] mx-auto">
              All plans include full membership benefits. Monthly and annual plans
              are recurring subscriptions managed securely via Stripe.
            </p>
          </div>
          <MembershipPlans />
        </Container>
      </section>

      {/* WHAT YOUR MEMBERSHIP FUNDS */}
      <section className="bg-gray-50 py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              Member Benefits
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight">
              What Your Membership Funds
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: "📈",
                title: "Share Acquisition",
                body: "Every subscription payment directly funds CSL's purchase of Celtic PLC shares on the open market and from willing private sellers.",
              },
              {
                icon: "🏛️",
                title: "Governance Campaign",
                body: "Funding our legal, operational, and strategic work to bring about transparent governance reform at Celtic FC.",
              },
              {
                icon: "🎥",
                title: "Members-Only Content",
                body: "Access to all CSL meeting recordings, presentations, governance briefings, and strategy updates in your member portal.",
              },
            ].map(({ icon, title, body }) => (
              <div
                key={title}
                className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
              >
                <div className="w-[52px] h-[52px] bg-csl-light rounded-xl flex items-center justify-center text-2xl mb-5">
                  {icon}
                </div>
                <h3 className="text-[1.1rem] font-bold mb-2.5">{title}</h3>
                <p className="text-[0.92rem] text-gray-500 leading-[1.65]">{body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              FAQ
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight">
              Common Questions
            </h2>
          </div>
          <div className="max-w-[720px] mx-auto flex flex-col gap-2.5">
            {FAQ.map(({ q, a }) => (
              <details
                key={q}
                className="group border border-gray-200 rounded-xl overflow-hidden"
              >
                <summary className="flex justify-between items-center gap-3 px-5 py-[17px] font-semibold text-[0.9375rem] cursor-pointer list-none hover:bg-csl-light hover:text-csl-dark transition-colors duration-150">
                  <span>{q}</span>
                  <span className="text-csl-dark text-xl font-normal flex-shrink-0 group-open:hidden">+</span>
                  <span className="text-csl-dark text-xl font-normal flex-shrink-0 hidden group-open:block">−</span>
                </summary>
                <div className="px-5 pb-4 text-[0.9125rem] text-gray-500 leading-[1.7]">
                  {a}
                </div>
              </details>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
