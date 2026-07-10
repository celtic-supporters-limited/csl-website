import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Resend webhook handler — receives email lifecycle events from Resend.
// Currently handles: email.bounced
//
// Security: Resend signs webhooks using Svix. Full Svix signature verification
// requires the `svix` npm package. As a lightweight alternative we check a
// shared secret sent in the Authorization header, configured in Resend Dashboard
// > Webhooks > your endpoint > Header (key: Authorization, value: Bearer <secret>).
// Set RESEND_WEBHOOK_SECRET in Vercel env vars to the same value.
//
// To register this endpoint in Resend:
//   Resend Dashboard > Webhooks > Add endpoint
//   URL: https://celticsupporters.net/api/webhooks/resend
//   Events: email.bounced
//   Header: Authorization: Bearer <RESEND_WEBHOOK_SECRET value>

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type as string | undefined;

  if (type === "email.bounced") {
    const data = (body.data ?? {}) as Record<string, unknown>;
    const toRaw = data.to;
    const toEmail =
      Array.isArray(toRaw) ? (toRaw[0] as string) : (toRaw as string | null);
    const resendId = (data.email_id ?? data.id ?? null) as string | null;

    const db = getSupabase();
    const { error } = await db.from("email_bounces").insert({
      to_email:  toEmail  ?? null,
      resend_id: resendId ?? null,
    });

    if (error) {
      console.error("[resend-webhook] Failed to insert bounce:", error.message);
      return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
    }

    console.log(`[resend-webhook] Bounce recorded: ${toEmail ?? "unknown"}`);
  }

  return NextResponse.json({ received: true });
}
