import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { SourceMetrics, DataQualityFlags } from "@/lib/membership-metrics";

// ── Palette ───────────────────────────────────────────────────────────────────

const GREEN = "#1B4D2E";
const GOLD  = "#C8A951";
const LIGHT = "#F0F4F1";
const GREY  = "#6B7280";
const LGREY = "#E5E7EB";
const BLACK = "#111827";
const WHITE = "#FFFFFF";

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    color: BLACK,
    paddingBottom: 32,
  },

  // Header strip
  header: {
    backgroundColor: GREEN,
    paddingHorizontal: 32,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  headerLeft: { flexDirection: "column" },
  headerOrg:  { fontFamily: "Helvetica-Bold", fontSize: 14, color: WHITE, marginBottom: 2 },
  headerTitle:{ fontSize: 9, color: GOLD, letterSpacing: 0.5 },
  headerRight:{ flexDirection: "column", alignItems: "flex-end" },
  headerMeta: { fontSize: 7, color: WHITE, opacity: 0.8, marginBottom: 1 },

  // Body
  body: { paddingHorizontal: 28, paddingTop: 14 },

  // Stat cards
  cardRow:    { flexDirection: "row", gap: 8, marginBottom: 12 },
  card:       { flex: 1, backgroundColor: LIGHT, borderRadius: 3, padding: 8 },
  cardValue:  { fontFamily: "Helvetica-Bold", fontSize: 15, color: GREEN, marginBottom: 1 },
  cardLabel:  { fontSize: 6.5, color: GREY, textTransform: "uppercase", letterSpacing: 0.4 },
  cardNote:   { fontSize: 6.5, color: GREY, marginTop: 2 },
  progressBg: { backgroundColor: LGREY, height: 4, borderRadius: 2, marginTop: 3 },
  progressFill:{ backgroundColor: GOLD, height: 4, borderRadius: 2 },

  // Two-column layout
  cols:       { flexDirection: "row", gap: 12, marginBottom: 10 },
  col:        { flex: 1 },

  // Section heading
  secHead:    {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: GREEN,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: GREEN,
    paddingBottom: 2,
    marginBottom: 4,
  },

  // Table
  tHead:      { flexDirection: "row", backgroundColor: GREEN, paddingVertical: 4, paddingHorizontal: 6 },
  tHeadCell:  { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: WHITE, textTransform: "uppercase", letterSpacing: 0.3 },
  tRow:       { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: LGREY },
  tRowAlt:    { backgroundColor: LIGHT },
  tCell:      { fontSize: 7.5, color: BLACK },
  tCellGrey:  { fontSize: 7.5, color: GREY },
  right:      { textAlign: "right" },
  bold:       { fontFamily: "Helvetica-Bold" },

  // Migration strip
  migRow:     { flexDirection: "row", gap: 8, marginBottom: 10 },
  migCard:    { flex: 1, borderWidth: 0.5, borderColor: LGREY, borderRadius: 3, padding: 7, alignItems: "center" },
  migVal:     { fontFamily: "Helvetica-Bold", fontSize: 13, color: GREEN, marginBottom: 1 },
  migLabel:   { fontSize: 6.5, color: GREY, textAlign: "center" },

  // Notes
  notesBox:   { backgroundColor: LIGHT, borderRadius: 3, padding: 8 },
  notesText:  { fontSize: 7, color: GREY, lineHeight: 1.5 },

  // Footer
  footer:     {
    position: "absolute", bottom: 14, left: 28, right: 28,
    borderTopWidth: 0.5, borderTopColor: LGREY, paddingTop: 4,
    flexDirection: "row", justifyContent: "space-between",
  },
  footerText: { fontSize: 6.5, color: GREY },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function gbp(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function num(n: number) {
  return n.toLocaleString("en-GB");
}

function TRow({
  cols, widths, alt, isBold,
}: {
  cols: (string | number)[];
  widths: string[];
  alt?: boolean;
  isBold?: boolean;
}) {
  return (
    <View style={[s.tRow, alt ? s.tRowAlt : {}]}>
      {cols.map((c, i) => (
        <Text
          key={i}
          style={[
            { width: widths[i] },
            i > 0 ? s.right : {},
            s.tCell,
            isBold ? s.bold : {},
          ]}
        >
          {String(c)}
        </Text>
      ))}
    </View>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export type MembershipReportPdfProps = {
  generatedAt: string;
  combinedActive: number;
  targetMembers: number;
  combinedMrrPence: number;
  totalCollectedPence: number;
  earliestChargeDate: string | null;
  liveMetrics: SourceMetrics;
  wpData: SourceMetrics | null;
  wpAsOfDate: string | null;
  liveMigration: { migrated: number; migration_in_progress: number };
  liveQuality: Pick<DataQualityFlags, "payment_failed_count" | "no_auth_account_count">;
  snapshotCount: number;
};

// ── Document ──────────────────────────────────────────────────────────────────

export function MembershipReportPdf(props: MembershipReportPdfProps) {
  const {
    generatedAt,
    combinedActive,
    targetMembers,
    combinedMrrPence,
    totalCollectedPence,
    earliestChargeDate,
    liveMetrics,
    wpData,
    wpAsOfDate,
    liveMigration,
    liveQuality,
    snapshotCount,
  } = props;

  const progressPct = Math.round((combinedActive / targetMembers) * 1000) / 10;
  const hasWp = wpData !== null;

  // Status rows sorted by total desc
  const statusRows = [
    { label: "Active",         sb: liveMetrics.active,         wp: wpData?.active         ?? 0 },
    { label: "Pending",        sb: liveMetrics.pending,        wp: wpData?.pending        ?? 0 },
    { label: "Expired",        sb: liveMetrics.expired,        wp: wpData?.expired        ?? 0 },
    { label: "Other/unknown",  sb: liveMetrics.other,          wp: wpData?.other          ?? 0 },
    { label: "Cancelled",      sb: liveMetrics.cancelled,      wp: wpData?.cancelled      ?? 0 },
    { label: "Payment failed", sb: liveMetrics.payment_failed, wp: wpData?.payment_failed ?? 0 },
  ]
    .map((r) => ({ ...r, total: r.sb + r.wp }))
    .filter((r) => r.total > 0 || r.label === "Active")
    .sort((a, b) => b.total - a.total);

  // Plan rows sorted by total desc
  const allPlans = new Set([
    ...Object.keys(liveMetrics.by_plan),
    ...(wpData ? Object.keys(wpData.by_plan) : []),
  ]);
  const planRows = Array.from(allPlans)
    .map((plan) => ({
      plan,
      sb: liveMetrics.by_plan[plan] ?? 0,
      wp: wpData?.by_plan[plan] ?? 0,
    }))
    .map((r) => ({ ...r, total: r.sb + r.wp }))
    .sort((a, b) => b.total - a.total);

  // Migration not-yet count
  const notYetMigrated = wpData
    ? wpData.active + wpData.cancelled + wpData.expired + wpData.pending + wpData.other
    : 0;

  // Column widths
  const swStatus = hasWp ? ["36%", "21%", "21%", "22%"] : ["54%", "22%", "24%"];
  const swPlan   = hasWp ? ["44%", "18%", "18%", "20%"] : ["62%", "18%", "20%"];

  return (
    <Document
      title="CSL Membership Report"
      author="Celtic Supporters Limited"
      subject="Membership Statistics"
    >
      <Page size="A4" style={s.page}>

        {/* Header strip */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.headerOrg}>Celtic Supporters Limited</Text>
            <Text style={s.headerTitle}>MEMBERSHIP REPORT</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerMeta}>Generated: {generatedAt}</Text>
            <Text style={s.headerMeta}>Company No. SC862186  |  ICO ZB985030</Text>
            {wpAsOfDate && (
              <Text style={s.headerMeta}>Legacy (WP) data as of {wpAsOfDate}</Text>
            )}
          </View>
        </View>

        <View style={s.body}>

          {/* Stat cards */}
          <View style={s.cardRow}>
            <View style={s.card}>
              <Text style={s.cardValue}>{num(combinedActive)}</Text>
              <Text style={s.cardLabel}>Active members</Text>
              <Text style={s.cardNote}>{progressPct}% of {num(targetMembers)} target</Text>
              <View style={s.progressBg}>
                <View style={[s.progressFill, { width: `${Math.min(progressPct, 100)}%` }]} />
              </View>
            </View>
            <View style={s.card}>
              <Text style={s.cardValue}>{gbp(combinedMrrPence)}</Text>
              <Text style={s.cardLabel}>Monthly income</Text>
              <Text style={s.cardNote}>Recurring subscriptions, excl. lifetime</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardValue}>{gbp(totalCollectedPence)}</Text>
              <Text style={s.cardLabel}>Total collected - new platform</Text>
              <Text style={s.cardNote}>
                {earliestChargeDate ? `All Stripe payments since ${earliestChargeDate}` : "All Stripe payments since launch"}
              </Text>
            </View>
          </View>

          {/* Status + Plan tables side by side */}
          <View style={s.cols}>

            {/* Status breakdown */}
            <View style={s.col}>
              <Text style={s.secHead}>Membership status</Text>
              <View style={s.tHead}>
                <Text style={[s.tHeadCell, { width: swStatus[0] }]}>Status</Text>
                <Text style={[s.tHeadCell, s.right, { width: swStatus[1] }]}>New</Text>
                {hasWp && <Text style={[s.tHeadCell, s.right, { width: swStatus[2] }]}>Legacy</Text>}
                <Text style={[s.tHeadCell, s.right, { width: swStatus[hasWp ? 3 : 2] }]}>Total</Text>
              </View>
              {statusRows.map((r, i) => (
                <TRow
                  key={r.label}
                  alt={i % 2 === 1}
                  isBold={r.label === "Active"}
                  cols={hasWp
                    ? [r.label, num(r.sb), num(r.wp), num(r.total)]
                    : [r.label, num(r.sb), num(r.total)]}
                  widths={swStatus}
                />
              ))}
            </View>

            {/* Plan breakdown */}
            <View style={s.col}>
              <Text style={s.secHead}>Active members by plan</Text>
              <View style={s.tHead}>
                <Text style={[s.tHeadCell, { width: swPlan[0] }]}>Plan</Text>
                <Text style={[s.tHeadCell, s.right, { width: swPlan[1] }]}>New</Text>
                {hasWp && <Text style={[s.tHeadCell, s.right, { width: swPlan[2] }]}>Legacy</Text>}
                <Text style={[s.tHeadCell, s.right, { width: swPlan[hasWp ? 3 : 2] }]}>Total</Text>
              </View>
              {planRows.map((r, i) => (
                <TRow
                  key={r.plan}
                  alt={i % 2 === 1}
                  cols={hasWp
                    ? [r.plan, r.sb > 0 ? num(r.sb) : "-", r.wp > 0 ? num(r.wp) : "-", num(r.total)]
                    : [r.plan, r.sb > 0 ? num(r.sb) : "-", num(r.total)]}
                  widths={swPlan}
                />
              ))}
            </View>

          </View>

          {/* Migration progress */}
          <Text style={s.secHead}>Migration progress</Text>
          <View style={s.migRow}>
            <View style={s.migCard}>
              <Text style={s.migVal}>{num(liveMigration.migrated)}</Text>
              <Text style={s.migLabel}>Fully migrated{"\n"}(new platform + Stripe)</Text>
            </View>
            <View style={s.migCard}>
              <Text style={s.migVal}>{num(liveMigration.migration_in_progress)}</Text>
              <Text style={s.migLabel}>Migration started{"\n"}(new platform only)</Text>
            </View>
            <View style={s.migCard}>
              <Text style={s.migVal}>{hasWp ? num(notYetMigrated) : "?"}</Text>
              <Text style={s.migLabel}>Not yet migrated{"\n"}(WordPress only)</Text>
            </View>
          </View>

          {/* Notes */}
          <Text style={s.secHead}>Notes</Text>
          <View style={s.notesBox}>
            {[
              "New platform member figures are live at the time this report was exported.",
              hasWp
                ? `Legacy figures cover members who have not yet moved to the new platform. They are taken from a membership export dated ${wpAsOfDate ?? "unknown"}.`
                : "No legacy membership export has been uploaded. Figures cover new platform members only.",
              "Automated bot registrations are identified by name pattern and excluded from all counts.",
              "Lifetime members are counted as active but are not included in monthly income, as they make a single payment rather than a recurring subscription.",
              `Total collected covers all payments received through the new platform${earliestChargeDate ? ` since ${earliestChargeDate}` : ""}, after deducting any refunds.`,
              liveQuality.payment_failed_count > 0
                ? `${num(liveQuality.payment_failed_count)} member${liveQuality.payment_failed_count !== 1 ? "s" : ""} on the new platform ${liveQuality.payment_failed_count !== 1 ? "have" : "has"} a payment that has failed. Their membership is at risk.`
                : null,
            ]
              .filter(Boolean)
              .map((point, i) => (
                <View key={i} style={{ flexDirection: "row", marginBottom: 3 }}>
                  <Text style={[s.notesText, { width: 10, color: GOLD, fontFamily: "Helvetica-Bold" }]}>-</Text>
                  <Text style={[s.notesText, { flex: 1 }]}>{point as string}</Text>
                </View>
              ))}
          </View>

        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Celtic Supporters Limited  |  Company No. SC862186  |  ICO ZB985030  |  LEI 984500CDVAFEBEF83781
          </Text>
          <Text style={s.footerText}>Confidential</Text>
        </View>

      </Page>
    </Document>
  );
}
