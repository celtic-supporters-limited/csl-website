import ExcelJS from "exceljs";
import type { ReportData } from "@/lib/reporting-data";

function gbp(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  rows: (string | number | null | undefined)[][],
  colWidths: number[],
) {
  const ws = wb.addWorksheet(name);
  ws.columns = colWidths.map((width) => ({ width }));
  for (const row of rows) {
    ws.addRow(row);
  }
}

export async function buildReportXlsx(d: ReportData): Promise<Buffer<ArrayBuffer>> {
  const wb = new ExcelJS.Workbook();
  const hasWp = d.wpData !== null;

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────

  const summary: (string | number | null)[][] = [
    ["Celtic Supporters Limited - Membership Report"],
    [`Generated: ${d.generatedAt}`],
    [`Company No. SC862186  |  ICO ZB985030  |  LEI 984500CDVAFEBEF83781`],
    [],
    ["Key figures", ""],
    ["Active members", d.combinedActive],
    ["Membership target", d.targetMembers],
    ["Progress to target", `${Math.round((d.combinedActive / d.targetMembers) * 1000) / 10}%`],
    ["Monthly income (excl. lifetime)", gbp(d.combinedMrrPence)],
    ["Total collected - new platform", gbp(d.totalCollectedPence)],
    ...(d.earliestChargeDate ? [["  (all payments since)", d.earliestChargeDate]] : []),
    [],
    hasWp
      ? ["Legacy (WordPress) data as of", d.wpAsOfDate ?? "unknown"]
      : ["Legacy data", "No export uploaded"],
  ];
  addSheet(wb, "Summary", summary, [38, 20]);

  // ── Sheet 2: Status breakdown ─────────────────────────────────────────────

  const statusHeader = hasWp
    ? ["Status", "New platform", "Legacy (WP)", "Total"]
    : ["Status", "New platform", "Total"];

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

  const statusData = [
    statusHeader,
    ...statusRows.map((r) =>
      hasWp ? [r.label, r.sb, r.wp, r.total] : [r.label, r.sb, r.total]
    ),
  ];
  addSheet(wb, "Status breakdown", statusData, [20, 16, 16, 10]);

  // ── Sheet 3: Plan breakdown ───────────────────────────────────────────────

  const planHeader = hasWp
    ? ["Plan", "New platform", "Legacy (WP)", "Total"]
    : ["Plan", "New platform", "Total"];

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

  const planData = [
    planHeader,
    ...planRows.map((r) =>
      hasWp ? [r.plan, r.sb || 0, r.wp || 0, r.total] : [r.plan, r.sb || 0, r.total]
    ),
  ];
  addSheet(wb, "Active members by plan", planData, [24, 16, 16, 10]);

  // ── Sheet 4: Migration ────────────────────────────────────────────────────

  const notYet = d.wpData
    ? d.wpData.active + d.wpData.cancelled + d.wpData.expired + d.wpData.pending + d.wpData.other
    : 0;

  const migData: (string | number)[][] = [
    ["Stage", "Members"],
    ["Fully migrated (new platform + active subscription)", d.liveMigration.migrated],
    ["Migration started (new platform, no active subscription yet)", d.liveMigration.migration_in_progress],
    ["Not yet migrated (legacy platform only)", hasWp ? notYet : "Unknown - no export uploaded"],
  ];
  addSheet(wb, "Migration progress", migData, [52, 12]);

  // ── Sheet 5: Geographic distribution ─────────────────────────────────────

  const geoEntries = Object.entries(d.countryBreakdown).sort((a, b) => b[1] - a[1]);
  if (geoEntries.length > 0) {
    const COUNTRY_NAMES_XLSX: Record<string, string> = {
      GB: "United Kingdom", IE: "Ireland", US: "United States",
      CA: "Canada", AU: "Australia", DE: "Germany", FR: "France",
      NL: "Netherlands", ES: "Spain", IT: "Italy", SE: "Sweden",
      NO: "Norway", DK: "Denmark", BE: "Belgium", CH: "Switzerland",
      NZ: "New Zealand", ZA: "South Africa", AE: "United Arab Emirates",
    };
    const geoTotal = geoEntries.reduce((s, [, n]) => s + n, 0);
    const geoData = [
      ["Country", "ISO code", "Charges", "% of total"],
      ...geoEntries.map(([code, count]) => [
        COUNTRY_NAMES_XLSX[code] ?? code,
        code,
        count,
        geoTotal > 0 ? `${Math.round((count / geoTotal) * 100)}%` : "0%",
      ]),
      ["Total", "", geoTotal, "100%"],
    ];
    addSheet(wb, "Geographic distribution", geoData, [24, 10, 10, 12]);
  }

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}
