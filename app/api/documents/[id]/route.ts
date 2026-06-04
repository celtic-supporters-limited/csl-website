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

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

async function verifyAdmin() {
  const authClient = createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) return { user: null, error: "Unauthorized", status: 401 };

  const db = getSupabase();
  const { data: member } = await db
    .from("members")
    .select("is_admin")
    .eq("email", user.email)
    .maybeSingle();

  if (!member?.is_admin) return { user: null, error: "Forbidden", status: 403 };
  return { user, error: null, status: 200 };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error, status } = await verifyAdmin();
  if (!user) return NextResponse.json({ error }, { status });

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute before trying again." },
      { status: 429 }
    );
  }

  let body: {
    title?: string;
    description?: string;
    category?: string;
    drive_url?: string;
    published_at?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { title, description, category, drive_url, published_at } = body;

  if (!title?.trim())
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (title.trim().length > 200)
    return NextResponse.json({ error: "Title must be 200 characters or fewer." }, { status: 400 });
  if (description && description.trim().length > 500)
    return NextResponse.json({ error: "Description must be 500 characters or fewer." }, { status: 400 });
  if (!category || !VALID_CATEGORIES.has(category))
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  if (!drive_url?.trim())
    return NextResponse.json({ error: "Google Drive URL is required." }, { status: 400 });
  if (!drive_url.trim().startsWith("https://drive.google.com/"))
    return NextResponse.json({ error: "URL must start with https://drive.google.com/" }, { status: 400 });
  if (!published_at)
    return NextResponse.json({ error: "Document date is required." }, { status: 400 });

  const db = getSupabase();
  const { error: updateError } = await db
    .from("documents")
    .update({
      title: title.trim(),
      description: description?.trim() || null,
      category,
      drive_url: drive_url.trim(),
      file_url: drive_url.trim(),
      published_at,
    })
    .eq("id", params.id);

  if (updateError) {
    console.error("[api/documents PATCH] Update error:", updateError.message);
    return NextResponse.json({ error: "Failed to update document." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error, status } = await verifyAdmin();
  if (!user) return NextResponse.json({ error }, { status });

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute before trying again." },
      { status: 429 }
    );
  }

  const db = getSupabase();
  const { error: deleteError } = await db
    .from("documents")
    .delete()
    .eq("id", params.id);

  if (deleteError) {
    console.error("[api/documents DELETE] Delete error:", deleteError.message);
    return NextResponse.json({ error: "Failed to delete document." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
