import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Celtic Paradox | Celtic Supporters Limited",
  description:
    "A strategic review of Celtic PLC by Celtic Supporters Limited, built on Celtic plc's own audited accounts and public regulatory records.",
};

const downloads = [
  {
    title: "The Celtic Paradox - Strategic Review",
    description: "Strategic review of Celtic PLC (PDF)",
    url: "https://celticsupporters.net/wp-content/uploads/2026/05/Celtic_Paradox_Strategic_Review_v8.5.pdf",
    ext: "PDF",
  },
  {
    title: "The Celtic Paradox - Executive Summary",
    description: "An executive summary of the full document (PDF)",
    url: "https://celticsupporters.net/wp-content/uploads/2026/05/Celtic_Paradox_Executive_Summary_v8.5.pdf",
    ext: "PDF",
  },
  {
    title: "The Celtic Paradox - Cost of Inaction",
    description: "Why we need to act (Excel)",
    url: "https://celticsupporters.net/wp-content/uploads/2026/05/Celtic_Paradox_Cost_of_Inaction_Model.xlsx",
    ext: "XLSX",
  },
  {
    title: "Celtic v Rangers Benchmark",
    description: "Head-to-head governance and financial comparison (PDF)",
    url: "https://celticsupporters.net/wp-content/uploads/2026/05/Celtic_v_Rangers_Benchmark_Briefing_v2.pdf",
    ext: "PDF",
  },
];

export default function CelticParadoxPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-csl-dark to-csl-mid text-white px-[5%] py-[60px]">
        <div className="absolute -top-[60px] -right-[60px] w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <div className="absolute -bottom-[100px] left-[20%] w-[300px] h-[300px] bg-white/[0.03] rounded-full" />
        <div className="relative z-10 max-w-[680px]">
          <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.15] tracking-tight mb-5">
            The Celtic Paradox
          </h1>
          <p className="text-[1.1rem] text-white/85 max-w-[540px] leading-[1.7]">
            A strategic review of Celtic PLC
          </p>
        </div>
      </section>

      {/* INTRO */}
      <section className="px-[5%] py-[72px]">
        <div className="max-w-[800px] mx-auto">
          <p className="text-[1.05rem] text-gray-700 leading-[1.8]">
            Celtic Football Club is, on every measure that does not involve broadcast money, one of
            the largest football clubs in world football. It is also one of the lowest-earning clubs
            at its level of recognition, because it competes in one of the smallest broadcast markets
            in European football. The gap between what the brand is worth and what the business is
            allowed to earn is the Paradox. Celtic Supporters Limited publishes this paper as a
            shareholder case for a better-governed and more accountable Celtic plc board, built on
            Celtic plc&apos;s own audited accounts for the five years to 30 June 2025 and on public
            regulatory records.
          </p>
        </div>
      </section>

      {/* CALLOUTS */}
      <section className="bg-gray-50 px-[5%] py-[72px]">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <div className="inline-block bg-csl-light text-csl-dark text-[0.75rem] font-bold uppercase tracking-widest px-3 py-1 rounded mb-5">
                What this is
              </div>
              <p className="text-gray-600 leading-[1.7] text-[0.93rem]">
                A 65-page research paper that traces every figure to Celtic plc&apos;s audited
                accounts, to the published accounts of European peer clubs, and to public regulatory
                records. It is shareholder analysis, not regime change, not a takeover bid, and not
                investment advice.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <div className="inline-block bg-csl-light text-csl-dark text-[0.75rem] font-bold uppercase tracking-widest px-3 py-1 rounded mb-5">
                What it argues
              </div>
              <p className="text-gray-600 leading-[1.7] text-[0.93rem]">
                A global brand on a parochial income base, where the commercial gaps inside the
                broadcast cap are board choices, where the governance design enables those choices,
                and where an organised fan-shareholder body with the audited numbers can hold the
                board to a measurable accountability framework.
              </p>
            </div>

            <div className="bg-csl-dark rounded-2xl shadow-sm p-8 flex items-center">
              <p className="text-white/90 leading-[1.75] text-[0.95rem] font-medium">
                None of the framework requires regulatory change. None of it requires money. All of
                it is within the board&apos;s gift today.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DOWNLOADS */}
      <section className="px-[5%] py-[72px]">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-[52px]">
            <span className="inline-block bg-csl-light text-csl-dark text-[0.78rem] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
              Downloads
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-tight">
              Read the Research
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {downloads.map(({ title, description, url, ext }) => (
              <a
                key={title}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-7 flex items-start gap-5"
              >
                <div className="w-[48px] h-[48px] bg-csl-light rounded-xl flex items-center justify-center flex-shrink-0 text-csl-dark font-bold text-[0.72rem] tracking-wide">
                  {ext}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-gray-900 text-[0.97rem] mb-1 group-hover:text-csl-dark transition-colors duration-150">
                    {title}
                  </div>
                  <div className="text-gray-500 text-[0.85rem]">{description}</div>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400 group-hover:text-csl-dark flex-shrink-0 mt-0.5 transition-colors duration-150"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.75}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* LEGAL DISCLAIMER */}
      <section className="bg-gray-50 px-[5%] py-[48px]">
        <div className="max-w-[800px] mx-auto">
          <p className="text-gray-500 text-[0.82rem] leading-[1.75]">
            Celtic Supporters Limited (company number SC862186) is a company limited by guarantee
            registered in Scotland. CSL holds Celtic plc shares for its own account, as principal,
            not as agent for any member or third party, and continues to acquire them. This paper
            and the underlying analysis are shareholder analysis based on public information and on
            Celtic plc&apos;s audited accounts. They are not investment advice and are not an
            inducement to buy, sell or hold any security. CSL is not authorised or regulated by the
            Financial Conduct Authority.
          </p>
        </div>
      </section>
    </>
  );
}
