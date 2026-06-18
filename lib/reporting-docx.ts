import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, AlignmentType, WidthType, BorderStyle, ShadingType,
  TableLayoutType, HeightRule, Footer,
} from "docx";
import type { ReportData } from "@/lib/reporting-data";

// ── Palette (matches PDF) ─────────────────────────────────────────────────────

const GREEN = "1B4D2E";
const GOLD  = "C8A951";
const LIGHT = "F0F4F1";
const LGREY = "E5E7EB";
const GREY  = "6B7280";
const WHITE = "FFFFFF";
const BLACK = "111827";

// ── Page geometry (twips) ─────────────────────────────────────────────────────
// A4 = 11906 wide. Margins 720 each side → content = 10466 twips.

const W        = 10466;
const COL2     = Math.floor(W / 2);          // two-col layout
const COL3     = Math.floor(W / 3);          // three-col cards / migration
const COL3R    = W - COL3 * 2;               // last col absorbs rounding

// ── Helpers ───────────────────────────────────────────────────────────────────

function gbp(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function num(n: number) { return n.toLocaleString("en-GB"); }

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: WHITE } as const;
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };

function run(text: string, opts?: {
  bold?: boolean; color?: string; size?: number; italics?: boolean;
}) {
  return new TextRun({ text, bold: opts?.bold, color: opts?.color ?? BLACK, size: opts?.size ?? 18, italics: opts?.italics });
}

function emptyPara(spacingAfter = 0) {
  return new Paragraph({ text: "", spacing: { after: spacingAfter } });
}

// Section heading — green bold text, green bottom border, matches PDF secHead style
function sectionHead(text: string) {
  return new Paragraph({
    children: [run(text.toUpperCase(), { bold: true, color: GREEN, size: 15 })],
    spacing: { before: 180, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GREEN, space: 2 } },
  });
}

// Table cell with optional shading and alignment
function tc(
  children: (Paragraph | Table)[],
  widthDxa: number,
  opts?: { shade?: string; valign?: "top" | "center" | "bottom"; margins?: { top?: number; bottom?: number; left?: number; right?: number } }
) {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    shading: opts?.shade ? { type: ShadingType.SOLID, color: opts.shade } : undefined,
    verticalAlign: opts?.valign ?? "top",
    margins: opts?.margins ?? { top: 80, bottom: 80, left: 80, right: 80 },
    children,
  });
}

// Data table row (green header or body row)
function dataRow(
  cols: string[],
  widths: number[],
  opts?: { header?: boolean; alt?: boolean; bold?: boolean }
) {
  return new TableRow({
    tableHeader: opts?.header,
    children: cols.map((text, i) =>
      new TableCell({
        width: { size: widths[i], type: WidthType.DXA },
        shading: opts?.header
          ? { type: ShadingType.SOLID, color: GREEN }
          : opts?.alt
          ? { type: ShadingType.SOLID, color: LIGHT }
          : undefined,
        margins: { top: 50, bottom: 50, left: 70, right: 70 },
        children: [
          new Paragraph({
            alignment: i > 0 ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [
              run(text, {
                bold: opts?.header || opts?.bold,
                color: opts?.header ? WHITE : BLACK,
                size: 16,
              }),
            ],
            spacing: { before: 0, after: 0 },
          }),
        ],
      })
    ),
  });
}

function dataTable(rows: TableRow[], totalWidth: number) {
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: {
      top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: LGREY },
      insideVertical: NO_BORDER,
    },
    rows,
  });
}

// Progress bar: gold fill + grey remainder, thin stripe
function progressBar(pct: number, widthDxa: number) {
  const goldW = Math.max(1, Math.round((pct / 100) * widthDxa));
  const greyW = widthDxa - goldW;
  return new Table({
    width: { size: widthDxa, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        height: { value: 80, rule: HeightRule.EXACT },
        children: [
          new TableCell({
            width: { size: goldW, type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: GOLD },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [new Paragraph({ text: "", spacing: { after: 0 } })],
          }),
          ...(greyW > 0 ? [new TableCell({
            width: { size: greyW, type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: LGREY },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [new Paragraph({ text: "", spacing: { after: 0 } })],
          })] : []),
        ],
      }),
    ],
  });
}

// ── Builder ───────────────────────────────────────────────────────────────────

export async function buildReportDocx(d: ReportData): Promise<Buffer> {
  const hasWp       = d.wpData !== null;
  const progressPct = Math.round((d.combinedActive / d.targetMembers) * 1000) / 10;
  const notYet      = d.wpData?.active ?? 0;
  const legacyLapsed = d.wpData
    ? d.wpData.pending + d.wpData.expired + d.wpData.cancelled + d.wpData.other
    : 0;

  // ── Status rows ─────────────────────────────────────────────────────────────

  const statusRows = [
    { label: "Active",         sb: d.liveMetrics.active,         wp: d.wpData?.active         ?? 0 },
    { label: "Pending",        sb: d.liveMetrics.pending,        wp: d.wpData?.pending        ?? 0 },
    { label: "Expired",        sb: d.liveMetrics.expired,        wp: d.wpData?.expired        ?? 0 },
    { label: "Other/unknown",  sb: d.liveMetrics.other,          wp: d.wpData?.other          ?? 0 },
    { label: "Cancelled",      sb: d.liveMetrics.cancelled,      wp: d.wpData?.cancelled      ?? 0 },
    { label: "Payment failed", sb: d.liveMetrics.payment_failed, wp: d.wpData?.payment_failed ?? 0 },
  ]
    .map((r) => ({ ...r, total: r.sb + r.wp }))
    .filter((r) => r.total > 0 || r.label === "Active")
    .sort((a, b) => b.total - a.total);

  // ── Plan rows ────────────────────────────────────────────────────────────────

  const allPlans = new Set([
    ...Object.keys(d.liveMetrics.by_plan),
    ...(d.wpData ? Object.keys(d.wpData.by_plan) : []),
  ]);
  const planRows = Array.from(allPlans)
    .map((plan) => ({ plan, sb: d.liveMetrics.by_plan[plan] ?? 0, wp: d.wpData?.by_plan[plan] ?? 0 }))
    .map((r) => ({ ...r, total: r.sb + r.wp }))
    .sort((a, b) => b.total - a.total);

  // ── Column widths for data tables ────────────────────────────────────────────

  // Tables sit inside COL2-width cells (with 80-twip margins each side = COL2-160 usable)
  const tW = COL2 - 160;

  const statusW = hasWp
    ? [Math.round(tW * 0.36), Math.round(tW * 0.21), Math.round(tW * 0.21), tW - Math.round(tW * 0.36) - Math.round(tW * 0.21) * 2]
    : [Math.round(tW * 0.54), Math.round(tW * 0.23), tW - Math.round(tW * 0.54) - Math.round(tW * 0.23)];

  const planW = hasWp
    ? [Math.round(tW * 0.44), Math.round(tW * 0.18), Math.round(tW * 0.18), tW - Math.round(tW * 0.44) - Math.round(tW * 0.18) * 2]
    : [Math.round(tW * 0.62), Math.round(tW * 0.18), tW - Math.round(tW * 0.62) - Math.round(tW * 0.18)];

  const statusHeader = hasWp ? ["Status", "New", "Legacy", "Total"] : ["Status", "New", "Total"];
  const planHeader   = hasWp ? ["Plan",   "New", "Legacy", "Total"] : ["Plan",   "New", "Total"];

  // ── Notes points ─────────────────────────────────────────────────────────────

  const notePoints = [
    "New platform member figures are live at the time this report was exported.",
    hasWp
      ? `Legacy figures cover members who have not yet moved to the new platform. They are taken from a membership export dated ${d.wpAsOfDate ?? "unknown"}.`
      : "No legacy membership export has been uploaded. Figures cover new platform members only.",
    "Automated bot registrations are identified by name pattern and excluded from all counts.",
    "Lifetime members are counted as active but are not included in monthly income, as they make a single payment rather than a recurring subscription.",
    `Total collected covers all payments received via Stripe${d.earliestChargeDate ? ` since ${d.earliestChargeDate}` : ""}, across both the legacy and new platforms, after deducting any refunds.`,
    hasWp && legacyLapsed > 0
      ? `${num(legacyLapsed)} WordPress members are lapsed (expired, pending, or cancelled) and are excluded from the migration count. These represent a potential re-engagement opportunity.`
      : null,
    d.liveQuality.payment_failed_count > 0
      ? `${num(d.liveQuality.payment_failed_count)} member${d.liveQuality.payment_failed_count !== 1 ? "s" : ""} on the new platform ${d.liveQuality.payment_failed_count !== 1 ? "have" : "has"} a payment that has failed. Their membership is at risk.`
      : null,
  ].filter(Boolean) as string[];

  // ── Document ─────────────────────────────────────────────────────────────────

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 0, bottom: 720, left: 720, right: 720 } },
      },

      footers: {
        default: new Footer({
          children: [
            new Table({
              width: { size: W, type: WidthType.DXA },
              layout: TableLayoutType.FIXED,
              borders: { ...NO_BORDERS, top: { style: BorderStyle.SINGLE, size: 4, color: LGREY } },
              rows: [new TableRow({
                children: [
                  tc([new Paragraph({
                    children: [run("Celtic Supporters Limited  |  Company No. SC862186  |  ICO ZB985030  |  LEI 984500CDVAFEBEF83781", { color: GREY, size: 13 })],
                    spacing: { after: 0 },
                  })], Math.round(W * 0.8), { margins: { top: 60, bottom: 0, left: 0, right: 80 } }),
                  tc([new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [run("Confidential", { color: GREY, size: 13 })],
                    spacing: { after: 0 },
                  })], W - Math.round(W * 0.8), { margins: { top: 60, bottom: 0, left: 0, right: 0 } }),
                ],
              })],
            }),
          ],
        }),
      },

      children: [

        // ── Header strip (green, full-width, zero top margin) ──────────────────
        new Table({
          width: { size: W, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          borders: NO_BORDERS,
          rows: [
            new TableRow({
              children: [
                // Left: org name + report title
                tc([
                  new Paragraph({
                    children: [run("Celtic Supporters Limited", { bold: true, color: WHITE, size: 28 })],
                    spacing: { before: 0, after: 40 },
                  }),
                  new Paragraph({
                    children: [run("MEMBERSHIP REPORT", { color: GOLD, size: 18 })],
                    spacing: { before: 0, after: 0 },
                  }),
                ], Math.round(W * 0.6), { shade: GREEN, margins: { top: 200, bottom: 200, left: 280, right: 80 } }),

                // Right: metadata
                tc([
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [run(`Generated: ${d.generatedAt}`, { color: WHITE, size: 14 })],
                    spacing: { before: 0, after: 40 },
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [run("Company No. SC862186  |  ICO ZB985030", { color: WHITE, size: 14 })],
                    spacing: { before: 0, after: 40 },
                  }),
                  ...(d.wpAsOfDate ? [new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [run(`Legacy (WP) data as of ${d.wpAsOfDate}`, { color: WHITE, size: 14 })],
                    spacing: { before: 0, after: 0 },
                  })] : []),
                ], W - Math.round(W * 0.6), { shade: GREEN, margins: { top: 200, bottom: 200, left: 80, right: 280 }, valign: "bottom" }),
              ],
            }),
          ],
        }),

        emptyPara(120),

        // ── Stat cards (3 equal columns, LIGHT background) ────────────────────
        new Table({
          width: { size: W, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          borders: NO_BORDERS,
          rows: [new TableRow({
            children: [
              // Card 1: Active members + progress bar
              tc([
                new Paragraph({ children: [run(num(d.combinedActive), { bold: true, color: GREEN, size: 30 })], spacing: { after: 20 } }),
                new Paragraph({ children: [run("ACTIVE MEMBERS", { color: GREY, size: 13 })], spacing: { after: 20 } }),
                new Paragraph({ children: [run(`${progressPct}% of ${num(d.targetMembers)} target`, { color: GREY, size: 13 })], spacing: { after: 60 } }),
                progressBar(progressPct, COL3 - 160),
              ], COL3, { shade: LIGHT, margins: { top: 100, bottom: 100, left: 100, right: 60 } }),

              // Card 2: Monthly income
              tc([
                new Paragraph({ children: [run(gbp(d.combinedMrrPence), { bold: true, color: GREEN, size: 30 })], spacing: { after: 20 } }),
                new Paragraph({ children: [run("MONTHLY INCOME", { color: GREY, size: 13 })], spacing: { after: 20 } }),
                new Paragraph({ children: [run("Recurring subscriptions, excl. lifetime", { color: GREY, size: 13 })], spacing: { after: 0 } }),
              ], COL3, { shade: LIGHT, margins: { top: 100, bottom: 100, left: 100, right: 60 } }),

              // Card 3: Total collected
              tc([
                new Paragraph({ children: [run(gbp(d.totalCollectedPence), { bold: true, color: GREEN, size: 30 })], spacing: { after: 20 } }),
                new Paragraph({ children: [run("TOTAL COLLECTED - NEW PLATFORM", { color: GREY, size: 13 })], spacing: { after: 20 } }),
                new Paragraph({ children: [run(d.earliestChargeDate ? `All payments since ${d.earliestChargeDate}` : "All payments since launch", { color: GREY, size: 13 })], spacing: { after: 0 } }),
              ], COL3R, { shade: LIGHT, margins: { top: 100, bottom: 100, left: 100, right: 60 } }),
            ],
          })],
        }),

        emptyPara(60),

        // ── Two-column: Status + Plan tables ──────────────────────────────────
        new Table({
          width: { size: W, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          borders: NO_BORDERS,
          rows: [new TableRow({
            children: [
              // Left: status breakdown
              tc([
                sectionHead("Membership status"),
                dataTable([
                  dataRow(statusHeader, statusW, { header: true }),
                  ...statusRows.map((r, i) => dataRow(
                    hasWp ? [r.label, num(r.sb), num(r.wp), num(r.total)] : [r.label, num(r.sb), num(r.total)],
                    statusW,
                    { alt: i % 2 === 1, bold: r.label === "Active" }
                  )),
                ], tW),
              ], COL2, { margins: { top: 0, bottom: 0, left: 0, right: 80 } }),

              // Right: plan breakdown
              tc([
                sectionHead("Active members by plan"),
                dataTable([
                  dataRow(planHeader, planW, { header: true }),
                  ...planRows.map((r, i) => dataRow(
                    hasWp
                      ? [r.plan, r.sb > 0 ? num(r.sb) : "-", r.wp > 0 ? num(r.wp) : "-", num(r.total)]
                      : [r.plan, r.sb > 0 ? num(r.sb) : "-", num(r.total)],
                    planW,
                    { alt: i % 2 === 1 }
                  )),
                ], tW),
              ], COL2, { margins: { top: 0, bottom: 0, left: 80, right: 0 } }),
            ],
          })],
        }),

        // ── Migration progress ────────────────────────────────────────────────
        sectionHead("Migration progress"),
        new Table({
          width: { size: W, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          borders: { ...NO_BORDERS, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: LGREY } },
          rows: [new TableRow({
            children: [
              tc([
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run(num(d.liveMigration.migrated), { bold: true, color: GREEN, size: 26 })], spacing: { after: 40 } }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Fully migrated", { color: GREY, size: 14 })], spacing: { after: 20 } }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run("(new platform + Stripe)", { color: GREY, size: 13 })], spacing: { after: 0 } }),
              ], COL3, { margins: { top: 80, bottom: 80, left: 60, right: 60 } }),
              tc([
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run(num(d.liveMigration.migration_in_progress), { bold: true, color: GREEN, size: 26 })], spacing: { after: 40 } }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Migration started", { color: GREY, size: 14 })], spacing: { after: 20 } }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run("(new platform only)", { color: GREY, size: 13 })], spacing: { after: 0 } }),
              ], COL3, { margins: { top: 80, bottom: 80, left: 60, right: 60 } }),
              tc([
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run(hasWp ? num(notYet) : "?", { bold: true, color: GREEN, size: 26 })], spacing: { after: 40 } }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Not yet migrated", { color: GREY, size: 14 })], spacing: { after: 20 } }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run("(active WordPress members)", { color: GREY, size: 13 })], spacing: { after: 0 } }),
              ], COL3R, { margins: { top: 80, bottom: 80, left: 60, right: 60 } }),
            ],
          })],
        }),

        // ── Notes ─────────────────────────────────────────────────────────────
        sectionHead("Notes"),
        new Table({
          width: { size: W, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          borders: NO_BORDERS,
          rows: [new TableRow({
            children: [
              tc(
                notePoints.map((point) =>
                  new Paragraph({
                    children: [
                      run("-  ", { bold: true, color: GOLD, size: 15 }),
                      run(point, { color: GREY, size: 15 }),
                    ],
                    spacing: { after: 60 },
                  })
                ),
                W,
                { shade: LIGHT, margins: { top: 100, bottom: 100, left: 120, right: 120 } }
              ),
            ],
          })],
        }),

      ],
    }],
  });

  return await Packer.toBuffer(doc);
}
