import type { Metadata } from "next";
import Link from "next/link";
import ProxyForm from "./ProxyForm";
import { Container } from "@/components/Container";
import { isGateOpen } from "@/lib/site-gates";
import { APPOINTEE_LABEL } from "@/lib/agm-appointee";

export const metadata: Metadata = {
  title: "Proxy Assignment - Celtic Supporters Limited",
  description:
    "Appoint a proxy for the Celtic PLC AGM. Your shares are voted by a named individual acting for CSL members, at no cost, in line with our published governance positions.",
};

// Reads the launch gate on every request.
export const dynamic = "force-dynamic";

export default async function ProxyPage() {
  const proxyOpen = await isGateOpen("proxy_open");

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-csl-dark to-csl-mid text-white py-[60px]">
        <div className="absolute -top-[60px] -right-[60px] w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <div className="absolute -bottom-[100px] left-[20%] w-[300px] h-[300px] bg-white/[0.03] rounded-full" />
        <Container className="relative z-10">
          <div className="max-w-[680px]">
            <div className="inline-flex items-center gap-1.5 bg-white/15 border border-white/25 px-3.5 py-1.5 rounded-full text-[0.82rem] font-medium text-white/90 mb-5 backdrop-blur-sm">
              Your vote, amplified
            </div>
            <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.15] tracking-tight mb-5">
              Appoint Your<br />AGM Proxy
            </h1>
            <p className="text-[1.1rem] text-white/85 mb-9 max-w-[540px] leading-[1.7]">
              If you hold Celtic PLC shares but cannot attend the Annual General
              Meeting in person, you can appoint someone to attend and vote on your
              behalf. CSL coordinates proxy appointments to {APPOINTEE_LABEL}, so
              that shares which would otherwise go uncast are voted on the
              governance matters that affect every Celtic fan.
            </p>
            <Link
              href="#assign"
              className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold bg-white text-csl-dark hover:bg-csl-light transition-colors duration-200"
            >
              Appoint My Proxy
            </Link>
          </div>
        </Container>
      </section>

      {/* WHAT IS PROXY VOTING */}
      <section className="py-[72px]">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[60px] items-center">
            <div>
              <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
                What Is Proxy Voting?
              </span>
              <h2 className="text-[clamp(1.5rem,2.5vw,2rem)] font-extrabold tracking-tight mt-3 mb-4">
                Every Celtic Share Has a Vote. Most Go Uncast.
              </h2>
              <p className="text-gray-500 leading-[1.75] mb-4">
                Celtic PLC holds an Annual General Meeting where shareholders vote
                on resolutions covering the Board, remuneration, and significant
                corporate decisions. Most shareholders never cast their vote, either
                because they cannot attend or because they do not know how to vote
                by proxy.
              </p>
              <p className="text-gray-500 leading-[1.75] mb-4">
                A proxy has to be appointed to a named person, not to a company.
                When you appoint through CSL, your proxy is {APPOINTEE_LABEL}, who
                attends the meeting and votes your shares on governance resolutions
                in line with our published positions. Your shares, and the ownership
                of them, remain entirely yours.
              </p>
              <p className="text-gray-500 leading-[1.75]">
                <strong className="text-gray-800">
                  It costs nothing. It takes minutes. And it matters.
                </strong>
              </p>
            </div>

            <div className="bg-csl-light rounded-2xl p-9">
              <h3 className="font-bold text-csl-dark mb-5">Why It Matters</h3>
              {[
                { label: "Celtic PLC shareholders", value: "Tens of thousands", highlight: true },
                { label: "Typical AGM votes cast", value: "~20-30%", highlight: false },
                { label: "CSL shares held", value: "Growing", highlight: true },
                { label: "Proxy votes coordinated", value: "Active campaign", highlight: true },
              ].map(({ label, value, highlight }) => (
                <div
                  key={label}
                  className="flex justify-between items-center py-2.5 border-b border-csl-dark/10 text-[0.9rem] last:border-0"
                >
                  <span className="text-gray-500 font-medium">{label}</span>
                  <span className={`font-semibold ${highlight ? "text-csl-dark" : "text-gray-600"}`}>
                    {value}
                  </span>
                </div>
              ))}
              <div className="mt-5 p-4 bg-white rounded-xl border border-csl-dark/20">
                <div className="text-[0.85rem] text-csl-dark font-semibold mb-1.5">
                  Collective Power
                </div>
                <div className="text-[0.82rem] text-gray-500 leading-relaxed">
                  Each appointment adds to the block of shares voted together at the
                  meeting. As our holdings and proxy appointments grow, that block
                  carries meaningful weight in board decisions.
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-gray-50 py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              How It Works
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight">
              Assigning Your Proxy Takes Minutes
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 max-w-[1000px] mx-auto">
            {[
              { num: 1, title: "Register Below", body: "Confirm your name, shareholding details, and email address in the form below." },
              { num: 2, title: "We Send a Form", body: `CSL sends you the official proxy form, completed to appoint ${APPOINTEE_LABEL} as your proxy.` },
              { num: 3, title: "Sign and Return", body: "Sign and return the form to Computershare by the stated deadline before the AGM." },
              { num: 4, title: "Your Proxy Votes", body: "Your appointed proxy attends the AGM and votes your shares in line with CSL's published governance positions." },
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

      {/* PROXY FORM */}
      <section id="assign" className="py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              Appoint Your Proxy
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mb-3.5">
              {proxyOpen ? "Register Your Proxy Intent" : "Proxy Appointment Opens Later This Year"}
            </h2>
            <p className="text-[1.05rem] text-gray-500 max-w-[600px] mx-auto">
              {proxyOpen
                ? "Complete this form and we will send you the official proxy documentation before the meeting."
                : "A proxy can only be appointed for a specific meeting, so this page opens once Celtic PLC issues the formal Notice of the Annual General Meeting."}
            </p>
          </div>

          {proxyOpen ? (
            <ProxyForm />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-[520px] mx-auto text-center shadow-lg">
              <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1 rounded-full text-[0.78rem] font-semibold mb-4">
                Not open yet
              </span>
              <h3 className="text-xl font-bold text-csl-dark mb-3">
                We will contact you when it opens
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Celtic PLC has not yet issued the Notice of AGM. Once it does, this page opens and
                we will send the proxy form to every CSL member who holds shares. Join CSL to be on
                that list, or email{" "}
                <a href="mailto:info@celticsupporters.net" className="text-csl-dark underline">
                  info@celticsupporters.net
                </a>{" "}
                if you hold shares and are not yet a member.
              </p>
              <Link
                href="/membership"
                className="inline-flex items-center px-7 py-3 rounded-lg text-[0.92rem] font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200"
              >
                Join CSL
              </Link>
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
