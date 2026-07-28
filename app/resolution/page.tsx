import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { getConfigList, isGateOpen } from "@/lib/site-gates";
import { Container } from "@/components/Container";
import ResolutionForm from "./ResolutionForm";

export const metadata: Metadata = {
  title: "Support the CSL Resolution | Celtic Supporters Limited",
};

// Reads the launch gate, the current resolution version and the live counts.
export const dynamic = "force-dynamic";

export default async function ResolutionPage() {
  const supabase = getSupabase();

  const [signingOpen, signaturesRes, configRes, versionRes, platforms, years, bands] =
    await Promise.all([
      isGateOpen("resolution_open"),
      supabase.from("agm_signatures").select("shareholder_tag, capture_status"),
      supabase.from("site_config").select("key, value").in("key", ["resolution_target"]),
      supabase
        .from("agm_resolution_versions")
        .select("id, is_placeholder")
        .eq("is_current", true)
        .maybeSingle(),
      getConfigList("agm_nominee_platforms"),
      getConfigList("agm_year_options"),
      getConfigList("agm_share_bands"),
    ]);

  const signatures = signaturesRes.data ?? [];
  const config = configRes.data ?? [];

  const configMap = Object.fromEntries(config.map((r) => [r.key, r.value]));
  const resolutionTarget = parseInt(configMap["resolution_target"] ?? "100", 10);

  // Counting logic unchanged: only direct registered holders count toward the
  // 100. Rows preserved from the pre-rebuild schema are excluded, because they
  // were collected without a resolution version and cannot be relied on.
  const directCount = signatures.filter(
    (s) => s.shareholder_tag === "direct-registered" && s.capture_status === "complete"
  ).length;
  const totalCount = signatures.filter((s) => s.capture_status === "complete").length;
  const progressPct = Math.min(100, Math.round((directCount / resolutionTarget) * 100));

  // While the current version is the placeholder there is no resolution to
  // support, so the form is not offered. The API enforces the same rule.
  const awaitingWording = !versionRes.data || versionRes.data.is_placeholder === true;
  const canSign = signingOpen && !awaitingWording;

  return (
    <>
      <main>
        {/* Hero */}
        <section className="bg-csl-dark text-white py-16 lg:py-20">
          <Container>
            <h1 className="font-serif text-4xl lg:text-5xl font-bold mb-4">
              Support the CSL Resolution
            </h1>
            <p className="text-white/80 text-lg max-w-2xl leading-relaxed">
              Celtic Supporters Limited is requisitioning a resolution at the next Celtic plc Annual
              General Meeting. To support it you must hold shares in Celtic plc, as a registered
              holder or through a nominee platform.
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
                  <h2 className="text-base font-bold text-gray-900 mb-3">Who can sign</h2>
                  <p className="text-gray-600 text-sm leading-relaxed mb-3">
                    Only Celtic plc shareholders can support the requisition. You do not need to be a
                    CSL member.
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
                        <strong className="text-gray-800">Not a shareholder?</strong> You cannot sign
                        the requisition, but you can register your support and join CSL.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Signature counter — only while signing is live */}
              {canSign && (
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
                    Total signatures (all shareholders):{" "}
                    <span className="font-semibold text-gray-700">
                      {totalCount.toLocaleString("en-GB")}
                    </span>
                  </p>
                </div>
              )}

              {canSign ? (
                <Suspense fallback={null}>
                  <ResolutionForm
                    nomineePlatforms={platforms}
                    yearOptions={years}
                    shareBands={bands}
                  />
                </Suspense>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-[560px] mx-auto text-center">
                  <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1 rounded-full text-[0.78rem] font-semibold mb-4">
                    Signing not open yet
                  </span>
                  <h2 className="text-xl font-bold text-csl-dark mb-3">
                    This page will open for signature shortly
                  </h2>
                  <p className="text-gray-600 text-sm leading-relaxed mb-6">
                    The resolution wording is with our solicitor. Signing opens as soon as it is
                    confirmed. If you are a Celtic plc shareholder and want to know the moment it
                    does, join CSL or contact us at{" "}
                    <a href="mailto:info@celticsupporters.net" className="text-csl-dark underline">
                      info@celticsupporters.net
                    </a>
                    .
                  </p>
                  <Link
                    href="/membership"
                    className="inline-flex items-center px-7 py-3 rounded-lg text-[0.92rem] font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200"
                  >
                    Join CSL
                  </Link>
                </div>
              )}

            </div>
          </Container>
        </section>
      </main>
    </>
  );
}
