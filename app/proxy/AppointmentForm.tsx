"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { APPOINTEE_LABEL } from "@/lib/agm-appointee";

type FormState = "idle" | "submitting" | "success" | "error" | "duplicate";
type HowHeld = "direct" | "nominee" | "";

const inputClass =
  "w-full px-3.5 py-2.5 border-[1.5px] border-gray-200 rounded-lg text-[0.92rem] font-[inherit] transition-colors duration-200 focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10";
const labelClass = "block text-[0.85rem] font-semibold text-gray-800 mb-1.5";
const radioClass = "w-4 h-4 accent-csl-dark shrink-0";
const hintClass = "text-[0.78rem] text-gray-500 mb-1.5";
const branchClass = "mb-5 pl-4 border-l-2 border-csl-light";

/**
 * Full proxy appointment - Package 5. No shareholder/supporter branch like
 * ResolutionForm: everyone using this form is attempting to appoint a proxy,
 * which only a shareholder can do, so there is no equivalent of the
 * resolution's supporter path here.
 *
 * The appointee is never a field on this form. APPOINTEE_LABEL is rendered
 * as text the signatory reads before agreeing to the declaration; there is
 * no input the client could use to change it, matching the server, which
 * never reads one from the request body either.
 */
export default function AppointmentForm({
  nomineePlatforms,
  shareBands,
  declarationText,
}: {
  nomineePlatforms: string[];
  shareBands: string[];
  declarationText: string;
}) {
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [firstName, setFirstName] = useState("");
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  const [howHeld, setHowHeld] = useState<HowHeld>("");
  const [platform, setPlatform] = useState("");
  const [instructionSent, setInstructionSent] = useState(false);
  // Direct holders only - Celtic's Notice of AGM 2025, note 2: the exact
  // number of shares must be stated, and a band cannot satisfy that.
  const [sharesHeldExact, setSharesHeldExact] = useState("");
  const [lodgementPath, setLodgementPath] = useState<"we-lodge" | "member-lodges">("we-lodge");

  const [prefillName, setPrefillName] = useState("");
  const [prefillEmail, setPrefillEmail] = useState("");

  const [consent, setConsent] = useState(false);

  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const turnstileRef = useRef<TurnstileInstance>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      setPrefillEmail(user.email);
      const { data: member } = await supabase
        .from("members")
        .select("first_name, last_name, name")
        .eq("email", user.email)
        .maybeSingle();
      if (!member) return;
      const full =
        member.first_name && member.last_name
          ? `${member.first_name} ${member.last_name}`
          : (member.name ?? "");
      if (full) setPrefillName(full);
    })();
  }, []);

  useEffect(() => {
    if (state === "success" && successRef.current) {
      successRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if ((state === "error" || state === "duplicate") && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [state]);

  function resetTurnstile() {
    turnstileRef.current?.reset();
    setTurnstileToken("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    if (fd.get("hp_field")) { setState("success"); return; }
    if (!turnstileToken) {
      setTurnstileError("Security check not completed. Please wait a moment.");
      return;
    }
    setTurnstileError("");

    setState("submitting");
    setErrorMsg("");

    const payload = {
      hpField:                fd.get("hp_field"),
      fullName:               fd.get("fullName"),
      addressLine1:           fd.get("addressLine1"),
      addressLine2:           fd.get("addressLine2"),
      addressTown:            fd.get("addressTown"),
      addressPostcode:        fd.get("addressPostcode"),
      email:                  fd.get("email"),
      howHeld,
      computershareSrn:       fd.get("computershareSrn"),
      nomineePlatform:        platform,
      nomineePlatformOther:   fd.get("nomineePlatformOther"),
      sharesHeld:             fd.get("sharesHeld"),
      sharesHeldExact:        howHeld === "direct" ? sharesHeldExact : undefined,
      shareClass:             fd.get("shareClass"),
      consentGiven:           consent,
      signatureName:          fd.get("signatureName"),
      nomineeInstructionSent: howHeld === "nominee" ? instructionSent : undefined,
      lodgementPath:          howHeld === "direct" ? lodgementPath : undefined,
      turnstileToken,
    };

    try {
      const res = await fetch("/api/proxy/appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean; error?: string; firstName?: string; duplicate?: boolean; id?: string;
      };

      if (res.status === 409 || data.duplicate) {
        setErrorMsg(data.error ?? "We already have an appointment from this email address.");
        setState("duplicate");
        resetTurnstile();
        return;
      }
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setState("error");
        resetTurnstile();
        return;
      }
      setFirstName(data.firstName ?? "");
      setAppointmentId(data.id ?? null);
      setState("success");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setState("error");
      resetTurnstile();
    }
  }

  if (state === "success") {
    return (
      <div ref={successRef} className="bg-csl-light rounded-2xl text-center px-8 py-16 max-w-[560px] mx-auto">
        <div className="text-5xl mb-4 text-csl-dark">&#10003;</div>
        <h2 className="text-2xl font-extrabold text-csl-dark mb-3">
          Proxy appointment recorded
        </h2>
        <p className="text-gray-700 max-w-[440px] mx-auto mb-4">
          Thank you{firstName ? `, ${firstName}` : ""}. You have appointed {APPOINTEE_LABEL} as your
          proxy for the Annual General Meeting. A copy has been emailed to you.
        </p>

        {howHeld === "direct" && lodgementPath === "we-lodge" && (
          <p className="text-gray-700 max-w-[440px] mx-auto mb-6 text-[0.9rem]">
            CSL will lodge your appointment with Computershare ahead of the deadline.
          </p>
        )}

        {howHeld === "direct" && lodgementPath === "member-lodges" && (
          <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 text-left text-[0.85rem] text-gray-700 leading-relaxed max-w-[440px] mx-auto">
            <p className="font-semibold text-csl-dark mb-2">You chose to lodge this appointment yourself</p>
            <p className="mb-2">Either post the signed form to Computershare Investor Services PLC, The Pavilions, Bridgwater Road, Bristol BS13 8AE, or appoint {APPOINTEE_LABEL} yourself through Computershare&apos;s online Investor Centre.</p>
            <p>It must arrive no later than 24 hours before the meeting. Investor Centre is faster and avoids any risk of the post missing the deadline.</p>
          </div>
        )}

        {howHeld === "nominee" && (
          <p className="text-gray-700 max-w-[440px] mx-auto mb-6 text-[0.9rem]">
            Once you have sent the instruction to your platform, use the confirm link in the email
            we just sent you so CSL knows to expect your vote.
          </p>
        )}

        {howHeld === "nominee" && (
          <div className="mb-4 p-3.5 bg-white rounded-lg border border-gray-200 text-left text-[0.82rem] text-gray-800 leading-relaxed max-w-[440px] mx-auto">
            <p className="font-semibold text-csl-dark mb-1.5">Instruction to copy into an email to {platform === "Other" ? "your platform" : platform}</p>
            <p>
              Please appoint {APPOINTEE_LABEL} as my proxy to vote on my behalf at the Celtic plc
              Annual General Meeting, on all resolutions, in accordance with my instructions.
            </p>
          </div>
        )}

        {appointmentId && (
          <a
            href={`/api/proxy/pdf/${appointmentId}`}
            className="inline-flex items-center px-6 py-2.5 mb-4 rounded-lg text-[0.85rem] font-semibold border-2 border-csl-dark text-csl-dark hover:bg-white transition-colors duration-200"
          >
            {howHeld === "nominee" ? "Download your instruction (PDF)" : "Download your appointment (PDF)"}
          </a>
        )}

        <div>
          <Link
            href="/membership"
            className="inline-flex items-center px-7 py-3 rounded-lg text-[0.92rem] font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200"
          >
            Support our work - Join CSL
          </Link>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="max-w-[560px] mx-auto bg-white rounded-2xl p-8 shadow-lg border border-gray-200"
    >
      {/* Honeypot. Named away from any recognised autofill category, matching
          the resolution form's fix. Unlike the interest form above on this
          same page, a filled honeypot here writes a flagged row rather than
          discarding the submission - see /api/proxy/appointment/route.ts. */}
      <input type="text" name="hp_field" style={{ display: "none" }} tabIndex={-1} autoComplete="off" aria-hidden="true" />

      {(state === "error" || state === "duplicate") && errorMsg && (
        <div ref={errorRef} className="mb-5 px-4 py-3.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-[0.88rem]">
          {errorMsg}
        </div>
      )}

      <div className="mb-5">
        <label htmlFor="fullName" className={labelClass}>
          Full name <span className="text-red-500">*</span>
        </label>
        <input
          id="fullName" name="fullName" type="text" required
          value={prefillName} onChange={(e) => setPrefillName(e.target.value)}
          placeholder="e.g. James McPherson" className={inputClass}
        />
      </div>

      <div className="mb-5">
        <label htmlFor="email" className={labelClass}>
          Email address <span className="text-red-500">*</span>
        </label>
        <input
          id="email" name="email" type="email" required
          value={prefillEmail} onChange={(e) => setPrefillEmail(e.target.value)}
          placeholder="your@email.com" className={inputClass}
        />
      </div>

      <div className="mb-5">
        <p className={labelClass}>
          Registered address <span className="text-red-500">*</span>
        </p>
        <p className={hintClass}>
          As held on the Celtic share register or by your platform. Computershare needs this to
          verify your appointment before the meeting.
        </p>
        <input
          id="addressLine1" name="addressLine1" type="text" required
          placeholder="Address line 1" className={`${inputClass} mb-2`}
        />
        <input
          id="addressLine2" name="addressLine2" type="text"
          placeholder="Address line 2 (optional)" className={`${inputClass} mb-2`}
        />
        <div className="grid grid-cols-2 gap-2">
          <input id="addressTown" name="addressTown" type="text" required placeholder="Town or city" className={inputClass} />
          <input id="addressPostcode" name="addressPostcode" type="text" required placeholder="Postcode" className={inputClass} />
        </div>
      </div>

      <div className="mb-5">
        <p className={labelClass}>
          How do you hold your shares? <span className="text-red-500">*</span>
        </p>
        <div className="flex flex-col gap-3">
          <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
            <input type="radio" name="howHeld" value="direct" className={`${radioClass} mt-0.5`} onChange={() => setHowHeld("direct")} />
            <span>Directly on the Celtic share register (Computershare)</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
            <input type="radio" name="howHeld" value="nominee" className={`${radioClass} mt-0.5`} onChange={() => setHowHeld("nominee")} />
            <span>Through a nominee, broker, ISA, SIPP or platform</span>
          </label>
        </div>
      </div>

      {howHeld === "direct" && (
        <div className={branchClass}>
          <label htmlFor="computershareSrn" className={labelClass}>
            Computershare Shareholder Reference Number (SRN) <span className="text-red-500">*</span>
          </label>
          <p className={hintClass}>
            On your share certificate or any Computershare correspondence. Required so CSL can lodge
            your appointment against the correct holding.
          </p>
          <input id="computershareSrn" name="computershareSrn" type="text" required placeholder="e.g. C0001234567" className={inputClass} />

          <label htmlFor="sharesHeldExact" className={`${labelClass} mt-4`}>
            Exact number of shares you hold <span className="text-red-500">*</span>
          </label>
          <p className={hintClass}>
            Celtic plc requires the exact number of shares your appointment relates to - the same
            paperwork that gives you your SRN also shows this. Stating none, or more than you hold,
            may invalidate the appointment.
          </p>
          <input
            id="sharesHeldExact" name="sharesHeldExact" type="number" required min={1} step={1}
            placeholder="e.g. 250" className={inputClass}
            value={sharesHeldExact} onChange={(e) => setSharesHeldExact(e.target.value)}
          />

          <p className={`${labelClass} mt-4`}>
            How would you like this appointment lodged? <span className="text-red-500">*</span>
          </p>
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="radio" name="lodgementPath" value="we-lodge" checked={lodgementPath === "we-lodge"}
                className={`${radioClass} mt-0.5`} onChange={() => setLodgementPath("we-lodge")}
              />
              <span>CSL lodges it for me, as part of a block with other members (recommended)</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="radio" name="lodgementPath" value="member-lodges" checked={lodgementPath === "member-lodges"}
                className={`${radioClass} mt-0.5`} onChange={() => setLodgementPath("member-lodges")}
              />
              <span>I will lodge it myself</span>
            </label>
          </div>

          {lodgementPath === "we-lodge" ? (
            <div className="mt-4 p-3.5 bg-blue-50 rounded-lg border border-blue-200 text-[0.82rem] text-blue-900 leading-relaxed">
              CSL will lodge this appointment with Computershare Investor Services PLC on your behalf,
              ahead of the deadline stated in Celtic plc&apos;s Notice of AGM.
            </div>
          ) : (
            <div className="mt-4 p-3.5 bg-blue-50 rounded-lg border border-blue-200 text-[0.82rem] text-blue-900 leading-relaxed">
              Post the signed form to Computershare Investor Services PLC, The Pavilions, Bridgwater
              Road, Bristol BS13 8AE, or appoint {APPOINTEE_LABEL} yourself through Computershare&apos;s
              online Investor Centre. It must arrive no later than 24 hours before the meeting -
              Investor Centre is faster and avoids any risk of the post missing that deadline.
            </div>
          )}
        </div>
      )}

      {howHeld === "nominee" && (
        <div className={branchClass}>
          <label htmlFor="nomineePlatform" className={labelClass}>
            Platform or broker <span className="text-red-500">*</span>
          </label>
          <select
            id="nomineePlatform" name="nomineePlatform" required className={inputClass}
            value={platform} onChange={(e) => { setPlatform(e.target.value); setInstructionSent(false); }}
          >
            <option value="">-- Select --</option>
            {nomineePlatforms.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {platform === "Other" && (
            <input
              id="nomineePlatformOther" name="nomineePlatformOther" type="text" required
              placeholder="Name of platform or broker" className={`${inputClass} mt-2`}
            />
          )}

          {platform && (
            <div className="mt-4 p-3.5 bg-blue-50 rounded-lg border border-blue-200 text-[0.82rem] text-blue-900 leading-relaxed">
              <p className="font-semibold mb-1.5">Send this instruction to {platform === "Other" ? "your platform" : platform}</p>
              <p>
                Please appoint {APPOINTEE_LABEL} as my proxy to vote on my behalf at the Celtic plc
                Annual General Meeting, on all resolutions, in accordance with my instructions.
              </p>
              <p className="text-[0.72rem] text-blue-700 mt-2">
                CSL never asks for your platform login. Send this through your own account, then
                confirm below.
              </p>
            </div>
          )}

          {platform && (
            <label className="mt-3 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox" checked={instructionSent}
                onChange={(e) => setInstructionSent(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-csl-dark shrink-0"
              />
              <span className="text-[0.82rem] text-gray-700 leading-snug">
                I have sent this instruction to my platform. <span className="text-red-500">*</span>
              </span>
            </label>
          )}
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="shareClass" className={labelClass}>Share class (if known)</label>
          <select id="shareClass" name="shareClass" className={inputClass} defaultValue="">
            <option value="">-- Select --</option>
            <option value="ORD">Ordinary shares (ORD)</option>
            <option value="CCP">Convertible Cumulative Preference shares (CCP)</option>
            <option value="BOTH">Both</option>
          </select>
        </div>
        <div>
          <label htmlFor="sharesHeld" className={labelClass}>Approximate shares held</label>
          <select id="sharesHeld" name="sharesHeld" className={inputClass} defaultValue="">
            <option value="">-- Select --</option>
            {shareBands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {/* The declaration, in full. Config-driven, not hardcoded, so a change
          to the wording is a data change - matching the resolution page's
          own pattern, without the version table: Package 5 keeps a single
          text snapshot rather than a full history for the proxy. */}
      <div className="mb-4 p-5 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-csl-dark mb-2">
          Declaration
        </p>
        <p className="text-[0.88rem] text-gray-800 leading-relaxed whitespace-pre-line">
          {declarationText}
        </p>
      </div>

      <div className="mb-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-csl-dark shrink-0" />
          <span className="text-[0.82rem] text-gray-700 leading-snug">
            {howHeld === "nominee"
              ? <>I consent to Celtic Supporters Limited storing and processing my personal data to record this appointment. My details are not sent to Celtic plc - my platform sends my voting instruction directly.</>
              : <>I consent to Celtic Supporters Limited storing and processing my personal data to record and lodge this appointment. As required to lodge a proxy, my name, address and shareholding details will be provided to Computershare Investor Services PLC as part of this appointment.</>}
            {" "}<span className="text-red-500">*</span>
          </span>
        </label>
      </div>

      <div className="mb-5">
        <label htmlFor="signatureName" className={labelClass}>
          Type your full name as your electronic signature <span className="text-red-500">*</span>
        </label>
        <input id="signatureName" name="signatureName" type="text" required placeholder="Your full name" className={`${inputClass} italic`} />
      </div>

      <div className="mb-6">
        <p className={labelClass}>Date</p>
        <p className="text-[0.92rem] text-gray-600 px-3.5 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
          {today}
        </p>
      </div>

      <div className="mb-4 flex justify-center">
        <Turnstile
          ref={turnstileRef}
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
          onSuccess={(token) => { setTurnstileToken(token); setTurnstileError(""); }}
        />
      </div>
      {turnstileError && <p className="mb-4 text-[0.8rem] text-red-600 text-center">{turnstileError}</p>}

      <button
        type="submit"
        disabled={state === "submitting" || !howHeld}
        className="w-full flex justify-center items-center py-3.5 rounded-lg text-base font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "submitting" ? "Submitting..." : "Appoint my proxy"}
      </button>

      <p className="text-center text-[0.78rem] text-gray-400 mt-4 leading-relaxed">
        Celtic Supporters Limited is registered with the ICO (ZB985030). To request deletion, contact{" "}
        <a href="mailto:info@celticsupporters.net" className="underline">info@celticsupporters.net</a>.
        {" "}
        <Link href="/privacy" className="underline">Full privacy policy.</Link>
      </p>
    </form>
  );
}
