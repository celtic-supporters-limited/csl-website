// Zoho CRM integration — stubbed for Phase 2, wired up in a later phase.
// All calls are fire-and-forget: they must never throw or block a form submission.

export async function findOrCreateZohoContact(
  name: string,
  email: string
): Promise<string | null> {
  void name;
  void email;
  console.log("[Zoho stub] findOrCreateZohoContact called — not yet wired");
  return null;
}

export async function createZohoCase(
  contactId: string | null,
  caseType: string,
  notes: string
): Promise<void> {
  void contactId;
  void caseType;
  void notes;
  console.log("[Zoho stub] createZohoCase called — not yet wired");
}
