import Link from "next/link";
import { Search, Vote, Shield } from "lucide-react";
import { Container } from "@/components/Container";
import { getSupabase } from "@/lib/supabase";
import type { MembershipSnapshot } from "@/lib/membership-metrics";

export const revalidate = 3600;

const MEMBER_TARGET = 5000;
const FALLBACK_MEMBERS = 493;

async function getActiveMembers(): Promise<number> {
  try {
    const db = getSupabase();

    const { data: config } = await db
      .from("site_config")
      .select("value")
      .eq("key", "active_members")
      .maybeSingle();

    if (config?.value) return parseInt(config.value, 10);

    const { data: snap } = await db
      .from("membership_snapshots")
      .select("metrics")
      .order("snapshotted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const active = (snap?.metrics as MembershipSnapshot | null)?.combined?.active_total;
    if (typeof active === "number") return active;
  } catch {
    // fall through to hardcoded floor
  }
  return FALLBACK_MEMBERS;
}

export default async function HomePage() {
  const currentMembers = await getActiveMembers();
  const progressPct = ((currentMembers / MEMBER_TARGET) * 100).toFixed(2);

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-csl-dark text-white py-[90px] pb-20">
        {/* Ledger-line texture, ties to the "audited accounts" identity used in the card below */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent, transparent 39px, rgba(255,255,255,0.055) 40px)" }}
        />
        <svg className="absolute -top-24 -right-24 w-[560px] h-[560px] pointer-events-none" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="98" stroke="#C8A951" strokeOpacity="0.18" strokeWidth="0.75" />
        </svg>
        <svg className="absolute -bottom-32 left-[8%] w-[380px] h-[380px] pointer-events-none" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="98" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="0.75" />
        </svg>
        <Container className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-start gap-12">
            <div className="max-w-[680px]">
              <div className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 px-3.5 py-1.5 rounded-full text-[0.82rem] font-medium text-white/85 mb-5">
                Governance-Led Change at Celtic FC
              </div>
              <h1 className="text-[clamp(2rem,4vw,3.4rem)] font-extrabold leading-[1.12] tracking-tight mb-5">
                Celtic belongs to its shareholders.<br />
                <span className="text-csl-gold">We&apos;re organising them.</span>
              </h1>
              <p className="text-[1.1rem] text-white/80 mb-9 max-w-[540px] leading-[1.75]">
                Celtic Supporters Limited is a company formed by Celtic fans to build a
                real shareholding in Celtic FC, coordinate proxy votes, and push for the
                governance reform the club needs.
              </p>
              <div className="flex flex-wrap gap-3.5">
                <Link
                  href="/membership"
                  className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold bg-csl-gold text-gray-900 hover:brightness-105 transition-all duration-200 shadow-sm"
                >
                  Join from &pound;10/month
                </Link>
                <Link
                  href="/share-tracing"
                  className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold border border-white/40 text-white hover:bg-white/10 transition-colors duration-200"
                >
                  Trace Your Shares
                </Link>
              </div>
            </div>

            <div className="w-full lg:w-[380px] lg:flex-shrink-0 bg-white/[0.045] border border-white/15 rounded-md overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/15">
                <span className="font-mono text-[0.65rem] tracking-[0.1em] uppercase text-white/40">
                  CSL At a Glance
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-csl-gold flex-shrink-0" />
              </div>
              <div className="flex items-baseline justify-between gap-4 px-5 py-5 border-b border-white/10">
                <span className="text-[0.85rem] text-white/65">Governance demands filed</span>
                <span className="font-mono text-[2rem] font-bold text-csl-gold leading-none tabular-nums">12</span>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-5 py-5">
                <span className="text-[0.85rem] text-white/65">Volunteer-led</span>
                <span className="font-mono text-[2rem] font-bold text-csl-gold leading-none tabular-nums">100%</span>
              </div>
              <div className="px-5 py-3.5 text-[0.72rem] text-white/40 leading-relaxed border-t border-white/15">
                <span className="block text-white font-semibold mb-1">
                  One mission: governance reform at Celtic&nbsp;FC.
                </span>
                Verified against Celtic plc&rsquo;s own audited accounts and public regulatory filings.
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* MEMBERSHIP PROGRESS + FINANCIAL TRANSPARENCY */}
      <section className="bg-csl-mid py-9">
        <Container>
          <div className="flex flex-wrap items-center gap-x-10 gap-y-6 justify-between">
            <div className="flex-1 min-w-[260px]">
              <div className="flex justify-between items-center mb-2.5 gap-4">
                <span className="text-white/85 text-[0.9rem]">
                  <b className="text-white font-bold">{currentMembers}</b> members and growing. Help us reach 5,000.
                </span>
                <span className="text-white/70 font-medium text-[0.85rem] tabular-nums ml-4 flex-shrink-0">
                  {currentMembers.toLocaleString()} / {MEMBER_TARGET.toLocaleString()}
                </span>
              </div>
              <div className="bg-white/15 rounded-full h-2 w-full overflow-hidden">
                <div
                  className="bg-csl-gold h-full rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="flex gap-10 flex-wrap">
              {[
                { number: currentMembers.toLocaleString("en-GB"), label: "Members" },
                { number: "15,000", label: "Shares Held" },
              ].map(({ number, label }) => (
                <div key={label} className="text-center">
                  <div className="font-mono text-[1.5rem] font-bold text-csl-gold leading-none tabular-nums">
                    {number}
                  </div>
                  <div className="text-[0.7rem] text-white/60 mt-1 uppercase tracking-widest font-medium">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/membership"
              className="flex-shrink-0 inline-flex items-center px-6 py-2.5 rounded-lg text-[0.88rem] font-semibold bg-csl-gold text-gray-900 hover:brightness-105 transition-all duration-200"
            >
              Become a Member
            </Link>
          </div>
        </Container>
      </section>

      {/* SERVICES */}
      <section className="py-[72px] bg-csl-light">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-white text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3 border border-gray-200">
              What We Do
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mb-3.5">
              Three Ways CSL Drives Change
            </h2>
            <p className="text-[1.05rem] text-csl-muted max-w-[600px] mx-auto">
              We work on behalf of Celtic shareholders and supporters to bring about
              genuine governance reform at Celtic FC.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Search,
                title: "Share Tracing",
                body: "Thousands of Celtic shares are untraceable: certificates lost, estates unsettled, addresses changed. We help shareholders find their holding and decide what to do with it.",
                link: "/share-tracing",
                cta: "Start Tracing",
              },
              {
                icon: Vote,
                title: "Proxy Assignment",
                body: "If you hold Celtic shares but cannot attend the AGM, assigning your proxy vote to CSL amplifies our collective voice on governance matters that affect every fan and shareholder.",
                link: "/proxy",
                cta: "Assign Your Proxy",
              },
              {
                icon: Shield,
                title: "CSL Membership",
                body: "Join supporters funding CSL's work. Monthly, annual, or lifetime membership. Your subscription directly funds share acquisition and our governance campaign.",
                link: "/membership",
                cta: "Join from £10/month",
              },
            ].map(({ icon: Icon, title, body, link, cta }) => (
              <div
                key={title}
                className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
              >
                <div className="w-[52px] h-[52px] bg-csl-light rounded-xl flex items-center justify-center mb-5">
                  <Icon className="text-csl-dark" size={26} strokeWidth={1.75} />
                </div>
                <h3 className="text-[1.1rem] font-bold mb-2.5">{title}</h3>
                <p className="text-[0.92rem] text-csl-muted leading-[1.65]">{body}</p>
                <Link
                  href={link}
                  className="inline-flex items-center gap-1.5 mt-5 text-[0.88rem] font-semibold text-csl-dark hover:gap-2.5 transition-all duration-200"
                >
                  {cta} &rarr;
                </Link>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* HOW WE WORK */}
      <section className="py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              Our Approach
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mb-3.5">
              Shareholder Influence Through Collective Action
            </h2>
            <p className="text-[1.05rem] text-csl-muted max-w-[600px] mx-auto">
              Celtic PLC has tens of thousands of shareholders. CSL coordinates their
              voice to create real governance accountability.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 max-w-[1000px] mx-auto">
            {[
              {
                num: 1,
                title: "Members Join",
                body: "Supporters subscribe from £10/month. Funds go directly toward share acquisition.",
              },
              {
                num: 2,
                title: "Shares Acquired",
                body: "CSL purchases Celtic PLC shares on-market and off-market from willing sellers.",
              },
              {
                num: 3,
                title: "Proxy Collected",
                body: "Shareholders who can't attend the AGM assign their proxy vote to CSL.",
              },
              {
                num: 4,
                title: "Voice Exercised",
                body: "At the AGM, CSL votes its collective holding and assigned proxies on governance resolutions.",
              },
            ].map(({ num, title, body }, i, arr) => (
              <div key={num} className="relative text-center px-6 py-8">
                <div className="w-[52px] h-[52px] bg-csl-dark text-white rounded-full flex items-center justify-center font-extrabold text-xl mx-auto mb-4">
                  {num}
                </div>
                <h4 className="text-base font-bold mb-2">{title}</h4>
                <p className="text-[0.88rem] text-csl-muted">{body}</p>
                {i < arr.length - 1 && (
                  <span className="hidden lg:block absolute right-[-12px] top-1/2 -translate-y-1/2 text-csl-gold text-[1.4rem] font-bold">
                    &rarr;
                  </span>
                )}
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* THE CELTIC PARADOX TEASER */}
      <section className="bg-csl-light py-[72px]">
        <Container>
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_1px_300px]">
            <div className="relative p-9 lg:p-12">
              <div
                className="absolute top-0 right-0 w-0 h-0 pointer-events-none"
                style={{ borderStyle: "solid", borderWidth: "0 34px 34px 0", borderColor: "transparent rgba(200,169,81,0.18) transparent transparent" }}
              />
              <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-4">
                New Research
              </span>
              <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mb-4 text-gray-900">
                The Celtic Paradox
              </h2>
              <p className="text-csl-muted text-[1.02rem] leading-[1.75] mb-6 max-w-[52ch]">
                65 pages of shareholder analysis built on Celtic PLC&apos;s own audited accounts
                and public regulatory records. A governance case for a better-run Celtic.
                Not a takeover bid. Not regime change.
              </p>
              <Link
                href="/celtic-paradox"
                className="inline-flex items-center gap-2 text-csl-mid font-bold text-[0.97rem] hover:gap-3.5 transition-all duration-200 group"
              >
                Read the Research
                <span className="transition-transform duration-200 group-hover:translate-x-1">&rarr;</span>
              </Link>
            </div>

            <div className="hidden lg:block bg-gray-100" />

            <div className="bg-csl-light flex flex-col justify-center gap-6 px-8 py-8 lg:py-10 border-t lg:border-t-0 border-gray-200">
              {[
                { num: "65",  label: "Pages of analysis" },
                { num: "5",   label: "Financial years reviewed" },
                { num: "4",   label: "Documents available" },
              ].map(({ num, label }) => (
                <div key={label}>
                  <div className="font-mono text-[1.7rem] font-extrabold text-csl-dark leading-none tabular-nums">
                    {num}
                  </div>
                  <div className="text-[0.82rem] text-csl-muted mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* WHY IT MATTERS */}
      <section className="py-[72px]" id="about">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[60px] items-start">
            <div>
              <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
                Why Now
              </span>
              <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mt-3 mb-4">
                Celtic is Constrained by Its Own Governance Model
              </h2>
              <p className="text-csl-muted leading-[1.75] mb-4">
                Celtic FC is one of the world&apos;s most iconic clubs, yet its operating model
                is constrained by a governance structure that limits its ability to compete
                at the highest level. Without meaningful shareholder accountability,
                strategic decisions are made without the checks and transparency that
                supporters deserve.
              </p>
              <p className="text-csl-muted leading-[1.75] mb-6">
                CSL believes that organised, informed shareholder engagement is the
                legitimate and sustainable route to the governance improvements Celtic
                needs to grow.
              </p>

              <blockquote className="border-l-4 border-csl-gold bg-[#F8F6F1] px-6 py-5 rounded-r-xl mb-7">
                <p className="text-csl-dark leading-[1.75] font-medium text-[0.97rem]">
                  &ldquo;We are not a protest group. We are not about noise or division. We focus on governance, accountability and the long-term protection of the club.&rdquo;
                </p>
              </blockquote>

              <Link
                href="/membership"
                className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold bg-csl-dark text-csl-gold hover:bg-csl-mid transition-colors duration-200"
              >
                Be Part of the Change
              </Link>
              <p className="text-[0.82rem] text-csl-muted mt-4 italic">
                Duncan Smillie, Chairman, Celtic Supporters Limited
              </p>
            </div>

            <div className="bg-csl-light rounded-2xl p-8 lg:p-9">
              <span className="inline-block bg-white text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-4 border border-gray-200">
                Our Strategy
              </span>
              <h3 className="font-serif text-[1.4rem] font-extrabold text-csl-dark mb-2">
                Aggregate. Accumulate. Activate.
              </h3>
              <p className="text-[1.05rem] font-bold text-csl-mid mb-5">
                More members. More shares. More votes.
              </p>
              <div className="space-y-3 mb-7">
                {[
                  { word: "Aggregate", body: "voting power so supporters can act together with legitimacy and purpose." },
                  { word: "Accumulate", body: "share ownership and reconnect untraced shares back to their rightful owners." },
                  { word: "Activate", body: "supporters and shareholders who want a constructive, credible way to engage." },
                ].map(({ word, body }) => (
                  <p key={word} className="text-[0.9rem] text-csl-muted leading-[1.65]">
                    <span className="font-serif font-bold text-csl-dark">{word}</span> {body}
                  </p>
                ))}
              </div>
              <div className="border-t border-csl-dark/15 pt-6">
                <div className="font-mono text-[1.8rem] font-extrabold text-csl-dark leading-none tabular-nums">
                  {currentMembers.toLocaleString("en-GB")}
                </div>
                <div className="text-[0.8rem] text-csl-muted mt-1.5">
                  Members funding this strategy today &middot; target 5,000
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* VOICES */}
      <section className="bg-csl-dark text-white py-[72px]">
        <Container>
          <span className="inline-block border border-csl-gold/40 text-csl-gold text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-4">
            In Their Own Words
          </span>
          <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mb-10 max-w-[20ch]">
            Why the shareholder voice matters.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-white/10 rounded-xl overflow-hidden">
            <div className="bg-csl-dark p-9">
              <p className="font-serif text-[1.15rem] leading-[1.55] mb-5">
                &ldquo;As Celtic fans, we can be proud of ourselves and what we have achieved in our life, because what we have achieved has been achieved on our own merits.&rdquo;
              </p>
              <cite className="text-[0.75rem] font-semibold tracking-[0.1em] uppercase text-csl-gold not-italic">
                Fergus McCann
              </cite>
            </div>
            <div className="bg-csl-dark p-9">
              <p className="font-serif text-[1.15rem] leading-[1.55] mb-5">
                &ldquo;Without fans who pay at the turnstile, football is nothing. Sometimes we are inclined to forget that.&rdquo;
              </p>
              <cite className="text-[0.75rem] font-semibold tracking-[0.1em] uppercase text-csl-gold not-italic">
                Jock Stein
              </cite>
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <div className="bg-gradient-to-br from-csl-dark to-csl-mid text-white py-20">
        <Container className="text-center">
          <div className="inline-flex items-center gap-2 text-[0.8rem] font-semibold text-csl-gold bg-csl-gold/10 border border-csl-gold/30 px-3.5 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-csl-gold" />
            {currentMembers.toLocaleString("en-GB")} shareholders and counting
          </div>
          <h2 className="text-[clamp(1.6rem,3vw,2.4rem)] font-extrabold mb-4">
            Join the Movement for a Better-Governed Celtic
          </h2>
          <p className="text-[1.05rem] text-white/80 mb-9 max-w-[560px] mx-auto">
            For less than the price of a match-day programme each month, you can be part
            of a movement that gives Celtic fans a genuine voice in how their club is run.
          </p>
          <div className="flex flex-wrap gap-3.5 justify-center">
            <Link
              href="/membership"
              className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold bg-csl-gold text-gray-900 hover:brightness-105 transition-all duration-200 shadow-sm"
            >
              Join CSL Today
            </Link>
            <Link
              href="/share-tracing"
              className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold border border-white/40 text-white hover:bg-white/10 transition-colors duration-200"
            >
              Trace Your Shares
            </Link>
          </div>
        </Container>
      </div>
    </>
  );
}
