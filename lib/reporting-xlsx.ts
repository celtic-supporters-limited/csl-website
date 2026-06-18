import * as XLSX from "xlsx";
import type { ReportData } from "@/lib/reporting-data";

function gbp(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function buildReportXlsx(d: ReportData): Buffer {
  const wb = XLSX.utils.book_new();
  const hasWp = d.wpData !== null;

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────

  const summary = [
    ["Celtic Supporters Limited - Membership Report"],
    [`Generated: ${d.generatedAt}`],
    [`Company No. SC862186  |  ICO ZB985030  |  LEI 984500CDVAFEBEF83781`],
    [],
    ["Key figures", ""],
    ["Active members",   d.combinedActive],
    ["Membership target", d.targetMembers],
    ["Progress to target", `${Math.round((d.combinedActive / d.targetMembers) * 1000) / 10}%`],
    ["Monthly income (excl. lifetime)", gbp(d.combinedMrrPence)],
    ["Total collected - new platform",  gbp(d.totalCollectedPence)],
    d.earliestChargeDate
      ? ["  (all payments since)", d.earliestChargeDate]
      : [],
    [],
    hasWp
      ? ["Legacy (WordPress) data as of", d.wpAsOfDate ?? "unknown"]
      : ["Legacy data", "No export uploaded"],
  ].filter((r) => r.length > 0);

  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 38 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

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
  const wsStatus = XLSX.utils.aoa_to_sheet(statusData);
  wsStatus["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsStatus, "Status breakdown");

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
  const wsPlan = XLSX.utils.aoa_to_sheet(planData);
  wsPlan["!cols"] = [{ wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsPlan, "Active members by plan");

  // ── Sheet 4: Migration ────────────────────────────────────────────────────

  const notYet = d.wpData
    ? d.wpData.active + d.wpData.cancelled + d.wpData.expired + d.wpData.pending + d.wpData.other
    : 0;

  const migData = [
    ["Stage", "Members"],
    ["Fully migrated (new platform + active subscription)", d.liveMigration.migrated],
    ["Migration started (new platform, no active subscription yet)", d.liveMigration.migration_in_progress],
    ["Not yet migrated (legacy platform only)", hasWp ? notYet : "Unknown - no export uploaded"],
  ];
  const wsMig = XLSX.utils.aoa_to_sheet(migData);
  wsMig["!cols"] = [{ wch: 52 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsMig, "Migration progress");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
