/**
 * Package 6 - every piece of email and PDF boilerplate text this package
 * introduces, in one file, so it can be replaced in a single pass with the
 * director. Everything here is TBD placeholder text per the package brief
 * section 9: factual, not persuasive, but not yet reviewed.
 *
 * What is NOT here: the resolution/declaration/consent/supporting-statement
 * text (comes from each signature's own snapshot columns), the Computershare
 * postal address and Investor Centre reference (sourced verbatim from
 * Celtic's own published Notice of AGM 2025, notes 2-3, not placeholder),
 * and Brian McLaughlin's name (lib/agm-appointee.ts, a board decision, not
 * copy).
 */

export const COMPUTERSHARE_ADDRESS =
  "Computershare Investor Services PLC, The Pavilions, Bridgwater Road, Bristol BS13 8AE";

export const COMPUTERSHARE_INVESTOR_CENTRE_NOTE =
  "Investor Centre is faster and carries no risk of the post missing the 24-hour deadline before the meeting.";

// ── Email subjects and body copy, one per flow in the section 6 table ──────────
// TBD: factual, not persuasive, per section 9 - not yet reviewed by the director.

export const P6_COPY = {
  requisitionSignature: {
    subject: "Your Celtic plc AGM requisition signature - TBD",
    intro: "TBD: Thank you for signing the shareholder requisition. Your completed requisition form is attached as a PDF - it shows exactly what you agreed to.",
    nextStep: "TBD: There is nothing further for you to do. Celtic Supporters Limited will lodge the requisition once enough qualifying signatures have been collected.",
  },
  requisitionSupporter: {
    subject: "Thank you for registering your support - TBD",
    intro: "TBD: Thank you for registering your support for the Celtic plc shareholder requisition. As a non-shareholder, you cannot sign the requisition itself, but your support has been recorded.",
    nextStep: "TBD: If you would like to do more, consider joining Celtic Supporters Limited as a member.",
  },
  proxyInterestPreNotice: {
    subject: "Thank you for registering interest in appointing a proxy - TBD",
    intro: "TBD: Thank you for registering your interest in appointing a proxy for the Celtic plc Annual General Meeting.",
    nextStep: "TBD: There is nothing further for you to do yet. Celtic Supporters Limited will contact you once Celtic plc issues the formal Notice of AGM and full appointment opens.",
  },
  proxyAppointmentWeLodge: {
    subject: "Your Celtic plc AGM proxy appointment - TBD",
    intro: "TBD: Thank you for appointing Brian McLaughlin as your proxy for the Celtic plc Annual General Meeting. Your completed appointment is attached as a PDF - it shows exactly what you agreed to.",
    nextStep: "TBD: There is nothing further for you to do. Celtic Supporters Limited will lodge your appointment with Computershare ahead of the deadline.",
  },
  proxyAppointmentMemberLodges: {
    subject: "Your Celtic plc AGM proxy appointment - action needed - TBD",
    intro: "TBD: Thank you for appointing Brian McLaughlin as your proxy for the Celtic plc Annual General Meeting. Your completed appointment is attached as a PDF.",
    nextStep: `TBD: You chose to lodge this appointment yourself. Either post the signed form to ${COMPUTERSHARE_ADDRESS}, or appoint Brian McLaughlin through Computershare's online Investor Centre. ${COMPUTERSHARE_INVESTOR_CENTRE_NOTE} It must arrive no later than 24 hours before the meeting.`,
  },
  proxyAppointmentNominee: {
    subject: "Your Celtic plc AGM proxy instruction - please confirm once sent - TBD",
    intro: "TBD: Thank you for completing your proxy instruction for the Celtic plc Annual General Meeting. Your instruction is attached as a PDF, and the same text is below so you can copy it into an email to your platform if that is easier.",
    nextStep: "TBD: Send this instruction to your platform through your own account - Celtic Supporters Limited never asks for your platform login. Once you have sent it, please confirm using the link below so we know to expect your vote.",
    confirmButtonLabel: "TBD: I have sent this instruction",
  },
} as const;

// ── PDF boilerplate ─────────────────────────────────────────────────────────────
// TBD: shown on the documents themselves, above the signatory's own snapshot
// text, so the reader knows what the document is and when it was generated.

export const P6_PDF_COPY = {
  requisitionFooter:
    "TBD: This document is a record of a shareholder requisition signature submitted online to Celtic Supporters Limited. It shows the resolution, supporting statement, declaration and consent exactly as displayed to the signatory at the time of signing.",
  appointmentFooter:
    "TBD: This document is a record of a proxy appointment submitted online to Celtic Supporters Limited. It shows the declaration exactly as displayed to the signatory at the time of signing.",
  nomineeInstructionFooter:
    "TBD: This document is the instruction to send to your platform or broker so they vote your shares in accordance with your wishes. Celtic Supporters Limited never asks for your platform login.",
} as const;
