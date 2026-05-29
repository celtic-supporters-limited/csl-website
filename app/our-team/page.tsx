import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Our Team | Celtic Supporters Limited",
  description: "Meet the current CSL board of directors.",
};

const directors = [
  {
    initials: "DS",
    name: "Duncan Smillie",
    role: "Chair",
    bio: "I am a Celtic supporter and season ticket holder of longstanding, had a successful career in international business with PLC experience. Former co-owner of the Glasgow Rocks pro basketball franchise which was sold in 2020. Former director and chair of Partick Thistle FC and oversaw the transfer of a controlling interest to supporters.",
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
      <section className="relative overflow-hidden bg-gradient-to-br from-csl-dark to-csl-mid text-white px-[5%] py-[60px]">
        <div className="absolute -top-[60px] -right-[60px] w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <div className="absolute -bottom-[100px] left-[20%] w-[300px] h-[300px] bg-white/[0.03] rounded-full" />
        <div className="relative z-10 max-w-[680px]">
          <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.15] tracking-tight mb-5">
            Our Team
          </h1>
          <p className="text-[1.1rem] text-white/85 max-w-[540px] leading-[1.7]">
            Current CSL Board
          </p>
        </div>
      </section>

      {/* DIRECTOR CARDS */}
      <section className="px-[5%] py-[72px]">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {directors.map(({ initials, name, role, bio }) => (
              <div
                key={name}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
              >
                <div className="bg-csl-dark px-7 py-5 flex items-center gap-4">
                  <div className="w-[52px] h-[52px] rounded-full bg-white/20 flex items-center justify-center font-extrabold text-white text-lg flex-shrink-0">
                    {initials}
                  </div>
                  <div>
                    <div className="text-white font-bold text-[1.05rem]">{name}</div>
                    <div className="text-white/70 text-[0.88rem]">{role}</div>
                  </div>
                </div>
                <div className="px-7 py-6">
                  <p className="text-gray-600 leading-[1.7] text-[0.93rem]">{bio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
