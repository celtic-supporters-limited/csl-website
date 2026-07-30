import type { Metadata } from "next";
import { getSupabase } from "@/lib/supabase";
import { applyFieldEdit } from "@/lib/agm-change-log";

export const metadata: Metadata = { title: "Confirm your instruction - Celtic Supporters Limited" };

/**
 * Package 6, section 7 - the nominee holder's return journey. No HMAC, no
 * secret, no environment variable: the record's own id is the token,
 * carrying the same 122 bits of randomness a signed token would add nothing
 * to defend, per the brief's own reasoning for dropping the earlier HMAC
 * design. One route, no table, no login, no session.
 *
 * force-dynamic, not because of a gate this time, but because this page
 * performs a write on every load for a not-yet-confirmed link - caching it
 * would mean a second visitor's request could be served a stale render that
 * never actually ran the flip.
 *
 * Idempotent: if nominee_instruction_sent is already true, this does not
 * write again or log again, and still shows the same confirmation message.
 * No expiry - there is no security value in one, and an expired link only
 * produces a support email (brief section 7).
 */
export const dynamic = "force-dynamic";

function Shell({ heading, message }: { heading: string; message: string }) {
  return (
    <section className="bg-csl-light min-h-[60vh] flex items-center justify-center px-[5%] py-[72px]">
      <div className="text-center max-w-[520px]">
        <div className="text-5xl mb-5 text-csl-dark">&#10003;</div>
        <h1 className="text-[2rem] font-extrabold text-csl-dark mb-3">{heading}</h1>
        <p className="text-gray-600 leading-[1.7]">{message}</p>
      </div>
    </section>
  );
}

export default async function ConfirmNomineeInstructionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = getSupabase();
  const { data: row } = await db
    .from("agm_proxies")
    .select("id, full_name, how_held, nominee_instruction_sent")
    .eq("id", id)
    .maybeSingle();

  if (!row || row.how_held !== "nominee") {
    return (
      <Shell
        heading="This link is not valid"
        message="We could not find a matching proxy instruction. If you believe this is wrong, contact info@celticsupporters.net."
      />
    );
  }

  if (!row.nominee_instruction_sent) {
    const result = await applyFieldEdit({
      table: "agm_proxies",
      id: row.id,
      changes: { nominee_instruction_sent: true },
      changedBy: `${row.full_name} (confirmed via emailed link)`,
      reason: "Member confirmed sending their instruction to their platform.",
    });
    if (!result.ok) {
      console.error("[proxy/confirm] could not record confirmation:", result.error);
      return (
        <Shell
          heading="Something went wrong"
          message="We could not record your confirmation just now. Please try this link again shortly, or contact info@celticsupporters.net."
        />
      );
    }
  }

  return (
    <Shell
      heading="Thank you"
      message={`We've recorded that ${row.full_name} has sent the instruction to their platform. There is nothing further for you to do.`}
    />
  );
}
