import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { findOrCreateZohoContact, createZohoCase } from "@/lib/zoho";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, numShares, yearPurchased, source } = body;

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json(
      { error: "Name and email are required." },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Please provide a valid email address." },
      { status: 400 }
    );
  }

  const notes = [
    numShares ? `Number of shares: ${numShares}` : null,
    yearPurchased ? `Year of purchase: ${yearPurchased}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { error: dbError } = await getSupabase()
    .from("shareholder_cases")
    .insert({
      contact_name: name.trim(),
      email: email.trim().toLowerCase(),
      case_type: "Proxy Assignment",
      enquiry_source: source || null,
      notes: notes || null,
      status: "New",
    });

  if (dbError) {
    console.error("[proxy] Supabase insert error:", dbError.message);
    return NextResponse.json(
      { error: "Failed to save your registration. Please try again." },
      { status: 500 }
    );
  }

  // Zoho: fire-and-forget, never block or throw
  (async () => {
    try {
      const contactId = await findOrCreateZohoContact(name.trim(), email.trim());
      await createZohoCase(contactId, "Proxy Assignment", notes);
    } catch (err) {
      console.error("[proxy] Zoho error (non-blocking):", err);
    }
  })();

  return NextResponse.json({ success: true });
}
