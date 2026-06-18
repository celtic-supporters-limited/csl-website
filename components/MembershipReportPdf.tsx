import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { SourceMetrics, DataQualityFlags } from "@/lib/membership-metrics";

// ── Styles ────────────────────────────────────────────────────────────────────

const GREEN  = "#1B4D2E";
const GOLD   = "#C8A951";
const LIGHT  = "#F8F6F1";
const GREY   = "#6B7280";
const LGREY  = "#E5E7EB";
const BLACK  = "#111827";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: BLACK, paddingBottom: 48 },

  // Cover
  coverBg:       { backgroundColor: GREEN, padding: 48, minHeight: 200 },
  coverTitle:    { fontFamily: "Helvetica-Bold", fontSize: 26, color: "#FFFFFF", marginBottom: 6 },
  coverSub:      { fontSize: 12, color: GOLD, marginBottom: 24 },
  coverMeta:     { fontSize: 9, color: "#FFFFFF", opacity: 0.8, marginBottom: 3 },

  // Body padding
  body:          { paddingHorizontal: 40, paddingTop: 28 },

  // Section heading
  sectionHead:   { fontFamily: "Helvetica-Bold", fontSize: 11, color: GREEN,
                   borderBottomWidth: 1.5, borderBottomColor: GREEN,
                   paddingBottom: 3, marginBottom: 10, marginTop: 20 },

  // Stat cards row
  cardRow:       { flexDirection: "row", gap: 10, marginBottom: 20 },
  card:          { flex: 1, backgroundColor: LIGHT, borderRadius: 4, padding: 10 },
  cardValue:     { fontFamily: "Helvetica-Bold", fontSize: 18, color: GREEN, marginBottom: 2 },
  cardLabel:     { fontSize: 7.5, color: GREY, textTransform: "uppercase", letterSpacing: 0.5 },
  cardNote:      { fontSize: 7, color: GREY, marginTop: 2 },

  // Table
  tableHead:     { flexDirection: "row", backgroundColor: GREEN, paddingVertical: 5,
                   paddingHorizontal: 8 },
  tableHeadCell: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#FFFFFF",
                   textTransform: "uppercase", letterSpacing: 0.4 },
  tableRow:      { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8,
                   borderBottomWidth: 0.5, borderBottomColor: LGREY },
  tableRowAlt:   { backgroundColor: LIGHT },
  tableCell:     { fontSize: 8.5, color: BLACK },
  tableCellGrey: { fontSize: 8.5, color: GREY },
  right:         { textAlign: "right" },
  bold:          { fontFamily: "Helvetica-Bold" },

  // Progress bar
  progressBg:    { backgroundColor: LGREY, height: 8, borderRadius: 4, marginTop: 4 },
  progressFill:  { backgroundColor: GOLD,  height: 8, borderRadius: 4 },

  // Methodology box
  methodBox:     { backgroundColor: LIGHT, borderRadius: 4, padding: 12, marginTop: 8 },
  methodText:    { fontSize: 8, color: GREY, lineHeight: 1.5 },

  // Footer
  footer:        { position: "absolute", bottom: 20, left: 40, right: 40,
                   borderTopWidth: 0.5, borderTopColor: LGREY, paddingTop: 6,
                   flexDirection: "row", justifyContent: "space-between" },
  footerText:    { fontSize: 7, color: GREY },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function gbp(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function num(n: number) {
  return n.toLocaleString("en-GB");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Footer({ page }: { page: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        Celtic Supporters Limited  |  Company No. SC862186  |  ICO ZB985030
      </Text>
      <Text style={s.footerText}>{page}</Text>
    </View>
  );
}

function SectionHead({ children }: { children: string }) {
  return <Text style={s.sectionHead}>{children}</Text>;
}

function TableRow({
  cols, widths, alt, grey, bold,
}: {
  cols: (string | number)[];
  widths: string[];
  alt?: boolean;
  grey?: boolean;
  bold?: boolean;
}) {
  return (
    <View style={[s.tableRow, alt ? s.tableRowAlt : {}]}>
      {cols.map((c, i) => (
        <Text
          key={i}
          style={[
            { width: widths[i] },
            i > 0 ? s.right : {},
            grey ? s.tableCellGrey : s.tableCell,
            bold ? s.bold : {},
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

  const statusWidths  = hasWp ? ["34%", "22%", "22%", "22%"] : ["52%", "24%", "24%"];
  const planWidths    = hasWp ? ["40%", "20%", "20%", "20%"] : ["60%", "20%", "20%"];

  return (
    <Document
      title="CSL Membership Report"
      author="Celtic Supporters Limited"
      subject="Membership Statistics"
    >
      {/* ── Page 1 ── */}
      <Page size="A4" style={s.page}>

        {/* Cover band */}
        <View style={s.coverBg}>
          <Text style={s.coverTitle}>Membership Report</Text>
          <Text style={s.coverSub}>Celtic Supporters Limited</Text>
          <Text style={s.coverMeta}>Generated: {generatedAt}</Text>
          <Text style={s.coverMeta}>Company No. SC862186  |  ICO ZB985030  |  LEI 984500CDVAFEBEF83781</Text>
          {wpAsOfDate && (
            <Text style={s.coverMeta}>
              Legacy (WordPress) data as of: {wpAsOfDate}. New platform data: live at time of export.
            </Text>
          )}
        </View>

        <View style={s.body}>

          {/* Key figures */}
          <SectionHead>Key figures</SectionHead>
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
              {earliestChargeDate && (
                <Text style={s.cardNote}>All Stripe payments since {earliestChargeDate}</Text>
              )}
            </View>
          </View>

          {/* Status breakdown */}
          <SectionHead>Membership status breakdown</SectionHead>
          <View style={s.tableHead}>
            <Text style={[s.tableHeadCell, { width: hasWp ? "34%" : "52%" }]}>Status</Text>
            <Text style={[s.tableHeadCell, s.right, { width: hasWp ? "22%" : "24%" }]}>New platform</Text>
            {hasWp && <Text style={[s.tableHeadCell, s.right, { width: "22%" }]}>Legacy (WP)</Text>}
            <Text style={[s.tableHeadCell, s.right, { width: hasWp ? "22%" : "24%" }]}>Total</Text>
          </View>
          {statusRows.map((r, i) => (
            <TableRow
              key={r.label}
              alt={i % 2 === 1}
              bold={r.label === "Active"}
              cols={hasWp
                ? [r.label, num(r.sb), num(r.wp), num(r.total)]
                : [r.label, num(r.sb), num(r.total)]}
              widths={statusWidths}
            />
          ))}

        </View>

        <Footer page="Page 1" />
      </Page>

      {/* ── Page 2 ── */}
      <Page size="A4" style={s.page}>
        <View style={s.body}>

          {/* Plan breakdown */}
          <SectionHead>Active members by plan</SectionHead>
          <View style={s.tableHead}>
            <Text style={[s.tableHeadCell, { width: hasWp ? "40%" : "60%" }]}>Plan</Text>
            <Text style={[s.tableHeadCell, s.right, { width: hasWp ? "20%" : "20%" }]}>New platform</Text>
            {hasWp && <Text style={[s.tableHeadCell, s.right, { width: "20%" }]}>Legacy (WP)</Text>}
            <Text style={[s.tableHeadCell, s.right, { width: "20%" }]}>Total</Text>
          </View>
          {planRows.map((r, i) => (
            <TableRow
              key={r.plan}
              alt={i % 2 === 1}
              cols={hasWp
                ? [r.plan, r.sb > 0 ? num(r.sb) : "-", r.wp > 0 ? num(r.wp) : "-", num(r.total)]
                : [r.plan, r.sb > 0 ? num(r.sb) : "-", num(r.total)]}
              widths={planWidths}
            />
          ))}

          {/* Migration progress */}
          <SectionHead>Migration progress</SectionHead>
          <View style={s.tableHead}>
            <Text style={[s.tableHeadCell, { width: "55%" }]}>Stage</Text>
            <Text style={[s.tableHeadCell, s.right, { width: "45%" }]}>Members</Text>
          </View>
          {[
            { label: "Fully migrated (new platform + active Stripe subscription)", n: liveMigration.migrated },
            { label: "Migration started (new platform, no Stripe subscription yet)", n: liveMigration.migration_in_progress },
            { label: "Not yet migrated (WordPress only)", n: wpData ? ((wpData.active + wpData.cancelled + wpData.expired + wpData.pending + wpData.other)) : 0 },
          ].map((r, i) => (
            <TableRow key={r.label} alt={i % 2 === 1} cols={[r.label, num(r.n)]} widths={["55%", "45%"]} />
          ))}

          {/* Data notes */}
          <SectionHead>Notes on data</SectionHead>
          <View style={s.methodBox}>
            <Text style={s.methodText}>
              New platform figures are drawn live from the CSL membership database (Supabase, EU West region) at the time of export.
              {"\n\n"}
              {hasWp
                ? `Legacy (WordPress) figures are taken from a WordPress PMS Pro export dated ${wpAsOfDate ?? "unknown"}. These cover members who have not yet migrated to the new platform. Legacy billing amounts are used to estimate monthly income for this cohort; the actual amounts collected may differ slightly from the Stripe figures.`
                : "No legacy (WordPress) export has been uploaded. Figures reflect new platform members only."}
              {"\n\n"}
              Spam/bot accounts (identified by automated name pattern matching) are excluded from all counts.
              Lifetime members are included in active member totals but excluded from monthly income figures as they make a single payment rather than a recurring subscription.
              {"\n\n"}
              Total collected (new platform) represents the sum of all successful Stripe charges since{earliestChargeDate ? ` ${earliestChargeDate}` : " launch"}, net of any refunds.
              {"\n\n"}
              {`This report was generated from ${snapshotCount} historical snapshot${snapshotCount !== 1 ? "s" : ""} and live data at ${generatedAt}.`}
            </Text>
          </View>

          {/* Flags */}
          {(liveQuality.payment_failed_count > 0 || liveQuality.no_auth_account_count > 0) && (
            <>
              <SectionHead>Data quality notes</SectionHead>
              <View style={s.methodBox}>
                {liveQuality.payment_failed_count > 0 && (
                  <Text style={[s.methodText, { marginBottom: 4 }]}>
                    {num(liveQuality.payment_failed_count)} member{liveQuality.payment_failed_count !== 1 ? "s" : ""} on the new platform have a failed payment. These are included in the membership count but their subscriptions are at risk.
                  </Text>
                )}
                {liveQuality.no_auth_account_count > 0 && (
                  <Text style={s.methodText}>
                    {num(liveQuality.no_auth_account_count)} member{liveQuality.no_auth_account_count !== 1 ? "s" : ""} do not yet have a linked login account. This does not affect their membership status.
                  </Text>
                )}
              </View>
            </>
          )}

        </View>

        <Footer page="Page 2" />
      </Page>
    </Document>
  );
}
