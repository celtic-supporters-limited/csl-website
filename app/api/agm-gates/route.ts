import { NextResponse } from "next/server";
import { getAgmGates } from "@/lib/site-gates";

/**
 * Public read of the two AGM launch gates.
 *
 * No longer consumed by the UI. It was built so the client-side Nav could hide
 * the "Sign Resolution" entry while closed; that hiding was removed because nav
 * visibility is not access control, the gate is, and hiding the link only
 * stopped people finding a page that explains itself.
 *
 * Kept as an operational check: it is the quickest way to confirm a gate flip
 * has taken effect on a deployed environment without signing in to the admin,
 * which matters on AGM week. Returns booleans only, and whether a public page
 * is open is already evident from the page itself.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const gates = await getAgmGates();

  return NextResponse.json(gates, {
    headers: { "Cache-Control": "no-store" },
  });
}
