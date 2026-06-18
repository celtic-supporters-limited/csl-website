import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createServerSupabase } from "@/lib/supabase";
import { gatherReportData } from "@/lib/reporting-data";
import { MembershipReportPdf } from "@/components/MembershipReportPdf";
import { buildReportXlsx } from "@/lib/reporting-xlsx";
import { buildReportDocx } from "@/lib/reporting-docx";

export async function GET(req: NextRequest) {
  const authClient = createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { getSupabase } = await import("@/lib/supabase");
  const db = getSupabase();
  const { data: adminCheck } = await db
    .from("members")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminCheck?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const format = req.nextUrl.searchParams.get("format") ?? "pdf";
  if (!["pdf", "xlsx", "docx"].includes(format)) {
    return NextResponse.json({ error: "Invalid format. Use pdf, xlsx, or docx." }, { status: 400 });
  }

  const data = await gatherReportData();
  const dateSlug = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const buf = buildReportXlsx(data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="csl-membership-report-${dateSlug}.xlsx"`,
      },
    });
  }

  if (format === "docx") {
    const buf = await buildReportDocx(data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="csl-membership-report-${dateSlug}.docx"`,
      },
    });
  }

  // Default: PDF
  const buf = await renderToBuffer(MembershipReportPdf(data));
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="csl-membership-report-${dateSlug}.pdf"`,
    },
  });
}
