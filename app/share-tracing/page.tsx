import Link from "next/link";
import ShareTracingForm from "./ShareTracingForm";
import { Container } from "@/components/Container";

export const metadata = {
  title: "Share Tracing - Celtic Supporters Limited",
  description:
    "Celtic PLC has over 37,000 registered shareholders. Many have lost certificates or inherited shares. CSL helps you find your shares and decide what to do with them.",
};

export default function ShareTracingPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-csl-dark to-csl-mid text-white py-[60px]">
        <div className="absolute -top-[60px] -right-[60px] w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <div className="absolute -bottom-[100px] left-[20%] w-[300px] h-[300px] bg-white/[0.03] rounded-full" />
        <Container className="relative z-10">
          <div className="max-w-[680px]">
            <div className="inline-flex items-center gap-1.5 bg-white/15 border border-white/25 px-3.5 py-1.5 rounded-full text-[0.82rem] font-medium text-white/90 mb-5 backdrop-blur-sm">
              Free service for all Celtic shareholders
            </div>
            <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.15] tracking-tight mb-5">
              Reunite With<br />Your Celtic Shares
            </h1>
            <p className="text-[1.1rem] text-white/85 mb-9 max-w-[540px] leading-[1.7]">
              Celtic PLC has over 37,000 registered shareholders. Many have lost their
              certificates, moved home, or inherited shares from a family member. CSL
              helps you find your shares and decide what to do with them.
            </p>
            <Link
              href="#enquiry"
              className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold bg-white text-csl-dark hover:bg-csl-light transition-colors duration-200"
            >
              Start Your Enquiry
            </Link>
          </div>
        </Container>
      </section>

      {/* WHO IS IT FOR */}
      <section className="py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              Who We Help
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight">
              Is This Service Right for You?
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: "📜",
                title: "Lost or Misplaced Certificates",
                body: "You know you purchased Celtic shares years ago but cannot locate the original share certificate. We can help you verify your holding and initiate a replacement.",
              },
              {
                icon: "👨‍👩‍👦",
                title: "Inherited or Estate Shares",
                body: "A family member has passed away and you believe they held Celtic shares. We can help you trace the holding, identify the correct process, and connect you with Computershare.",
              },
              {
                icon: "📮",
                title: "Address or Name Changes",
                body: "Your details at Computershare (Celtic's share registrar) are out of date, and correspondence has been going to an old address. We can guide you through updating your record.",
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

      {/* YOUR OPTIONS */}
      <section className="bg-gray-50 py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              Your Options
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight">
              Once Your Shares Are Found, You Have Choices
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: "🏦",
                title: "Hold Your Shares",
                body: "Update your details with Computershare and retain your Celtic PLC shareholding. You'll receive any future dividends and shareholder communications.",
              },
              {
                icon: "💰",
                title: "Sell to CSL",
                body: "CSL may be willing to purchase your shares at fair market value, providing you with a hassle-free exit while contributing to our collective holding.",
              },
              {
                icon: "🗳️",
                title: "Assign Your Proxy",
                body: "If you wish to retain your shares, you can assign your AGM voting proxy to CSL, amplifying our governance voice at Celtic PLC shareholder meetings.",
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

      {/* HOW IT WORKS */}
      <section className="py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              The Process
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mb-3.5">
              How Share Tracing Works
            </h2>
            <p className="text-[1.05rem] text-gray-500 max-w-[600px] mx-auto">
              Our volunteer team guides you through every step. The process typically
              takes 4-12 weeks depending on the complexity of your case.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 max-w-[1000px] mx-auto">
            {[
              { num: 1, title: "Submit Enquiry", body: "Complete the form below with as much detail as you can about your potential holding." },
              { num: 2, title: "Initial Review", body: "Our team reviews your enquiry and sends you a personalised guidance pack within 5 working days." },
              { num: 3, title: "Letter of Authority", body: "If needed, we provide you with a Letter of Authority (LOA) to authorise CSL to act on your behalf with Computershare." },
              { num: 4, title: "Resolution", body: "We work with Computershare to confirm your holding and guide you through your chosen next step - hold, sell, or proxy." },
            ].map(({ num, title, body }, i, arr) => (
              <div key={num} className="relative text-center px-6 py-8">
                <div className="w-[52px] h-[52px] bg-csl-dark text-white rounded-full flex items-center justify-center font-extrabold text-xl mx-auto mb-4">
                  {num}
                </div>
                <h4 className="text-base font-bold mb-2">{title}</h4>
                <p className="text-[0.88rem] text-gray-500">{body}</p>
                {i < arr.length - 1 && (
                  <span className="hidden lg:block absolute right-[-12px] top-1/2 -translate-y-1/2 text-csl-dark text-[1.4rem] font-bold">
                    &rarr;
                  </span>
                )}
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ENQUIRY FORM */}
      <section id="enquiry" className="bg-gray-50 py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              Get Started
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mb-3.5">
              Submit a Share Tracing Enquiry
            </h2>
            <p className="text-[1.05rem] text-gray-500 max-w-[600px] mx-auto">
              This service is free of charge for all Celtic shareholders. You do not
              need to be a CSL member.
            </p>
          </div>
          <ShareTracingForm />
        </Container>
      </section>
    </>
  );
}
