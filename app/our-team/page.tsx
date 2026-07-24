import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";

export const metadata: Metadata = {
  title: "Our Team | Celtic Supporters Limited",
  description: "Meet the current CSL board of directors.",
};

const directors = [
  {
    initials: "DS",
    name: "Duncan Smillie",
    role: "Chair",
    bio: "I am a Celtic supporter and longstanding season ticket holder, had a successful career in international business with PLC experience. Former co-owner of the Glasgow Rocks pro basketball franchise which was sold in 2020. Former director and chair of Partick Thistle FC and oversaw the transfer of a controlling interest to supporters.",
  },
  {
    initials: "DL",
    name: "David Low",
    role: "Director",
    bio: "I am an experienced businessman. I have been a Celtic shareholder and season ticket holder for many years. I have acted as a professional advisor to both Fergus McCann and Celtic plc and I am a former chair of The Celtic Trust.",
  },
  {
    initials: "PM",
    name: "Peter McGowan",
    role: "Director",
    bio: "I am also a longstanding Celtic supporter with a successful business career, I have recently exited my business after a private equity sale. I was heavily involved mobilising supporters in England in the lead up to the Fergus McCann takeover.",
  },
  {
    initials: "BM",
    name: "Brian McLaughlin",
    role: "Director",
    bio: "I have over 25 years of leadership experience in financial services, I bring a strategic insight and a deep commitment to ensuring supporters and small shareholders have a credible, professional voice in the future of Celtic Football Club.",
  },
];

export default function OurTeamPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-csl-dark to-csl-mid text-white py-[60px]">
        <div className="absolute -top-[60px] -right-[60px] w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <div className="absolute -bottom-[100px] left-[20%] w-[300px] h-[300px] bg-white/[0.03] rounded-full" />
        <Container className="relative z-10">
          <div className="max-w-[680px]">
            <div className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 px-3.5 py-1.5 rounded-full text-[0.82rem] font-medium text-white/85 mb-5">
              Leadership
            </div>
            <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.15] tracking-tight mb-5">
              Our Team
            </h1>
            <p className="text-[1.1rem] text-white/85 max-w-[540px] leading-[1.7]">
              CSL is run entirely by volunteers. Our board brings decades of business
              and governance leadership to hold that case to a professional standard.
            </p>
          </div>
        </Container>
      </section>

      {/* CREDIBILITY STRIP */}
      <section className="bg-csl-mid py-9">
        <Container>
          <div className="flex justify-center gap-16 flex-wrap">
            {[
              { number: "4", label: "Directors" },
              { number: "100%", label: "Volunteer-led" },
              { number: "0", label: "Salaries Paid" },
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
        </Container>
      </section>

      {/* DIRECTOR CARDS */}
      <section className="py-[72px]">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {directors.map(({ initials, name, role, bio }) => {
              const isChair = role === "Chair";
              return (
                <div
                  key={name}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all duration-200 ${
                    isChair ? "border-csl-gold/50" : "border-gray-200"
                  }`}
                >
                  <div className="bg-csl-dark px-7 py-5 flex items-center gap-4">
                    <div className="w-[52px] h-[52px] rounded-full bg-white/20 flex items-center justify-center font-extrabold text-white text-lg flex-shrink-0">
                      {initials}
                    </div>
                    <div>
                      <div className="text-white font-bold text-[1.05rem]">{name}</div>
                      <span
                        className={`inline-block text-[0.72rem] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider mt-1 ${
                          isChair ? "bg-csl-gold text-gray-900" : "bg-white/15 text-white/80"
                        }`}
                      >
                        {role}
                      </span>
                    </div>
                  </div>
                  <div className="px-7 py-6">
                    <p className="text-gray-600 leading-[1.7] text-[0.93rem]">{bio}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* GOVERNANCE TIE-IN */}
      <section className="bg-csl-light py-[72px]">
        <Container>
          <div className="max-w-[720px] mx-auto text-center">
            <h2 className="text-[clamp(1.4rem,2.5vw,1.9rem)] font-extrabold tracking-tight mb-4">
              Held to the Same Standard We Ask of Celtic&rsquo;s Board
            </h2>
            <p className="text-csl-muted leading-[1.75] mb-7">
              CSL&rsquo;s directors serve unpaid. Every decision is measured against the
              same 12-point governance framework CSL is asking Celtic plc to adopt.
            </p>
            <Link
              href="/governance"
              className="inline-flex items-center gap-2 text-csl-mid font-bold text-[0.97rem] hover:gap-3.5 transition-all duration-200 group"
            >
              View the Governance Framework
              <span className="transition-transform duration-200 group-hover:translate-x-1">&rarr;</span>
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
