import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";

/**
 * Package 6 - shared styling and small building blocks for the three AGM
 * documents (RequisitionPdf, ProxyAppointmentPdf, NomineeInstructionPdf).
 * Kept plain deliberately - no images, no embedded fonts beyond
 * @react-pdf/renderer's own Helvetica family - per the brief section 8 size
 * constraint, matching the existing reports.
 */

export const GREEN = "#1B4D2E";
export const GOLD = "#C8A951";
export const GREY = "#6B7280";
export const LGREY = "#E5E7EB";
export const BLACK = "#111827";
export const WHITE = "#FFFFFF";

export const sharedStyles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: BLACK, padding: 0 },
  header: { backgroundColor: GREEN, paddingHorizontal: 30, paddingVertical: 16 },
  hdrOrg: { fontFamily: "Helvetica-Bold", fontSize: 14, color: WHITE, marginBottom: 2 },
  hdrTitle: { fontSize: 10, color: GOLD, letterSpacing: 0.5, textTransform: "uppercase" },
  goldBar: { backgroundColor: GOLD, height: 3 },
  body: { paddingHorizontal: 30, paddingTop: 16, paddingBottom: 40 },

  footerNote: { fontSize: 7.5, color: GREY, lineHeight: 1.5, marginBottom: 14 },

  fieldRow: { flexDirection: "row", marginBottom: 8, borderBottomWidth: 0.5, borderBottomColor: LGREY, paddingBottom: 4 },
  fieldLabel: { width: 160, fontSize: 8, color: GREY, textTransform: "uppercase", letterSpacing: 0.3 },
  fieldValue: { flex: 1, fontSize: 10, color: BLACK },

  sectionHead: { fontFamily: "Helvetica-Bold", fontSize: 9, color: GREEN, textTransform: "uppercase", letterSpacing: 0.6, borderBottomWidth: 1.5, borderBottomColor: GREEN, paddingBottom: 3, marginTop: 14, marginBottom: 8 },

  textBlock: { fontSize: 9.5, color: BLACK, lineHeight: 1.5, marginBottom: 10 },
  textBlockLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: GREY, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 },

  signatureBlock: { flexDirection: "row", gap: 24, marginTop: 16, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: LGREY },
  signatureCol: { flex: 1 },
  signatureValue: { fontSize: 12, fontFamily: "Helvetica-Oblique", marginTop: 4 },

  footer: { position: "absolute", bottom: 16, left: 30, right: 30, borderTopWidth: 0.5, borderTopColor: LGREY, paddingTop: 6 },
  footerText: { fontSize: 7, color: GREY },
});

export function DocHeader({ org, title }: { org: string; title: string }) {
  return (
    <>
      <View style={sharedStyles.header}>
        <Text style={sharedStyles.hdrOrg}>{org}</Text>
        <Text style={sharedStyles.hdrTitle}>{title}</Text>
      </View>
      <View style={sharedStyles.goldBar} />
    </>
  );
}

export function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={sharedStyles.fieldRow}>
      <Text style={sharedStyles.fieldLabel}>{label}</Text>
      <Text style={sharedStyles.fieldValue}>{value}</Text>
    </View>
  );
}

export function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <View>
      <Text style={sharedStyles.textBlockLabel}>{label}</Text>
      <Text style={sharedStyles.textBlock}>{text}</Text>
    </View>
  );
}

export function SignatureBlock({ signatureName, signedAt }: { signatureName: string; signedAt: string }) {
  return (
    <View style={sharedStyles.signatureBlock}>
      <View style={sharedStyles.signatureCol}>
        <Text style={sharedStyles.fieldLabel}>Signature</Text>
        <Text style={sharedStyles.signatureValue}>{signatureName}</Text>
      </View>
      <View style={sharedStyles.signatureCol}>
        <Text style={sharedStyles.fieldLabel}>Date</Text>
        <Text style={sharedStyles.signatureValue}>
          {new Date(signedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </Text>
      </View>
    </View>
  );
}

export function DocFooter({ generatedNote }: { generatedNote: string }) {
  return (
    <View style={sharedStyles.footer}>
      <Text style={sharedStyles.footerText}>{generatedNote}</Text>
    </View>
  );
}
