import Link from "next/link";
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
        <div className="absolute -top-[60px] -right-[60px] w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <div className="absolute -bottom-[100px] left-[20%] w-[300px] h-[300px] bg-white/[0.03] rounded-full" />
        <Container className="relative z-10">
          <div className="max-w-[680px]">
            <div className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 px-3.5 py-1.5 rounded-full text-[0.82rem] font-medium text-white/85 mb-5">
              Governance-Led Change at Celtic FC
            </div>
            <h1 className="text-[clamp(2rem,4vw,3.4rem)] font-extrabold leading-[1.12] tracking-tight mb-5">
              Own Your Club.<br />Shape Its Future.
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
        </Container>
      </section>

      {/* MEMBERSHIP PROGRESS + FINANCIAL TRANSPARENCY */}
      <section className="bg-csl-dark border-t border-white/10 py-10">
        <Container>
          {/* Progress bar */}
          <div className="mb-9 pb-9 border-b border-white/10">
            <div className="flex flex-col sm:flex-row items-center gap-5 py-5">
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-2.5">
                  <span className="text-white/85 text-[0.9rem]">
                    {currentMembers} members and growing. Help us reach 5,000.
                  </span>
                  <span className="text-gray-300 font-medium text-[0.85rem] tabular-nums ml-4 flex-shrink-0">
                    {currentMembers.toLocaleString()} / {MEMBER_TARGET.toLocaleString()}
                  </span>
                </div>
                <div className="bg-white/10 rounded-full h-2.5 w-full overflow-hidden">
                  <div
                    className="bg-csl-gold h-full rounded-full transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
              <Link
                href="/membership"
                className="flex-shrink-0 inline-flex items-center px-6 py-2.5 rounded-lg text-[0.88rem] font-semibold bg-csl-gold text-gray-900 hover:brightness-105 transition-all duration-200"
              >
                Become a Member
              </Link>
            </div>
          </div>

          {/* Financial transparency stats */}
          <div className="w-full flex justify-center gap-16 flex-wrap">
            {[
              { number: currentMembers.toLocaleString("en-GB"), label: "Members" },
              { number: "15,000", label: "Shares Held" },
            ].map(({ number, label }) => (
              <div key={label} className="text-center">
                <div className="text-[2rem] font-extrabold text-csl-gold leading-none">
                  {number}
                </div>
                <div className="text-[0.78rem] text-white/55 mt-1.5 uppercase tracking-widest font-medium">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* SERVICES */}
      <section className="py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
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
                icon: "🔍",
                title: "Share Tracing",
                body: "Thousands of Celtic shares are untraceable: certificates lost, estates unsettled, addresses changed. We help shareholders find their holding and decide what to do with it.",
                link: "/share-tracing",
                cta: "Start Tracing",
              },
              {
                icon: "🗳️",
                title: "Proxy Assignment",
                body: "If you hold Celtic shares but cannot attend the AGM, assigning your proxy vote to CSL amplifies our collective voice on governance matters that affect every fan and shareholder.",
                link: "/proxy",
                cta: "Assign Your Proxy",
              },
              {
                icon: "☘",
                title: "CSL Membership",
                body: "Join supporters funding CSL's work. Monthly, annual, or lifetime membership. Your subscription directly funds share acquisition and our governance campaign.",
                link: "/membership",
                cta: "Join from £10/month",
              },
            ].map(({ icon, title, body, link, cta }) => (
              <div
                key={title}
                className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
              >
                <div className="w-[52px] h-[52px] bg-csl-light rounded-xl flex items-center justify-center text-2xl mb-5">
                  {icon}
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
      <section className="bg-csl-light py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-white text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3 border border-gray-200">
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
      <section className="bg-csl-dark text-white py-[72px]">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-center">
            <div className="lg:col-span-3">
              <span className="inline-block border border-csl-gold/40 text-csl-gold text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-5">
                New Research
              </span>
              <h2 className="text-[clamp(1.6rem,3vw,2.4rem)] font-extrabold tracking-tight mb-5">
                The Celtic Paradox
              </h2>
              <p className="text-white/80 text-[1.05rem] leading-[1.8] mb-7 max-w-[520px]">
                65 pages of shareholder analysis built on Celtic PLC&apos;s own audited accounts
                and public regulatory records. A governance case for a better-run Celtic.
                Not a takeover bid. Not regime change.
              </p>
              <Link
                href="/celtic-paradox"
                className="inline-flex items-center gap-2 text-csl-gold font-semibold text-[0.97rem] hover:gap-3.5 transition-all duration-200 group"
              >
                Read the Research
                <span className="transition-transform duration-200 group-hover:translate-x-1">&rarr;</span>
              </Link>
            </div>

            <div className="lg:col-span-2 grid grid-cols-1 gap-3">
              {[
                { num: "65",  label: "Pages of Analysis" },
                { num: "5",   label: "Financial Years Reviewed" },
                { num: "4",   label: "Downloads Available" },
              ].map(({ num, label }) => (
                <div
                  key={label}
                  className="bg-white/5 border border-white/10 rounded-xl px-6 py-4 flex items-center gap-5"
                >
                  <div className="text-csl-gold font-extrabold text-[1.9rem] leading-none w-14 flex-shrink-0">
                    {num}
                  </div>
                  <div className="text-white/70 text-[0.9rem]">{label}</div>
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

            <div className="bg-csl-light rounded-2xl p-10">
              <h3 className="text-[1.1rem] font-bold mb-5 text-csl-dark">
                Membership Growth
              </h3>
              {(() => {
                const currentMonthLabel = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
                const maxMembers = Math.max(currentMembers, 484);
                const historicalRows = [
                  { month: "March 2026", members: 398 },
                  { month: "April 2026", members: 444 },
                  { month: "May 2026",   members: 484 },
                ];
                const rows = [
                  ...historicalRows,
                  ...(currentMonthLabel !== "May 2026" ? [{ month: currentMonthLabel, members: currentMembers }] : []),
                ];
                return rows.map(({ month, members }) => (
                  <div key={month} className="mb-4">
                    <div className="flex justify-between text-[0.85rem] mb-1.5">
                      <span>{month}</span>
                      <span className="font-bold">{members.toLocaleString("en-GB")} active</span>
                    </div>
                    <div className="bg-csl-dark/10 rounded-md h-2.5">
                      <div
                        className="bg-csl-dark h-full rounded-md"
                        style={{ width: `${Math.round((members / maxMembers) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
              <div className="mt-6 pt-5 border-t border-csl-dark/15">
                <div className="text-[0.85rem] text-csl-dark font-semibold mb-1">
                  Target: 5,000 Members
                </div>
                <div className="text-[0.8rem] text-csl-muted">
                  Help us get there. Every subscription funds share acquisition.
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* FERGUS McCANN QUOTE */}
      <section className="bg-csl-dark text-white py-[72px]">
        <Container>
          <blockquote className="max-w-[760px] mx-auto text-center">
            <p className="font-serif text-[clamp(1.25rem,2.5vw,1.85rem)] leading-[1.6] italic mb-7 text-white">
              &ldquo;As Celtic fans, we can be proud of ourselves and what we have achieved in our life, because what we have achieved has been achieved on our own merits&rdquo;
            </p>
            <cite className="text-[0.8rem] font-semibold tracking-[0.12em] text-white/55 uppercase not-italic">
              Fergus McCann
            </cite>
          </blockquote>
        </Container>
      </section>

      {/* AGGREGATE. ACCUMULATE. ACTIVATE. */}
      <section className="py-[72px] bg-csl-light">
        <Container>
          <div className="max-w-[800px] mx-auto">
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mb-10 text-center">
              Aggregate. Accumulate. Activate.
            </h2>
            <ul className="space-y-4 list-none">
              {[
                {
                  word: "Aggregate",
                  body: "voting power so supporters can act together with legitimacy and purpose.",
                },
                {
                  word: "Accumulate",
                  body: "share ownership and reconnect untraced shares back to their rightful owners.",
                },
                {
                  word: "Activate",
                  body: "supporters and shareholders who care deeply about Celtic but want a constructive, credible way to engage.",
                },
              ].map(({ word, body }) => (
                <li
                  key={word}
                  className="flex gap-6 items-start bg-white rounded-2xl px-8 py-6 border border-gray-200 shadow-sm"
                >
                  <span className="flex-shrink-0 font-serif font-extrabold text-[1.05rem] text-csl-dark w-[120px] pt-0.5">
                    {word}
                  </span>
                  <p className="text-[0.95rem] text-csl-muted leading-[1.7]">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      {/* JOCK STEIN QUOTE */}
      <section className="bg-csl-dark text-white py-[72px]">
        <Container>
          <blockquote className="max-w-[760px] mx-auto text-center">
            <p className="font-serif text-[clamp(1.25rem,2.5vw,1.85rem)] leading-[1.6] italic mb-7 text-white">
              &ldquo;Without fans who pay at the turnstile, football is nothing. Sometimes we are inclined to forget that.&rdquo;
            </p>
            <cite className="text-[0.8rem] font-semibold tracking-[0.12em] text-white/55 uppercase not-italic">
              Jock Stein
            </cite>
          </blockquote>
        </Container>
      </section>

      {/* LATEST UPDATES */}
      <section className="py-[72px]">
        <Container>
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              News
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight">
              Latest Updates
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: `CSL Reaches ${currentMembers.toLocaleString("en-GB")} Members`,
                date: "June 2026",
                summary: "Membership continues to grow as awareness of CSL's governance mission spreads.",
                href: "#",
              },
              {
                title: "14th Members Meeting - Minutes Published",
                date: "April 2026",
                summary: "Read the latest minutes from our members meeting in the Members Library.",
                href: "#",
              },
              {
                title: "The Celtic Paradox - Read Our Case for Change",
                date: "March 2026",
                summary: "Our flagship paper on Celtic's governance constraints is now publicly available.",
                href: "/celtic-paradox",
              },
            ].map(({ title, date, summary, href }) => (
              <Link
                key={title}
                href={href}
                className="block bg-white rounded-2xl p-7 border border-gray-200 shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-200 group"
              >
                <div className="text-[0.78rem] text-csl-muted uppercase tracking-wider mb-2.5">{date}</div>
                <h3 className="font-bold text-[1.02rem] mb-2.5 group-hover:text-csl-dark transition-colors duration-150">
                  {title}
                </h3>
                <p className="text-[0.88rem] text-csl-muted leading-[1.65]">{summary}</p>
                <span className="inline-flex items-center gap-1 mt-5 text-[0.85rem] font-semibold text-csl-dark group-hover:gap-2 transition-all duration-200">
                  Read more &rarr;
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA */}
      <div className="bg-gradient-to-br from-csl-dark to-csl-mid text-white py-20">
        <Container className="text-center">
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
