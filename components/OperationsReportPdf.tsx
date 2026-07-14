import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

// ── Palette ───────────────────────────────────────────────────────────────────

const GREEN  = "#1B4D2E";
const GOLD   = "#C8A951";
const LIGHT  = "#F8F6F1";
const GREY   = "#6B7280";
const LGREY  = "#E5E7EB";
const BLACK  = "#111827";
const WHITE  = "#FFFFFF";
const RED    = "#B91C1C";
const AMBER  = "#92400E";
const AMBERBG = "#FEF9EC";
const REDBG   = "#FEF2F2";
const GREENBG = "#E8F5EE";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TrafficLight = "green" | "amber" | "red";

export type BackupRow = {
  ran_at: string;
  status: string;
  total_rows: number | null;
  table_counts: Record<string, number> | null;
  error_msg: string | null;
};

export type OperationsReportData = {
  generatedAt: string;
  period: string;
  overall: TrafficLight;
  resend: {
    todayCount: number;
    monthCount: number;
    bounceCount: number;
    bounceRatePct: number;
    todayStatus: TrafficLight;
    monthStatus: TrafficLight;
    bounceStatus: TrafficLight;
  };
  stripe: {
    ok: boolean;
    latencyMs: number;
    mode: "test" | "live" | "unknown";
  };
  supabase: {
    dbSizeMb: number;
    dbStatus: TrafficLight;
  };
  backup: {
    lastSuccess: BackupRow | null;
    lastSuccessAgeHours: number | null;
    backupStatus: TrafficLight;
    recentRuns: BackupRow[];
  };
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page:        { fontFamily: "Helvetica", fontSize: 8, color: BLACK, paddingBottom: 36 },

  header:      { backgroundColor: GREEN, paddingHorizontal: 30, paddingVertical: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  hdrOrg:      { fontFamily: "Helvetica-Bold", fontSize: 15, color: WHITE, marginBottom: 2 },
  hdrTitle:    { fontSize: 9, color: GOLD, letterSpacing: 0.5 },
  hdrRight:    { flexDirection: "column", alignItems: "flex-end" },
  hdrBadge:    { backgroundColor: GOLD, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2, marginBottom: 4 },
  hdrBadgeText:{ fontFamily: "Helvetica-Bold", fontSize: 7.5, color: GREEN, textTransform: "uppercase", letterSpacing: 0.5 },
  hdrMeta:     { fontSize: 7, color: WHITE, opacity: 0.75, marginBottom: 1 },

  goldBar:     { backgroundColor: GOLD, height: 3 },

  body:        { paddingHorizontal: 28, paddingTop: 14 },

  secHead:     { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: GREEN, textTransform: "uppercase", letterSpacing: 0.6, borderBottomWidth: 1.5, borderBottomColor: GREEN, paddingBottom: 3, marginBottom: 8 },

  statusBanner:{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 3, marginBottom: 10 },
  bannerDot:   { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  bannerText:  { fontFamily: "Helvetica-Bold", fontSize: 8.5 },

  pillRow:     { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 10 },
  pill:        { flexDirection: "row", alignItems: "center", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 2, borderWidth: 0.5, borderColor: LGREY },
  pillDot:     { width: 5, height: 5, borderRadius: 3, marginRight: 4 },
  pillText:    { fontSize: 7, color: GREY },

  cardRow:     { flexDirection: "row", gap: 8, marginBottom: 10 },
  execCard:    { flex: 1, borderWidth: 0.5, borderColor: LGREY, borderRadius: 3, padding: 8, alignItems: "center" },
  execVal:     { fontFamily: "Helvetica-Bold", fontSize: 15, color: GREEN, marginBottom: 2 },
  execLabel:   { fontSize: 6.5, color: GREY, textTransform: "uppercase", letterSpacing: 0.4 },

  cols:        { flexDirection: "row", gap: 12, marginBottom: 10 },
  col:         { flex: 1 },

  tHead:       { flexDirection: "row", backgroundColor: GREEN, paddingVertical: 4, paddingHorizontal: 6 },
  tHeadCell:   { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: WHITE, textTransform: "uppercase", letterSpacing: 0.3 },
  tRow:        { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: LGREY },
  tRowAlt:     { backgroundColor: LIGHT },
  tCell:       { fontSize: 7.5, color: BLACK },
  tCellGrey:   { fontSize: 7.5, color: GREY },
  tCellGreen:  { fontSize: 7.5, color: GREEN, fontFamily: "Helvetica-Bold" },
  tCellAmber:  { fontSize: 7.5, color: AMBER, fontFamily: "Helvetica-Bold" },
  tCellRed:    { fontSize: 7.5, color: RED, fontFamily: "Helvetica-Bold" },
  right:       { textAlign: "right" },
  bold:        { fontFamily: "Helvetica-Bold" },

  notesBox:    { borderLeftWidth: 2, borderLeftColor: GOLD, paddingLeft: 8, paddingVertical: 5, marginTop: 8 },
  notesText:   { fontSize: 7, color: GREY, lineHeight: 1.5 },

  upgradeTotal:{ flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, backgroundColor: LIGHT, borderTopWidth: 1, borderTopColor: GREEN },
  upgradeTotalCell: { fontFamily: "Helvetica-Bold", fontSize: 8, color: GREEN },

  footer:      { position: "absolute", bottom: 14, left: 28, right: 28, borderTopWidth: 0.5, borderTopColor: LGREY, paddingTop: 4, flexDirection: "row", justifyContent: "space-between" },
  footerText:  { fontSize: 6.5, color: GREY },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function dotColor(t: TrafficLight) {
  return t === "red" ? RED : t === "amber" ? "#D97706" : "#16A34A";
}

function bannerBg(t: TrafficLight) {
  return t === "red" ? REDBG : t === "amber" ? AMBERBG : GREENBG;
}

function bannerColor(t: TrafficLight) {
  return t === "red" ? RED : t === "amber" ? AMBER : GREEN;
}

function bannerMsg(t: TrafficLight) {
  return t === "red"
    ? "One or more services require immediate attention."
    : t === "amber"
    ? "One or more services are approaching their free-tier limit."
    : "All services are operating within safe limits.";
}

function statusLabel(t: TrafficLight) {
  return t === "red" ? "Critical" : t === "amber" ? "Warning" : "Healthy";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

function StatusCell({ t, children }: { t: TrafficLight; children: string }) {
  const color = t === "red" ? RED : t === "amber" ? AMBER : GREEN;
  return <Text style={[s.tCell, { color, fontFamily: "Helvetica-Bold" }]}>{children}</Text>;
}

// ── PDF document ──────────────────────────────────────────────────────────────

export function OperationsReportPdf(d: OperationsReportData) {
  return (
    <Document title="CSL Operational Status Report" author="Celtic Supporters Limited">
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.hdrOrg}>Celtic Supporters Limited</Text>
            <Text style={s.hdrTitle}>OPERATIONAL STATUS REPORT</Text>
          </View>
          <View style={s.hdrRight}>
            <View style={s.hdrBadge}><Text style={s.hdrBadgeText}>Confidential</Text></View>
            <Text style={s.hdrMeta}>Generated: {d.generatedAt}</Text>
            <Text style={s.hdrMeta}>Prepared by: Member Portal Admin</Text>
            <Text style={s.hdrMeta}>Period: {d.period}</Text>
          </View>
        </View>
        <View style={s.goldBar} />

        <View style={s.body}>

          {/* Executive summary */}
          <Text style={[s.secHead, { marginTop: 10 }]}>Executive summary</Text>

          <View style={[s.statusBanner, { backgroundColor: bannerBg(d.overall) }]}>
            <View style={[s.bannerDot, { backgroundColor: dotColor(d.overall) }]} />
            <Text style={[s.bannerText, { color: bannerColor(d.overall) }]}>{bannerMsg(d.overall)}</Text>
          </View>

          <View style={s.cardRow}>
            <View style={s.execCard}>
              <Text style={s.execVal}>{d.resend.monthCount}</Text>
              <Text style={s.execLabel}>Emails this month</Text>
            </View>
            <View style={s.execCard}>
              <Text style={s.execVal}>{d.stripe.ok ? `${d.stripe.latencyMs} ms` : "Error"}</Text>
              <Text style={s.execLabel}>Stripe response</Text>
            </View>
            <View style={s.execCard}>
              <Text style={s.execVal}>{d.supabase.dbSizeMb} MB</Text>
              <Text style={s.execLabel}>Database size</Text>
            </View>
            <View style={s.execCard}>
              <Text style={s.execVal}>{d.backup.lastSuccess ? `${Math.round(d.backup.lastSuccessAgeHours ?? 0)}h` : "None"}</Text>
              <Text style={s.execLabel}>Last backup age</Text>
            </View>
          </View>

          <View style={s.pillRow}>
            {[
              { label: `Resend ${statusLabel(d.resend.todayStatus === "red" || d.resend.monthStatus === "red" ? "red" : d.resend.todayStatus === "amber" || d.resend.monthStatus === "amber" ? "amber" : "green")}`, t: (d.resend.todayStatus === "red" || d.resend.monthStatus === "red" ? "red" : d.resend.todayStatus === "amber" || d.resend.monthStatus === "amber" ? "amber" : "green") as TrafficLight },
              { label: `Stripe ${d.stripe.mode === "test" ? "- test mode" : d.stripe.ok ? "connected" : "error"}`, t: (!d.stripe.ok ? "red" : d.stripe.mode === "test" ? "amber" : "green") as TrafficLight },
              { label: `Database ${statusLabel(d.supabase.dbStatus)}`, t: d.supabase.dbStatus },
              { label: `Backup ${statusLabel(d.backup.backupStatus)}`, t: d.backup.backupStatus },
            ].map((p) => (
              <View key={p.label} style={s.pill}>
                <View style={[s.pillDot, { backgroundColor: dotColor(p.t) }]} />
                <Text style={s.pillText}>{p.label}</Text>
              </View>
            ))}
          </View>

          {/* Service status */}
          <Text style={s.secHead}>Service status</Text>

          <View style={s.cols}>
            <View style={s.col}>
              {/* Resend */}
              <View style={s.tHead}>
                <Text style={[s.tHeadCell, { flex: 1 }]}>Resend - email delivery</Text>
                <Text style={[s.tHeadCell, { width: 50, textAlign: "right" }]}>Usage</Text>
                <Text style={[s.tHeadCell, { width: 36, textAlign: "right" }]}>Status</Text>
              </View>
              {[
                { label: "Emails today", val: `${d.resend.todayCount} / 100`, t: d.resend.todayStatus },
                { label: "Emails this month", val: `${d.resend.monthCount} / 3,000`, t: d.resend.monthStatus },
                { label: "Bounce rate", val: `${d.resend.bounceRatePct.toFixed(1)}%`, t: d.resend.bounceStatus },
              ].map((row, i) => (
                <View key={row.label} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={[s.tCell, { flex: 1 }]}>{row.label}</Text>
                  <Text style={[s.tCell, s.right, { width: 50 }]}>{row.val}</Text>
                  <StatusCell t={row.t}>{statusLabel(row.t)}</StatusCell>
                </View>
              ))}

              <View style={{ marginTop: 8 }} />

              {/* Stripe */}
              <View style={s.tHead}>
                <Text style={[s.tHeadCell, { flex: 1 }]}>Stripe - payments API</Text>
                <Text style={[s.tHeadCell, { width: 86, textAlign: "right" }]}>Value</Text>
              </View>
              {[
                { label: "API connectivity", val: d.stripe.ok ? "Connected" : "Error", t: (d.stripe.ok ? "green" : "red") as TrafficLight },
                { label: "Response time", val: d.stripe.ok ? `${d.stripe.latencyMs} ms` : "-", t: "green" as TrafficLight },
                { label: "Key mode", val: d.stripe.mode === "test" ? "Test (pre-live)" : d.stripe.mode === "live" ? "Live" : "Unknown", t: (d.stripe.mode === "live" ? "green" : d.stripe.mode === "test" ? "amber" : "red") as TrafficLight },
              ].map((row, i) => (
                <View key={row.label} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={[s.tCell, { flex: 1 }]}>{row.label}</Text>
                  <StatusCell t={row.t}>{row.val}</StatusCell>
                </View>
              ))}
            </View>

            <View style={s.col}>
              {/* Supabase */}
              <View style={s.tHead}>
                <Text style={[s.tHeadCell, { flex: 1 }]}>Supabase - database</Text>
                <Text style={[s.tHeadCell, { width: 60, textAlign: "right" }]}>Value</Text>
              </View>
              {[
                { label: "Database size", val: `${d.supabase.dbSizeMb} / 500 MB`, t: d.supabase.dbStatus },
                { label: "Active projects", val: "2 / 2", t: "amber" as TrafficLight },
                { label: "Auto-pause threshold", val: "7 days", t: "green" as TrafficLight },
                { label: "Cron headroom", val: "4 days", t: "green" as TrafficLight },
                { label: "Point-in-time recovery", val: "Not available", t: "amber" as TrafficLight },
              ].map((row, i) => (
                <View key={row.label} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={[s.tCell, { flex: 1 }]}>{row.label}</Text>
                  <StatusCell t={row.t}>{row.val}</StatusCell>
                </View>
              ))}

              <View style={{ marginTop: 8 }} />

              {/* Vercel */}
              <View style={s.tHead}>
                <Text style={[s.tHeadCell, { flex: 1 }]}>Vercel - hosting</Text>
                <Text style={[s.tHeadCell, { width: 60, textAlign: "right" }]}>Value</Text>
              </View>
              {[
                { label: "Cron slots", val: "1 / 1", t: "amber" as TrafficLight },
                { label: "Function timeout", val: "10 s max", t: "amber" as TrafficLight },
                { label: "Bandwidth", val: "100 GB / month", t: "green" as TrafficLight },
                { label: "Team access", val: "1 person", t: "amber" as TrafficLight },
                { label: "Uptime SLA", val: "None", t: "amber" as TrafficLight },
              ].map((row, i) => (
                <View key={row.label} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={[s.tCell, { flex: 1 }]}>{row.label}</Text>
                  <StatusCell t={row.t}>{row.val}</StatusCell>
                </View>
              ))}
            </View>
          </View>

          {/* Database backup */}
          <Text style={s.secHead}>Database backup history</Text>

          <View style={s.tHead}>
            <Text style={[s.tHeadCell, { width: 110 }]}>Date / time (UTC)</Text>
            <Text style={[s.tHeadCell, { width: 55 }]}>Outcome</Text>
            <Text style={[s.tHeadCell, { width: 55, textAlign: "right" }]}>Total rows</Text>
            <Text style={[s.tHeadCell, { width: 55, textAlign: "right" }]}>Members</Text>
            <Text style={[s.tHeadCell, { flex: 1, textAlign: "right" }]}>Trigger</Text>
          </View>
          {d.backup.recentRuns.slice(0, 6).map((row, i) => {
            const isOk = row.status === "success";
            return (
              <View key={i} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                <Text style={[s.tCell, { width: 110 }]}>{fmtDate(row.ran_at)}</Text>
                <Text style={[s.tCell, { width: 55, color: isOk ? GREEN : RED, fontFamily: "Helvetica-Bold" }]}>{isOk ? "Success" : "Failed"}</Text>
                <Text style={[s.tCell, s.right, { width: 55 }]}>{row.total_rows?.toLocaleString("en-GB") ?? "-"}</Text>
                <Text style={[s.tCell, s.right, { width: 55 }]}>{row.table_counts?.members?.toLocaleString("en-GB") ?? "-"}</Text>
                <Text style={[s.tCell, s.right, { flex: 1 }]}>Scheduled</Text>
              </View>
            );
          })}
          <View style={s.notesBox}>
            <Text style={s.notesText}>
              Note: This is a CSV export workaround. Point-in-time recovery is not available on the Supabase free tier.
              Upgrading to Supabase Pro provides 7-day PITR with automated daily snapshots managed by Supabase infrastructure.
            </Text>
          </View>

          {/* Upgrade recommendations */}
          <Text style={[s.secHead, { marginTop: 12 }]}>Upgrade recommendations and forecast cost</Text>

          <View style={s.tHead}>
            <Text style={[s.tHeadCell, { width: 55 }]}>Service</Text>
            <Text style={[s.tHeadCell, { width: 100 }]}>Current limit</Text>
            <Text style={[s.tHeadCell, { flex: 1 }]}>Upgrade trigger</Text>
            <Text style={[s.tHeadCell, { width: 60, textAlign: "right" }]}>Pro cost</Text>
            <Text style={[s.tHeadCell, { width: 100, textAlign: "right" }]}>Key benefit</Text>
          </View>
          {[
            {
              svc: "Resend",
              limit: "100/day · 3,000/month",
              trigger: "Migration send of ~487 members risks daily cap in a single run",
              cost: "£20 / month",
              benefit: "50,000/month, no daily cap",
              t: "amber" as TrafficLight,
            },
            {
              svc: "Supabase",
              limit: "500 MB · 2 projects · auto-pause",
              trigger: "Go-live: auto-pause risks portal outages; no PITR for recovery",
              cost: "£25 / month",
              benefit: "8 GB · 7-day PITR · no auto-pause",
              t: "amber" as TrafficLight,
            },
            {
              svc: "Vercel",
              limit: "1 cron · 10 s timeout · 1 user",
              trigger: "Second scheduled job needed; Martin requires collaborator access",
              cost: "£20 / month",
              benefit: "40 crons · 60 s timeout · team",
              t: "amber" as TrafficLight,
            },
          ].map((row, i) => (
            <View key={row.svc} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
              <Text style={[s.tCell, s.bold, { width: 55 }]}>{row.svc}</Text>
              <Text style={[s.tCellGrey, { width: 100 }]}>{row.limit}</Text>
              <Text style={[s.tCellGrey, { flex: 1 }]}>{row.trigger}</Text>
              <Text style={[s.tCell, s.bold, s.right, { width: 60 }]}>{row.cost}</Text>
              <Text style={[s.tCellGrey, s.right, { width: 100 }]}>{row.benefit}</Text>
            </View>
          ))}
          <View style={s.upgradeTotal}>
            <Text style={[s.upgradeTotalCell, { flex: 1 }]}>Full Pro stack - all three services</Text>
            <Text style={[s.upgradeTotalCell, { width: 60, textAlign: "right" }]}>£65 / month</Text>
            <Text style={[s.tCellGrey, { width: 100, textAlign: "right" }]}>Recommended pre-migration</Text>
          </View>
          <View style={s.notesBox}>
            <Text style={s.notesText}>
              Resend upgrade is a pre-migration requirement if bulk welcome emails are sent in a single day.
              Supabase upgrade is the highest priority - auto-pause poses a production availability risk once members rely on the portal daily.
              Vercel upgrade can follow once team access is required. Upgrading all three removes the most significant operational
              risks at £65/month, equivalent to approximately 6.5 new Standard memberships per month.
            </Text>
          </View>

        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Celtic Supporters Limited · Company No. SC862186 · ICO ZB985030 · LEI 984500CDVAFEBEF83781</Text>
          <Text style={s.footerText}>Confidential - for internal use only</Text>
        </View>

      </Page>
    </Document>
  );
}
