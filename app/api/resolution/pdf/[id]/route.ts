import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getSupabase } from "@/lib/supabase";
import { RequisitionPdf } from "@/components/RequisitionPdf";

/**
 * Package 6 - the requisition PDF, downloadable by the signature's own id.
 * Public and unauthenticated, deliberately: the id is a UUID, which per the
 * same reasoning behind the nominee confirmation link (section 7 of the
 * package brief) already carries 122 bits of randomness and is the
 * unguessable token. No session, no separate secret.
 *
 * A suspected_bot row returns 404 - store-and-flag means the row exists for
 * a volunteer to review, not that it should be downloadable as if it were a
 * genuine signature until released.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const db = getSupabase();
  const { data: row } = await db
    .from("agm_signatures")
    .select(`
      id, full_name, address_line_1, address_line_2, address_town, address_postcode, email,
      how_held, computershare_srn, nominee_platform, nominee_platform_other, shares_held, share_class,
      eligibility_confirmed, resolution_supported,
      resolution_snapshot, supporting_statement_snapshot, declaration_snapshot, consent_snapshot,
      signature_name, signed_at, meeting_ref, suspected_bot
    `)
    .eq("id", id)
    .maybeSingle();

  if (!row || row.suspected_bot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buf = await renderToBuffer(
    RequisitionPdf({
      fullName: row.full_name,
      addressLine1: row.address_line_1,
      addressLine2: row.address_line_2,
      addressTown: row.address_town,
      addressPostcode: row.address_postcode,
      email: row.email,
      howHeld: row.how_held,
      computershareSrn: row.computershare_srn,
      nomineePlatform: row.nominee_platform,
      nomineePlatformOther: row.nominee_platform_other,
      sharesHeld: row.shares_held,
      shareClass: row.share_class,
      eligibilityConfirmed: row.eligibility_confirmed,
      resolutionSupported: row.resolution_supported,
      resolutionSnapshot: row.resolution_snapshot,
      supportingStatementSnapshot: row.supporting_statement_snapshot,
      declarationSnapshot: row.declaration_snapshot,
      consentSnapshot: row.consent_snapshot,
      signatureName: row.signature_name,
      signedAt: row.signed_at,
      meetingRef: row.meeting_ref,
    })
  );

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="csl-requisition-${row.id}.pdf"`,
    },
  });
}
