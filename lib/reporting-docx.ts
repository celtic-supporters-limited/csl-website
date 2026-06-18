import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
  ShadingType,
} from "docx";
import type { ReportData } from "@/lib/reporting-data";

const GREEN_HEX = "1B4D2E";
const GOLD_HEX  = "C8A951";
const LIGHT_HEX = "F0F4F1";
const GREY_HEX  = "6B7280";

function gbp(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function num(n: number) {
  return n.toLocaleString("en-GB");
}

function heading(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GREEN_HEX } },
    run: { color: GREEN_HEX, bold: true },
  });
}

function cell(text: string, opts?: {
  bold?: boolean; right?: boolean; header?: boolean; shade?: boolean;
}) {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: opts?.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold: opts?.bold || opts?.header,
            color: opts?.header ? "FFFFFF" : undefined,
            size: 18,
          }),
        ],
        spacing: { before: 40, after: 40 },
      }),
    ],
    shading: opts?.header
      ? { type: ShadingType.SOLID, color: GREEN_HEX }
      : opts?.shade
      ? { type: ShadingType.SOLID, color: LIGHT_HEX }
      : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

function tableRow(cols: string[], widths: number[], opts?: {
  header?: boolean; shade?: boolean; bold?: boolean;
}) {
  return new TableRow({
    children: cols.map((c, i) =>
      cell(c, {
        bold: opts?.bold,
        header: opts?.header,
        shade: opts?.shade,
        right: i > 0,
      })
    ),
    tableHeader: opts?.header,
  });
}

function noBorder() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none, insideH: none, insideV: none };
}

function keyValueTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorder(),
    rows: rows.map(([label, value], i) =>
      new TableRow({
        children: [
          cell(label, { shade: i % 2 === 0 }),
          cell(value,  { shade: i % 2 === 0, right: true, bold: true }),
        ],
      })
    ),
  });
}

export async function buildReportDocx(d: ReportData): Promise<Buffer> {
  const hasWp = d.wpData !== null;
  const progressPct = Math.round((d.combinedActive / d.targetMembers) * 1000) / 10;

  // Status rows
  const statusRows = [
    { label: "Active",         sb: d.liveMetrics.active,         wp: d.wpData?.active         ?? 0 },
    { label: "Pending",        sb: d.liveMetrics.pending,        wp: d.wpData?.pending        ?? 0 },
    { label: "Expired",        sb: d.liveMetrics.expired,        wp: d.wpData?.expired        ?? 0 },
    { label: "Other/unknown",  sb: d.liveMetrics.other,          wp: d.wpData?.other          ?? 0 },
    { label: "Cancelled",      sb: d.liveMetrics.cancelled,      wp: d.wpData?.cancelled      ?? 0 },
    { label: "Payment failed", sb: d.liveMetrics.payment_failed, wp: d.wpData?.payment_failed ?? 0 },
  ]
    .map((r) => ({ ...r, total: r.sb + r.wp }))
    .sort((a, b) => b.total - a.total);

  // Plan rows
  const allPlans = new Set([
    ...Object.keys(d.liveMetrics.by_plan),
    ...(d.wpData ? Object.keys(d.wpData.by_plan) : []),
  ]);
  const planRows = Array.from(allPlans)
    .map((plan) => ({
      plan,
      sb: d.liveMetrics.by_plan[plan] ?? 0,
      wp: d.wpData?.by_plan[plan] ?? 0,
    }))
    .map((r) => ({ ...r, total: r.sb + r.wp }))
    .sort((a, b) => b.total - a.total);

  const notYet = d.wpData
    ? d.wpData.active + d.wpData.cancelled + d.wpData.expired + d.wpData.pending + d.wpData.other
    : 0;

  const statusColW = hasWp ? [36, 21, 21, 22] : [54, 23, 23];
  const planColW   = hasWp ? [42, 19, 19, 20] : [60, 20, 20];

  const statusHeader = hasWp
    ? ["Status", "New platform", "Legacy (WP)", "Total"]
    : ["Status", "New platform", "Total"];

  const planHeader = hasWp
    ? ["Plan", "New platform", "Legacy (WP)", "Total"]
    : ["Plan", "New platform", "Total"];

  const notePoints = [
    "New platform member figures are live at the time this report was exported.",
    hasWp
      ? `Legacy figures cover members who have not yet moved to the new platform. They are taken from a membership export dated ${d.wpAsOfDate ?? "unknown"}.`
      : "No legacy membership export has been uploaded. Figures cover new platform members only.",
    "Automated bot registrations are identified by name pattern and excluded from all counts.",
    "Lifetime members are counted as active but are not included in monthly income, as they make a single payment rather than a recurring subscription.",
    `Total collected covers all payments received through the new platform${d.earliestChargeDate ? ` since ${d.earliestChargeDate}` : ""}, after deducting any refunds.`,
    d.liveQuality.payment_failed_count > 0
      ? `${num(d.liveQuality.payment_failed_count)} member${d.liveQuality.payment_failed_count !== 1 ? "s" : ""} on the new platform ${d.liveQuality.payment_failed_count !== 1 ? "have" : "has"} a payment that has failed. Their membership is at risk.`
      : null,
  ].filter(Boolean) as string[];

  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: "Heading2",
          name: "Heading 2",
          run: { color: GREEN_HEX, bold: true, size: 22 },
          paragraph: { spacing: { before: 240, after: 80 } },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 900, right: 900 },
        },
      },
      children: [

        // Title
        new Paragraph({
          children: [
            new TextRun({ text: "Membership Report", bold: true, size: 40, color: GREEN_HEX }),
          ],
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Celtic Supporters Limited", size: 24, color: GOLD_HEX }),
          ],
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Generated: ${d.generatedAt}`, size: 18, color: GREY_HEX }),
          ],
          spacing: { after: 20 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Company No. SC862186  |  ICO ZB985030  |  LEI 984500CDVAFEBEF83781", size: 16, color: GREY_HEX }),
          ],
          spacing: { after: hasWp ? 20 : 160 },
        }),
        ...(hasWp ? [
          new Paragraph({
            children: [
              new TextRun({ text: `Legacy (WP) data as of: ${d.wpAsOfDate}`, size: 16, color: GREY_HEX }),
            ],
            spacing: { after: 160 },
          }),
        ] : []),

        // Key figures
        heading("Key figures"),
        keyValueTable([
          ["Active members",                    `${num(d.combinedActive)} (${progressPct}% of ${num(d.targetMembers)} target)`],
          ["Monthly income (excl. lifetime)",   gbp(d.combinedMrrPence)],
          ["Total collected - new platform",    `${gbp(d.totalCollectedPence)}${d.earliestChargeDate ? ` (since ${d.earliestChargeDate})` : ""}`],
        ]),

        // Status breakdown
        heading("Membership status breakdown"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: statusColW.map((w) => Math.round(w * 90)),
          rows: [
            tableRow(statusHeader, statusColW, { header: true }),
            ...statusRows.map((r, i) =>
              tableRow(
                hasWp
                  ? [r.label, num(r.sb), num(r.wp), num(r.total)]
                  : [r.label, num(r.sb), num(r.total)],
                statusColW,
                { shade: i % 2 === 1, bold: r.label === "Active" }
              )
            ),
          ],
        }),

        // Plan breakdown
        heading("Active members by plan"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: planColW.map((w) => Math.round(w * 90)),
          rows: [
            tableRow(planHeader, planColW, { header: true }),
            ...planRows.map((r, i) =>
              tableRow(
                hasWp
                  ? [r.plan, r.sb > 0 ? num(r.sb) : "-", r.wp > 0 ? num(r.wp) : "-", num(r.total)]
                  : [r.plan, r.sb > 0 ? num(r.sb) : "-", num(r.total)],
                planColW,
                { shade: i % 2 === 1 }
              )
            ),
          ],
        }),

        // Migration
        heading("Migration progress"),
        keyValueTable([
          ["Fully migrated (new platform + active subscription)", num(d.liveMigration.migrated)],
          ["Migration started (new platform, no active subscription yet)", num(d.liveMigration.migration_in_progress)],
          ["Not yet migrated (legacy platform only)", hasWp ? num(notYet) : "Unknown"],
        ]),

        // Notes
        heading("Notes"),
        ...notePoints.map((point) =>
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: point, size: 18, color: GREY_HEX })],
            spacing: { after: 60 },
          })
        ),

      ],
    }],
  });

  return await Packer.toBuffer(doc);
}
