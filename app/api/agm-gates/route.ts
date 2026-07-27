import { NextResponse } from "next/server";
import { getAgmGates } from "@/lib/agm-gates";

/**
 * Public read of the two AGM launch gates.
 *
 * Exists so the client-side Nav can hide the "Sign Resolution" entry while the
 * flow is closed. The anon role has no SELECT policy on site_config, so the Nav
 * cannot read the gate directly, and reading it in the root layout instead
 * would opt the whole site out of static rendering (app/page.tsx uses ISR).
 *
 * Returns booleans only. Whether a public page is open is not sensitive.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const gates = await getAgmGates();

  return NextResponse.json(gates, {
    headers: { "Cache-Control": "no-store" },
  });
}
