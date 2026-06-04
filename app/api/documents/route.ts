import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getSupabase } from "@/lib/supabase";

const VALID_CATEGORIES = new Set([
  "Meeting Minutes",
  "Research & Papers",
  "AGM Documents",
  "Governance",
  "Guides & Templates",
  "Recordings",
]);

const VALID_FILE_TYPES = new Set(["PDF", "DOCX", "XLSX", "PPTX"]);

export async function POST(req: NextRequest) {
  // Verify session
  const authClient = createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check is_admin
  const db = getSupabase();
  const { data: member } = await db
    .from("members")
    .select("is_admin")
    .eq("email", user.email)
    .maybeSingle();

  if (!member?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    title?: string;
    description?: string;
    category?: string;
    drive_url?: string;
    file_type?: string;
    published_at?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { title, description, category, drive_url, file_type, published_at } = body;

  if (!title?.trim())
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!category || !VALID_CATEGORIES.has(category))
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  if (!drive_url?.trim())
    return NextResponse.json({ error: "Google Drive URL is required." }, { status: 400 });
  if (!file_type || !VALID_FILE_TYPES.has(file_type))
    return NextResponse.json({ error: "Invalid file type." }, { status: 400 });
  if (!published_at)
    return NextResponse.json({ error: "Document date is required." }, { status: 400 });

  const { data, error } = await db
    .from("documents")
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      category,
      drive_url: drive_url.trim(),
      file_url: drive_url.trim(),
      file_type,
      published_at,
      members_only: true,
      is_published: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[api/documents POST] Insert error:", error.message);
    return NextResponse.json({ error: "Failed to save document." }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}
