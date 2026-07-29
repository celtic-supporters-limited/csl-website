"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { createBrowserSupabase } from "@/lib/supabase-browser";

type FormState = "idle" | "submitting" | "success" | "error" | "duplicate";
type HowHeld = "direct" | "nominee" | "";

const inputClass =
  "w-full px-3.5 py-2.5 border-[1.5px] border-gray-200 rounded-lg text-[0.92rem] font-[inherit] transition-colors duration-200 focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10";
const labelClass = "block text-[0.85rem] font-semibold text-gray-800 mb-1.5";
const radioClass = "w-4 h-4 accent-csl-dark shrink-0";
const hintClass = "text-[0.78rem] text-gray-500 mb-1.5";
const branchClass = "mb-5 pl-4 border-l-2 border-csl-light";

export default function ResolutionForm({
  nomineePlatforms,
  yearOptions,
  shareBands,
  resolutionBody,
  declarationText,
  consentText,
  supportingStatement,
}: {
  nomineePlatforms: string[];
  yearOptions: string[];
  shareBands: string[];
  /** The current resolution version's content. Only rendered when signing is
   * actually possible, so these are always populated by the time they reach
   * this component - see the completeness CHECK on agm_resolution_versions. */
  resolutionBody: string;
  declarationText: string;
  consentText: string;
  supportingStatement: string | null;
}) {
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [firstName, setFirstName] = useState("");

  // Shareholder question gates the whole form. Non-shareholders cannot support
  // a section 338 request, so they are routed to the supporter path instead of
  // dead-ending.
  const [isShareholder, setIsShareholder] = useState<boolean | null>(null);
  const [howHeld, setHowHeld] = useState<HowHeld>("");
  const [platform, setPlatform] = useState("");

  const [prefillName, setPrefillName] = useState("");
  const [prefillEmail, setPrefillEmail] = useState("");

  const [eligibility, setEligibility] = useState(false);
  const [supported, setSupported] = useState(false);
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

  async function post(url: string, payload: Record<string, unknown>) {
    setState("submitting");
    setErrorMsg("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean; error?: string; firstName?: string; duplicate?: boolean;
      };

      if (res.status === 409 || data.duplicate) {
        setErrorMsg(data.error ?? "We already have a signature from this email address.");
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
      setState("success");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setState("error");
      resetTurnstile();
    }
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

    // Supporter path: not a shareholder, so no signature is collected.
    if (isShareholder === false) {
      if (!consent) {
        setErrorMsg("Please confirm your consent before submitting.");
        setState("error");
        return;
      }
      await post("/api/resolution/supporter", {
        // Always empty for a real submission - the client already returns
        // early above if this is filled. Sent anyway so the server checks it
        // too, since a direct POST bypassing this component skips the check
        // above entirely.
        hpField: fd.get("hp_field"),
        fullName: fd.get("fullName"),
        email: fd.get("email"),
        consentGiven: consent,
        turnstileToken,
      });
      return;
    }

    await post("/api/resolution/sign", {
      // See the note on the supporter payload above.
      hpField:              fd.get("hp_field"),
      fullName:             fd.get("fullName"),
      addressLine1:         fd.get("addressLine1"),
      addressLine2:         fd.get("addressLine2"),
      addressTown:          fd.get("addressTown"),
      addressPostcode:      fd.get("addressPostcode"),
      email:                fd.get("email"),
      howHeld,
      computershareSrn:     fd.get("computershareSrn"),
      nomineePlatform:      platform,
      nomineePlatformOther: fd.get("nomineePlatformOther"),
      yearOfPurchase:       fd.get("yearOfPurchase"),
      sharesHeld:           fd.get("sharesHeld"),
      shareClass:           fd.get("shareClass"),
      eligibilityConfirmed: eligibility,
      resolutionSupported:  supported,
      consentGiven:         consent,
      signatureName:        fd.get("signatureName"),
      turnstileToken,
    });
  }

  if (state === "success") {
    const wasSupporter = isShareholder === false;
    return (
      <div ref={successRef} className="bg-csl-light rounded-2xl text-center px-8 py-16 max-w-[560px] mx-auto">
        <div className="text-5xl mb-4 text-csl-dark">&#10003;</div>
        <h2 className="text-2xl font-extrabold text-csl-dark mb-3">
          {wasSupporter ? "Support registered" : "Signature recorded"}
        </h2>
        <p className="text-gray-700 max-w-[440px] mx-auto mb-6">
          {wasSupporter
            ? `Thank you${firstName ? `, ${firstName}` : ""}. You cannot sign the requisition without holding Celtic plc shares, but your support is recorded and we will keep you posted.`
            : `Thank you${firstName ? `, ${firstName}` : ""}. Your signature has been recorded.`}
        </p>
        <Link
          href="/membership"
          className="inline-flex items-center px-7 py-3 rounded-lg text-[0.92rem] font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200"
        >
          Support our work - Join CSL
        </Link>
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
      {/* Honeypot. Named away from any recognised autofill category (email,
          name, address, url, company...) on purpose - a field named "website"
          is exactly what a browser or password manager autofills unprompted,
          which would silently cost a real signature: the client fakes success
          the moment this has a value, indistinguishable from a genuine one. */}
      <input type="text" name="hp_field" style={{ display: "none" }} tabIndex={-1} autoComplete="off" aria-hidden="true" />

      {(state === "error" || state === "duplicate") && errorMsg && (
        <div ref={errorRef} className="mb-5 px-4 py-3.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-[0.88rem]">
          {errorMsg}
        </div>
      )}

      {/* 1. Shareholder question, asked first because it decides the path */}
      <div className="mb-5">
        <p className={labelClass}>
          Do you hold shares in Celtic plc? <span className="text-red-500">*</span>
        </p>
        <div className="flex gap-6">
          {(["Yes", "No"] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="radio" name="isShareholder" value={opt} className={radioClass}
                onChange={() => {
                  setIsShareholder(opt === "Yes");
                  if (opt === "No") { setHowHeld(""); setPlatform(""); }
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>

      {isShareholder === false && (
        <div className="mb-5 px-4 py-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-[0.85rem] leading-relaxed">
          Only Celtic plc shareholders can support this requisition, so we cannot record a signature
          from you. You can still register your support below, and joining CSL is the most direct way
          to back the campaign.
        </div>
      )}

      {/* 2. Name and email, both paths */}
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

      {isShareholder === true && (
        <>
          {/* 3. Address, four discrete fields for register reconciliation */}
          <div className="mb-5">
            <p className={labelClass}>
              Registered address <span className="text-red-500">*</span>
            </p>
            <p className={hintClass}>
              As held on the Celtic share register or by your platform. We use this to match your
              holding before lodging the requisition.
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

          {/* 4. How held */}
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
                On your share certificate or any Computershare correspondence. We need this to match
                you to the share register, so a signature without it cannot be counted.
              </p>
              <input id="computershareSrn" name="computershareSrn" type="text" required placeholder="e.g. C0001234567" className={inputClass} />
            </div>
          )}

          {howHeld === "nominee" && (
            <div className={branchClass}>
              <label htmlFor="nomineePlatform" className={labelClass}>
                Platform or broker <span className="text-red-500">*</span>
              </label>
              <select
                id="nomineePlatform" name="nomineePlatform" required className={inputClass}
                value={platform} onChange={(e) => setPlatform(e.target.value)}
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
            </div>
          )}

          {/* 5. Holding detail */}
          <div className="mb-5">
            <label htmlFor="shareClass" className={labelClass}>
              Share class <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-col gap-2.5">
              {[
                { v: "ORD", l: "Ordinary shares (ORD)" },
                { v: "CCP", l: "Convertible Cumulative Preference shares (CCP)" },
                { v: "BOTH", l: "Both" },
              ].map(({ v, l }) => (
                <label key={v} className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="radio" name="shareClass" value={v} required className={`${radioClass} mt-0.5`} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="yearOfPurchase" className={labelClass}>Year of purchase</label>
              <select id="yearOfPurchase" name="yearOfPurchase" className={inputClass} defaultValue="">
                <option value="">-- Select --</option>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
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

          {/* 6. Eligibility, discrete tick */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={eligibility} onChange={(e) => setEligibility(e.target.checked)} className="mt-0.5 w-4 h-4 accent-csl-dark shrink-0" />
              <span className="text-[0.82rem] text-gray-700 leading-snug">
                I am a registered holder of, or hold through a nominee, shares in Celtic plc.{" "}
                <span className="text-red-500">*</span>
              </span>
            </label>
          </div>

          {/* 7. The resolution being requisitioned, in full. The signatory must
              see the exact text before agreeing to it - not truncated, not
              linked out to a PDF. */}
          <div className="mb-5 p-5 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-csl-dark mb-2">
              The Resolution
            </p>
            <p className="text-[0.88rem] text-gray-800 leading-relaxed whitespace-pre-line">
              {resolutionBody}
            </p>
          </div>

          {/* Section 314 supporting statement. Only rendered, with its own
              heading, when one has been set on the current version - if null,
              this section does not exist, not an empty heading. */}
          {supportingStatement && (
            <div className="mb-5 p-5 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-blue-800 mb-2">
                Supporting Statement
              </p>
              <p className="text-[0.82rem] text-blue-900 leading-relaxed whitespace-pre-line">
                {supportingStatement}
              </p>
              <p className="text-[0.72rem] text-blue-700 mt-2">
                This statement will be circulated with the resolution.
              </p>
            </div>
          )}

          {/* 8. Declaration, discrete tick. Wording comes from the current
              resolution version, not hardcoded, so a signature is bound to the
              exact declaration the signatory saw, the same as the resolution
              text above it. */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={supported} onChange={(e) => setSupported(e.target.checked)} className="mt-0.5 w-4 h-4 accent-csl-dark shrink-0" />
              <span className="text-[0.82rem] text-gray-700 leading-snug">
                {declarationText} <span className="text-red-500">*</span>
              </span>
            </label>
          </div>

          {/* 9. Consent, shareholder path. Requisition-specific: it discloses
              that details are provided to Celtic plc, which is true only for a
              signatory, never for a supporter. Sourced from the version and
              kept in its own block, deliberately not shared with the supporter
              consent below, so the two can never be mistaken for one sentence. */}
          <div className="mb-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-csl-dark shrink-0" />
              <span className="text-[0.82rem] text-gray-700 leading-snug">
                {consentText} <span className="text-red-500">*</span>
              </span>
            </label>
          </div>
        </>
      )}

      {/* Consent, supporter path. A supporter is registering interest, not
          making a statutory request, so this is static and never versioned,
          and it must never say details are provided to Celtic plc - that is
          only true on the shareholder path above. */}
      {isShareholder === false && (
        <div className="mb-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-csl-dark shrink-0" />
            <span className="text-[0.82rem] text-gray-700 leading-snug">
              I consent to Celtic Supporters Limited storing and processing my personal data to
              register my support for this campaign, in accordance with the{" "}
              <Link href="/privacy" className="text-csl-dark underline">Privacy Policy</Link>.{" "}
              <span className="text-red-500">*</span>
            </span>
          </label>
        </div>
      )}

      {/* 9. Signature, shareholders only */}
      {isShareholder === true && (
        <>
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
        </>
      )}

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
        disabled={state === "submitting" || isShareholder === null}
        className="w-full flex justify-center items-center py-3.5 rounded-lg text-base font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "submitting"
          ? "Submitting..."
          : isShareholder === false
          ? "Register my support"
          : "Add my signature"}
      </button>

      <p className="text-center text-[0.78rem] text-gray-400 mt-4 leading-relaxed">
        Celtic Supporters Limited is registered with the ICO (ZB985030). Your details will be used to
        submit and verify this requisition and for related campaign communications. They will not be
        passed to third parties. To request deletion, contact{" "}
        <a href="mailto:info@celticsupporters.net" className="underline">info@celticsupporters.net</a>.
        {" "}
        <Link href="/privacy" className="underline">Full privacy policy.</Link>
      </p>
    </form>
  );
}
