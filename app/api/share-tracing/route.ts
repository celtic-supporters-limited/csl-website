import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { findOrCreateZohoContact, createZohoCase } from "@/lib/zoho";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const { name, email, enquiryType, yearPurchased, numShares, source, notes } =
    body;

  // Server-side validation
  if (!name?.trim() || !email?.trim() || !enquiryType?.trim()) {
    return NextResponse.json(
      { error: "Name, email, and enquiry type are required." },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Please provide a valid email address." },
      { status: 400 }
    );
  }

  // Build notes field combining optional free-text fields
  const combinedNotes = [
    yearPurchased ? `Year of purchase: ${yearPurchased}` : null,
    numShares ? `Number of shares: ${numShares}` : null,
    notes ? `Additional notes: ${notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { error: dbError } = await getSupabase().from("shareholder_cases").insert({
    contact_name: name.trim(),
    email: email.trim().toLowerCase(),
    case_type: "Share Tracing",
    enquiry_source: source || null,
    notes: combinedNotes || null,
    status: "New",
  });

  if (dbError) {
    console.error("[share-tracing] Supabase insert error:", dbError.message);
    return NextResponse.json(
      { error: "Failed to save your enquiry. Please try again." },
      { status: 500 }
    );
  }

  // Zoho: fire-and-forget, never block or throw
  (async () => {
    try {
      const contactId = await findOrCreateZohoContact(name.trim(), email.trim());
      await createZohoCase(contactId, "Share Tracing", combinedNotes);
    } catch (err) {
      console.error("[share-tracing] Zoho error (non-blocking):", err);
    }
  })();

  return NextResponse.json({ success: true });
}
