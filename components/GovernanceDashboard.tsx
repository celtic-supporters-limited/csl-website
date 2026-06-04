import Link from "next/link";
import { Container } from "@/components/Container";
import type { GovernanceCriterion } from "@/app/governance/page";

type Props = {
  criteria: GovernanceCriterion[];
};

const TIER_META: Record<number, { label: string; descriptor: string }> = {
  1: { label: "Tier 1 - Immediate Actions",    descriptor: "Achievable within 12 months, zero cost" },
  2: { label: "Tier 2 - Medium-term Actions",  descriptor: "12-24 months, modest cost" },
  3: { label: "Tier 3 - Structural Changes",   descriptor: "24-36 months, sustained pressure" },
};

const STATUS_META: Record<"red" | "amber" | "green", { label: string; className: string }> = {
  red:   { label: "Not Met", className: "bg-red-100 text-red-800" },
  amber: { label: "Partial", className: "bg-amber-100 text-amber-800" },
  green: { label: "Met",     className: "bg-green-100 text-green-800" },
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function GovernanceDashboard({ criteria }: Props) {
  const latestReview = criteria.reduce(
    (latest, c) => (c.last_reviewed > latest ? c.last_reviewed : latest),
    criteria[0]?.last_reviewed ?? ""
  );

  const counts = {
    green: criteria.filter((c) => c.status === "green").length,
    amber: criteria.filter((c) => c.status === "amber").length,
    red:   criteria.filter((c) => c.status === "red").length,
  };

  return (
    <>
      {/* HERO */}
      <section className="bg-csl-dark text-white">
        <Container className="py-16 md:py-20">
          <p className="text-csl-gold text-sm font-semibold uppercase tracking-widest mb-3">
            Accountability Framework
          </p>
          <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-4 max-w-3xl">
            The Celtic Paradox Accountability Framework
          </h1>
          <p className="text-white/80 text-lg md:text-xl max-w-2xl mb-6">
            CSL&apos;s 12 governance demands to the Celtic PLC board, and where the board stands today.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            {latestReview && (
              <span className="text-white/60 text-sm">
                Last reviewed: {formatDate(latestReview)}
              </span>
            )}
            <a
              href="#explainer"
              className="text-csl-gold text-sm font-medium hover:underline"
            >
              What is this? &darr;
            </a>
          </div>
        </Container>
      </section>

      {/* SUMMARY SCORE BAR */}
      <section className="bg-white border-b border-gray-200">
        <Container className="py-5">
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              Overall Score
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 text-green-800 text-sm font-semibold">
                <span className="font-bold tabular-nums">{counts.green}</span> Met
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-sm font-semibold">
                <span className="font-bold tabular-nums">{counts.amber}</span> Partial
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 text-red-800 text-sm font-semibold">
                <span className="font-bold tabular-nums">{counts.red}</span> Not Met
              </span>
            </div>
            <span className="text-gray-400 text-sm">out of 12 demands</span>
          </div>
        </Container>
      </section>

      {/* TIER SECTIONS */}
      <section className="bg-csl-light">
        <Container className="py-14">
          <div className="space-y-14">
            {[1, 2, 3].map((tier) => {
              const meta = TIER_META[tier];
              const tierCriteria = criteria.filter((c) => c.tier === tier);
              return (
                <div key={tier}>
                  <div className="mb-6 pb-3 border-b border-gray-300">
                    <h2 className="text-csl-dark font-bold text-base uppercase tracking-wider mb-0.5">
                      {meta.label}
                    </h2>
                    <p className="text-gray-500 text-sm">{meta.descriptor}</p>
                  </div>
                  <div className="space-y-3">
                    {tierCriteria.map((criterion) => {
                      const statusMeta = STATUS_META[criterion.status];
                      return (
                        <div
                          key={criterion.id}
                          className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-csl-dark text-white text-xs font-bold flex items-center justify-center mt-0.5">
                                  {criterion.id}
                                </span>
                                <p className="text-gray-900 font-medium text-[0.93rem] leading-snug">
                                  {criterion.demand}
                                </p>
                              </div>
                              {criterion.commentary && (
                                <p className="mt-3 ml-10 text-gray-500 text-sm italic leading-relaxed">
                                  {criterion.commentary}
                                </p>
                              )}
                              <p className="mt-2 ml-10 text-gray-400 text-xs">
                                Last reviewed: {formatDate(criterion.last_reviewed)}
                              </p>
                            </div>
                            <div className="sm:ml-3 flex-shrink-0 ml-10 sm:ml-0">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusMeta.className}`}
                              >
                                {statusMeta.label}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* EXPLAINER */}
      <section id="explainer" className="bg-white border-t border-gray-200 scroll-mt-14">
        <Container className="py-14">
          <div className="max-w-3xl">
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-csl-dark mb-6">
              About this framework
            </h2>
            <div className="space-y-4 text-gray-600 leading-relaxed text-[0.95rem]">
              <p>
                This framework is drawn from Chapter 13 of The Celtic Paradox, a strategic review
                of Celtic PLC published by Celtic Supporters Limited in May 2026.{" "}
                <Link href="/celtic-paradox" className="text-csl-mid font-medium hover:underline">
                  View the research page
                </Link>{" "}
                or{" "}
                {/* TODO: Replace with real Google Drive PDF URL when hosted */}
                <span className="text-gray-400 cursor-not-allowed" title="PDF link coming soon">
                  download the full paper (coming soon)
                </span>
                .
              </p>
              <p>
                CSL reviews and updates each criterion on a quarterly basis. Where Celtic PLC takes
                a measurable step toward a demand, the status is updated to Amber. Where CSL is
                satisfied the demand has been met in full, the status moves to Green.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* CTA FOOTER */}
      <section className="bg-csl-dark text-white">
        <Container className="py-14 text-center">
          <h2 className="font-serif text-2xl md:text-3xl font-bold mb-3">
            Help us hold Celtic PLC accountable
          </h2>
          <p className="text-white/70 mb-8 max-w-xl mx-auto text-[0.95rem] leading-relaxed">
            CSL represents Celtic shareholders and supporters. Join us or assign your proxy
            vote to strengthen our mandate at the AGM.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/membership"
              className="inline-flex items-center justify-center px-7 py-3 rounded-lg font-semibold bg-csl-gold text-csl-dark hover:brightness-105 transition-all duration-200"
            >
              Become a Member
            </Link>
            <Link
              href="/proxy"
              className="inline-flex items-center justify-center px-7 py-3 rounded-lg font-semibold border-2 border-white text-white hover:bg-csl-mid transition-colors duration-200"
            >
              Assign Your Proxy
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
