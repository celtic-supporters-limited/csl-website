import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getSupabase } from "@/lib/supabase";
import { ProxyAppointmentPdf } from "@/components/ProxyAppointmentPdf";
import { NomineeInstructionPdf } from "@/components/NomineeInstructionPdf";

/**
 * Package 6 - the appointment or platform-instruction PDF, downloadable by
 * the agm_proxies row's own id. Same public-by-id reasoning as
 * /api/resolution/pdf/[id] - the UUID is the unguessable token.
 *
 * Direct holders get ProxyAppointmentPdf; nominee holders get
 * NomineeInstructionPdf instead - never the appointment document, since a
 * nominee's vote is exercised by their platform, not lodged with
 * Computershare directly.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const db = getSupabase();
  const { data: row } = await db
    .from("agm_proxies")
    .select(`
      id, full_name, address_line_1, address_line_2, address_town, address_postcode, email,
      how_held, computershare_srn, nominee_platform, nominee_platform_other,
      shares_held, shares_held_exact, share_class, appointee_name, declaration_snapshot,
      signature_name, signed_at, lodgement_path, meeting_ref, suspected_bot
    `)
    .eq("id", id)
    .maybeSingle();

  if (!row || row.suspected_bot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (row.how_held === "nominee") {
    const buf = await renderToBuffer(
      NomineeInstructionPdf({
        fullName: row.full_name,
        email: row.email,
        nomineePlatform: (row.nominee_platform === "Other" ? row.nominee_platform_other : row.nominee_platform) ?? "Not stated",
        shareClass: row.share_class,
        sharesHeld: row.shares_held,
        appointeeName: row.appointee_name,
        signatureName: row.signature_name,
        signedAt: row.signed_at,
        meetingRef: row.meeting_ref,
      })
    );
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="csl-proxy-instruction-${row.id}.pdf"`,
      },
    });
  }

  const buf = await renderToBuffer(
    ProxyAppointmentPdf({
      fullName: row.full_name,
      addressLine1: row.address_line_1,
      addressLine2: row.address_line_2,
      addressTown: row.address_town,
      addressPostcode: row.address_postcode,
      email: row.email,
      computershareSrn: row.computershare_srn,
      sharesHeldExact: row.shares_held_exact,
      shareClass: row.share_class,
      appointeeName: row.appointee_name,
      declarationSnapshot: row.declaration_snapshot,
      signatureName: row.signature_name,
      signedAt: row.signed_at,
      lodgementPath: row.lodgement_path,
      meetingRef: row.meeting_ref,
    })
  );

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="csl-proxy-appointment-${row.id}.pdf"`,
    },
  });
}
