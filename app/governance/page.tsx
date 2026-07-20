import { getSupabase } from "@/lib/supabase";
import GovernanceDashboard from "@/components/GovernanceDashboard";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Governance Dashboard | Celtic Supporters Limited",
  description:
    "CSL's 12-point governance accountability framework, tracking Celtic PLC's progress against each of our published demands.",
};

export type GovernanceCriterion = {
  id: number;
  tier: number;
  demand: string;
  status: "red" | "amber" | "green";
  commentary: string | null;
  last_reviewed: string;
  updated_by: string | null;
};

async function getCriteria(): Promise<GovernanceCriterion[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("governance_criteria")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("[governance] Supabase fetch error:", error.message);
    return [];
  }
  return (data ?? []) as GovernanceCriterion[];
}

export default async function GovernancePage() {
  const criteria = await getCriteria();
  return <GovernanceDashboard criteria={criteria} />;
}
