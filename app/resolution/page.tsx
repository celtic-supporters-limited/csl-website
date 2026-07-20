import type { Metadata } from "next";
import { Suspense } from "react";
import { getSupabase } from "@/lib/supabase";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { Container } from "@/components/Container";
import ResolutionForm from "./ResolutionForm";

export const metadata: Metadata = {
  title: "Support the CSL Resolution | Celtic Supporters Limited",
};

// Force dynamic — reads live signature counts
export const dynamic = "force-dynamic";

export default async function ResolutionPage() {
  const supabase = getSupabase();

  const [signaturesRes, configRes] = await Promise.all([
    supabase.from("agm_signatures").select("shareholder_tag"),
    supabase.from("site_config").select("key, value").in("key", ["resolution_target"]),
  ]);

  const signatures = signaturesRes.data ?? [];
  const config = configRes.data ?? [];

  const configMap = Object.fromEntries(config.map((r) => [r.key, r.value]));
  const resolutionTarget = parseInt(configMap["resolution_target"] ?? "100", 10);

  const directCount = signatures.filter((s) => s.shareholder_tag === "direct-registered").length;
  const totalCount = signatures.length;
  const progressPct = Math.min(100, Math.round((directCount / resolutionTarget) * 100));

  return (
    <>
      <Nav />
      <main>
        {/* Hero */}
        <section className="bg-csl-dark text-white py-16 lg:py-20">
          <Container>
            <h1 className="font-serif text-4xl lg:text-5xl font-bold mb-4">
              Support the CSL Resolution
            </h1>
            <p className="text-white/80 text-lg max-w-2xl leading-relaxed">
              Celtic Supporters Limited is requisitioning a resolution at the next Celtic plc Annual
              General Meeting. Add your name and tell us whether you hold Celtic shares. You do not
              need to be a CSL member to sign.
            </p>
          </Container>
        </section>

        <section className="bg-gray-50 py-12 lg:py-16">
          <Container>
            <div className="max-w-4xl mx-auto space-y-8">

              {/* Explainer cards */}
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-base font-bold text-gray-900 mb-3">What this is</h2>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    CSL is putting a formal resolution to Celtic plc shareholders at the next Annual
                    General Meeting. To lodge it, we need to show shareholder backing in writing. We
                    are collecting signatures now so we can submit by the deadline.
                  </p>
                  <p className="text-gray-600 text-sm leading-relaxed mt-3">
                    Signatures must be with Celtic by early October. We are going to members first,
                    then opening wider through August and September.
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-base font-bold text-gray-900 mb-3">Who should sign</h2>
                  <p className="text-gray-600 text-sm leading-relaxed mb-3">
                    Sign whether or not you hold Celtic shares. All signatures help the campaign;
                    shareholder type determines what counts toward the legal threshold.
                  </p>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start gap-2">
                      <span className="text-csl-dark font-bold shrink-0 mt-0.5">&#10003;</span>
                      <span>
                        <strong className="text-gray-800">Direct registered shareholders</strong> -
                        named on the Celtic share register via Computershare. Count toward the legal
                        threshold.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 font-bold shrink-0 mt-0.5">&#10003;</span>
                      <span>
                        <strong className="text-gray-800">Nominee and platform holders</strong> -
                        shares held through a broker, ISA, SIPP or platform. Strengthen the campaign
                        but do not count toward the threshold.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 font-bold shrink-0 mt-0.5">&#10003;</span>
                      <span>
                        <strong className="text-gray-800">Non-shareholders</strong> - your signature
                        counts for the campaign, though not toward the legal requisition threshold.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Signature counter */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">
                    Direct registered shareholder signatures
                  </p>
                  <span className="text-sm font-bold text-csl-dark tabular-nums">
                    {directCount.toLocaleString("en-GB")} of {resolutionTarget.toLocaleString("en-GB")}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-csl-dark h-3 rounded-full transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="text-[0.8rem] text-gray-500 mt-2">
                  Total signatures (all supporters):{" "}
                  <span className="font-semibold text-gray-700">
                    {totalCount.toLocaleString("en-GB")}
                  </span>
                </p>
              </div>

              {/* Form */}
              <Suspense fallback={null}>
                <ResolutionForm />
              </Suspense>

            </div>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
