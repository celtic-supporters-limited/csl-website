import Link from "next/link";

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-csl-dark to-csl-mid text-white px-[5%] py-[90px] pb-20">
        <div className="absolute -top-[60px] -right-[60px] w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <div className="absolute -bottom-[100px] left-[20%] w-[300px] h-[300px] bg-white/[0.03] rounded-full" />
        <div className="relative z-10 max-w-[680px]">
          <div className="inline-flex items-center gap-1.5 bg-white/15 border border-white/25 px-3.5 py-1.5 rounded-full text-[0.82rem] font-medium text-white/90 mb-5 backdrop-blur-sm">
            Governance-Led Change at Celtic FC
          </div>
          <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.15] tracking-tight mb-5">
            Your Voice. Your Club.<br />Your Celtic.
          </h1>
          <p className="text-[1.1rem] text-white/85 mb-9 max-w-[540px] leading-[1.7]">
            Celtic Supporters Limited is a shareholder-led organisation committed to
            responsible ownership, transparent governance, and a Celtic FC that works
            for everyone who loves the club.
          </p>
          <div className="flex flex-wrap gap-3.5">
            <Link
              href="/membership"
              className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold bg-white text-csl-dark hover:bg-csl-light transition-colors duration-200"
            >
              Join from &pound;10/month
            </Link>
            <Link
              href="/share-tracing"
              className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold border border-white/50 text-white hover:bg-white/10 transition-colors duration-200"
            >
              Trace Your Shares
            </Link>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <div className="bg-white border-b border-gray-200 shadow-sm px-[5%] py-7">
        <div className="max-w-[1100px] mx-auto flex justify-center gap-12 flex-wrap">
          {[
            { number: "484+", label: "Active Members" },
            { number: "37,000", label: "Shareholders to Reach" },
            { number: "128", label: "Engagement Cases Open" },
            { number: "5,000", label: "Membership Target" },
          ].map(({ number, label }) => (
            <div key={label} className="text-center">
              <div className="text-[2rem] font-extrabold text-csl-dark leading-none">
                {number}
              </div>
              <div className="text-[0.8rem] text-gray-500 mt-1 uppercase tracking-wider font-medium">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SERVICES */}
      <section className="px-[5%] py-[72px]">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              What We Do
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mb-3.5">
              Three Ways CSL Drives Change
            </h2>
            <p className="text-[1.05rem] text-gray-500 max-w-[600px] mx-auto">
              We work on behalf of Celtic shareholders and supporters to bring about
              genuine governance reform at Celtic FC.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: "🔍",
                title: "Share Tracing",
                body: "Thousands of Celtic shares are untraceable - certificates lost, estates unsettled, addresses changed. We help shareholders reunite with their shares and decide what to do with them.",
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
                body: "Join thousands of supporters funding CSL's work. Monthly, annual, or lifetime membership. Your subscription directly funds share acquisition and our governance campaign.",
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
                <p className="text-[0.92rem] text-gray-500 leading-[1.65]">{body}</p>
                <Link
                  href={link}
                  className="inline-flex items-center gap-1.5 mt-5 text-[0.88rem] font-semibold text-csl-dark hover:gap-2.5 transition-all duration-200"
                >
                  {cta} &rarr;
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW WE WORK */}
      <section className="bg-gray-50 px-[5%] py-[72px]">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              Our Approach
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mb-3.5">
              Shareholder Influence Through Collective Action
            </h2>
            <p className="text-[1.05rem] text-gray-500 max-w-[600px] mx-auto">
              Celtic PLC has over 37,000 registered shareholders. CSL coordinates their
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
                <p className="text-[0.88rem] text-gray-500">{body}</p>
                {i < arr.length - 1 && (
                  <span className="hidden lg:block absolute right-[-12px] top-1/2 -translate-y-1/2 text-csl-dark text-[1.4rem] font-bold">
                    &rarr;
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY IT MATTERS */}
      <section className="px-[5%] py-[72px]">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-[60px] items-center">
          <div>
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              Why Now
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight mt-3 mb-4">
              Celtic is Constrained by Its Own Governance Model
            </h2>
            <p className="text-gray-500 leading-[1.75] mb-4">
              Celtic FC is one of the world&apos;s most iconic clubs, yet its operating model
              is constrained by a governance structure that limits its ability to compete
              at the highest level. Without meaningful shareholder accountability,
              strategic decisions are made without the checks and transparency that
              supporters deserve.
            </p>
            <p className="text-gray-500 leading-[1.75] mb-7">
              CSL believes that organised, informed shareholder engagement is the
              legitimate and sustainable route to the governance improvements Celtic
              needs to grow.
            </p>
            <Link
              href="/membership"
              className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200"
            >
              Be Part of the Change
            </Link>
          </div>

          <div className="bg-csl-light rounded-2xl p-10">
            <h3 className="text-[1.1rem] font-bold mb-5 text-csl-dark">
              Membership Growth
            </h3>
            {[
              { month: "March 2026", count: "398 active", pct: "80%" },
              { month: "April 2026", count: "444 active", pct: "88%" },
              { month: "May 2026", count: "484 active", pct: "97%" },
            ].map(({ month, count, pct }) => (
              <div key={month} className="mb-4">
                <div className="flex justify-between text-[0.85rem] mb-1.5">
                  <span>{month}</span>
                  <span className="font-bold">{count}</span>
                </div>
                <div className="bg-csl-dark/15 rounded-md h-2.5">
                  <div
                    className="bg-csl-dark h-full rounded-md"
                    style={{ width: pct }}
                  />
                </div>
              </div>
            ))}
            <div className="mt-6 pt-5 border-t border-csl-dark/20">
              <div className="text-[0.85rem] text-csl-dark font-semibold mb-1">
                Target: 5,000 Members
              </div>
              <div className="text-[0.8rem] text-gray-500">
                Help us get there - every subscription funds share acquisition.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="bg-gradient-to-br from-csl-dark to-csl-mid text-white text-center px-[5%] py-20">
        <h2 className="text-[clamp(1.6rem,3vw,2.4rem)] font-extrabold mb-4">
          Join 484 Supporters Already Making a Difference
        </h2>
        <p className="text-[1.05rem] text-white/85 mb-9 max-w-[560px] mx-auto">
          For less than the price of a match-day programme each month, you can be part
          of a movement that gives Celtic fans a genuine voice in how their club is run.
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center">
          <Link
            href="/membership"
            className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold bg-white text-csl-dark hover:bg-csl-light transition-colors duration-200"
          >
            Join CSL Today
          </Link>
          <Link
            href="/share-tracing"
            className="inline-flex items-center px-8 py-3.5 rounded-[10px] text-base font-semibold border border-white/50 text-white hover:bg-white/10 transition-colors duration-200"
          >
            Trace Your Shares
          </Link>
        </div>
      </div>
    </>
  );
}
