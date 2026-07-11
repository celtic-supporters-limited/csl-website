import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createServerSupabase, getSupabase } from "@/lib/supabase";
import { Container } from "@/components/Container";
import ResolutionForm from "./ResolutionForm";

export const metadata: Metadata = {
  title: "Support the CSL Resolution | Celtic Supporters Limited",
};

// Force dynamic — reads auth cookies and live signature counts
export const dynamic = "force-dynamic";

export default async function ResolutionPage() {
  // Auth guard — members only until made public
  const authClient = await createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    redirect("/login?redirectTo=/resolution");
  }

  // Fetch signature counts and resolution target
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
    <main className="bg-csl-light min-h-screen">
      {/* Hero */}
      <section className="bg-csl-dark text-white py-14">
        <Container>
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-4 leading-tight">
            Support the CSL Resolution
          </h1>
          <p className="text-white/80 max-w-2xl text-base sm:text-lg leading-relaxed">
            Celtic Supporters Limited is requisitioning a resolution at the next Celtic plc Annual General Meeting. We need signatures from Celtic shareholders and supporters to demonstrate the breadth of backing for shareholder accountability. Add your name below to support this initiative.
          </p>
        </Container>
      </section>

      {/* Signature counter */}
      <section className="bg-white border-b border-gray-200 py-8">
        <Container>
          <div className="max-w-xl">
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
              Total signatures (all supporters): <span className="font-semibold text-gray-700">{totalCount.toLocaleString("en-GB")}</span>
            </p>
          </div>
        </Container>
      </section>

      {/* Form */}
      <section className="py-12">
        <Container>
          <Suspense fallback={null}>
            <ResolutionForm />
          </Suspense>
        </Container>
      </section>
    </main>
  );
}
