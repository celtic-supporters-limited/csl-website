"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { createBrowserSupabase } from "@/lib/supabase-browser";

type FormState = "idle" | "submitting" | "success" | "error" | "duplicate";

const inputClass =
  "w-full px-3.5 py-2.5 border-[1.5px] border-gray-200 rounded-lg text-[0.92rem] font-[inherit] transition-colors duration-200 focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10";
const labelClass = "block text-[0.85rem] font-semibold text-gray-800 mb-1.5";
const radioClass = "w-4 h-4 accent-csl-dark shrink-0 mt-0.5";

export default function ResolutionForm() {
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [firstName, setFirstName] = useState("");

  // Prefill from session
  const [prefillName, setPrefillName] = useState("");
  const [prefillEmail, setPrefillEmail] = useState("");

  // Conditional fields
  const [isShareholder, setIsShareholder] = useState<boolean | null>(null);
  const [shareholderType, setShareholderType] = useState<"direct" | "nominee" | "">("");
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [declaration, setDeclaration] = useState(false);

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    // Honeypot
    if (fd.get("website")) {
      setState("success");
      return;
    }

    if (!declaration) {
      setErrorMsg("You must accept the declaration before submitting.");
      setState("error");
      return;
    }
    if (!turnstileToken) {
      setTurnstileError("Security check not completed. Please wait a moment.");
      return;
    }
    setTurnstileError("");
    setState("submitting");
    setErrorMsg("");

    const payload = {
      fullName:          fd.get("fullName") as string,
      email:             fd.get("email") as string,
      postalAddress:     fd.get("postalAddress") as string,
      isShareholder,
      shareholderType:   isShareholder ? shareholderType : null,
      computershareSrn:  fd.get("computershareSrn") as string,
      nomineePlatform:   fd.get("nomineePlatform") as string,
      approximateShares: fd.get("approximateShares") ? Number(fd.get("approximateShares")) : null,
      isMember,
      typedSignature:    fd.get("typedSignature") as string,
      declarationAccepted: declaration,
      turnstileToken,
    };

    try {
      const res = await fetch("/api/resolution/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { ok?: boolean; error?: string; firstName?: string; duplicate?: boolean };

      if (res.status === 409 || data.duplicate) {
        setErrorMsg(data.error ?? "We already have a signature from this email address.");
        setState("duplicate");
        turnstileRef.current?.reset();
        setTurnstileToken("");
        return;
      }
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setState("error");
        turnstileRef.current?.reset();
        setTurnstileToken("");
        return;
      }
      setFirstName(data.firstName ?? "");
      setState("success");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setState("error");
      turnstileRef.current?.reset();
      setTurnstileToken("");
    }
  }

  if (state === "success") {
    return (
      <div ref={successRef} className="bg-csl-light rounded-2xl text-center px-8 py-16 max-w-[560px] mx-auto">
        <div className="text-5xl mb-4 text-csl-dark">&#10003;</div>
        <h2 className="text-2xl font-extrabold text-csl-dark mb-3">
          Signature recorded
        </h2>
        <p className="text-gray-700 max-w-[420px] mx-auto">
          Thank you{firstName ? `, ${firstName}` : ""}. Your signature has been recorded.
        </p>
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
      {/* Honeypot */}
      <input type="text" name="website" style={{ display: "none" }} tabIndex={-1} autoComplete="off" aria-hidden="true" />

      {/* Inline error / duplicate message */}
      {(state === "error" || state === "duplicate") && errorMsg && (
        <div ref={errorRef} className="mb-5 px-4 py-3.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-[0.88rem]">
          {errorMsg}
        </div>
      )}

      {/* 1. Full name */}
      <div className="mb-5">
        <label htmlFor="fullName" className={labelClass}>
          Full name <span className="text-red-500">*</span>
        </label>
        <input
          id="fullName" name="fullName" type="text" required
          value={prefillName} onChange={(e) => setPrefillName(e.target.value)}
          placeholder="e.g. James McPherson"
          className={inputClass}
        />
      </div>

      {/* 2. Email */}
      <div className="mb-5">
        <label htmlFor="email" className={labelClass}>
          Email address <span className="text-red-500">*</span>
        </label>
        <input
          id="email" name="email" type="email" required
          value={prefillEmail} onChange={(e) => setPrefillEmail(e.target.value)}
          placeholder="your@email.com"
          className={inputClass}
        />
      </div>

      {/* 3. Postal address */}
      <div className="mb-5">
        <label htmlFor="postalAddress" className={labelClass}>
          Postal address <span className="text-red-500">*</span>
        </label>
        <p className="text-[0.78rem] text-gray-500 mb-1.5">
          Include full address and postcode. Required for a valid AGM requisition.
        </p>
        <textarea
          id="postalAddress" name="postalAddress" required rows={3}
          placeholder={"12 Example Street\nGlasgow\nG1 1AA"}
          className={`${inputClass} resize-y`}
        />
      </div>

      {/* 4. Are you a shareholder? */}
      <div className="mb-5">
        <p className={labelClass}>
          Are you a Celtic plc shareholder? <span className="text-red-500">*</span>
        </p>
        <div className="flex gap-6">
          {(["Yes", "No"] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="radio" name="isShareholder" value={opt}
                className={radioClass}
                onChange={() => {
                  setIsShareholder(opt === "Yes");
                  if (opt === "No") setShareholderType("");
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>

      {/* 5. How do you hold shares? (conditional) */}
      {isShareholder && (
        <div className="mb-5 pl-4 border-l-2 border-csl-light">
          <p className={labelClass}>
            How do you hold your shares? <span className="text-red-500">*</span>
          </p>
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="radio" name="shareholderType" value="direct"
                className={`${radioClass} mt-0.5`}
                onChange={() => setShareholderType("direct")}
              />
              <span>Directly on the Celtic share register (Computershare)</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="radio" name="shareholderType" value="nominee"
                className={`${radioClass} mt-0.5`}
                onChange={() => setShareholderType("nominee")}
              />
              <span>Through a nominee, broker, ISA, SIPP or platform</span>
            </label>
          </div>
        </div>
      )}

      {/* 6. Computershare SRN (conditional) */}
      {isShareholder && shareholderType === "direct" && (
        <div className="mb-5 pl-4 border-l-2 border-csl-light">
          <label htmlFor="computershareSrn" className={labelClass}>
            Computershare Shareholder Reference Number (SRN)
          </label>
          <p className="text-[0.78rem] text-gray-500 mb-1.5">
            This is on your share certificate or Computershare correspondence. Leave blank if you don&apos;t have it to hand.
          </p>
          <input
            id="computershareSrn" name="computershareSrn" type="text"
            placeholder="e.g. C0001234567"
            className={inputClass}
          />
        </div>
      )}

      {/* 7. Nominee platform (conditional) */}
      {isShareholder && shareholderType === "nominee" && (
        <div className="mb-5 pl-4 border-l-2 border-csl-light">
          <label htmlFor="nomineePlatform" className={labelClass}>
            Platform or broker name
          </label>
          <input
            id="nomineePlatform" name="nomineePlatform" type="text"
            placeholder="e.g. Hargreaves Lansdown, AJ Bell, ii"
            className={inputClass}
          />
        </div>
      )}

      {/* 8. Approximate shares (all shareholders) */}
      {isShareholder && (
        <div className="mb-5 pl-4 border-l-2 border-csl-light">
          <label htmlFor="approximateShares" className={labelClass}>
            Approximate number of shares held
          </label>
          <input
            id="approximateShares" name="approximateShares" type="number"
            min="1" placeholder="e.g. 500"
            className={inputClass}
          />
        </div>
      )}

      {/* 9. CSL member? */}
      <div className="mb-5">
        <p className={labelClass}>
          Are you a CSL member? <span className="text-red-500">*</span>
        </p>
        <p className="text-[0.78rem] text-gray-500 mb-1.5">
          For information only. We will verify automatically.
        </p>
        <div className="flex gap-6">
          {(["Yes", "No"] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="radio" name="isMember" value={opt}
                className={radioClass}
                onChange={() => setIsMember(opt === "Yes")}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>

      {/* 10. Declaration */}
      <div className="mb-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={declaration}
            onChange={(e) => setDeclaration(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-csl-dark shrink-0"
          />
          <span className="text-[0.82rem] text-gray-700 leading-snug">
            I support Celtic Supporters Limited requisitioning a resolution at the next Celtic plc Annual General Meeting. If I am a shareholder, I confirm I hold shares in Celtic plc. I understand CSL will use my details to submit and verify this requisition.{" "}
            <span className="text-red-500">*</span>
          </span>
        </label>
      </div>

      {/* 11. Typed signature */}
      <div className="mb-5">
        <label htmlFor="typedSignature" className={labelClass}>
          Type your full name as your electronic signature <span className="text-red-500">*</span>
        </label>
        <input
          id="typedSignature" name="typedSignature" type="text" required
          placeholder="Your full name"
          className={`${inputClass} italic`}
        />
      </div>

      {/* 12. Today's date (read-only) */}
      <div className="mb-6">
        <p className={labelClass}>Date</p>
        <p className="text-[0.92rem] text-gray-600 px-3.5 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
          {today}
        </p>
      </div>

      {/* Turnstile */}
      <div className="mb-4 flex justify-center">
        <Turnstile
          ref={turnstileRef}
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
          onSuccess={(token) => { setTurnstileToken(token); setTurnstileError(""); }}
        />
      </div>
      {turnstileError && (
        <p className="mb-4 text-[0.8rem] text-red-600 text-center">{turnstileError}</p>
      )}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="w-full flex justify-center items-center py-3.5 rounded-lg text-base font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "submitting" ? "Recording signature..." : "Add my signature"}
      </button>

      {/* Privacy notice */}
      <p className="text-center text-[0.78rem] text-gray-400 mt-4 leading-relaxed">
        Celtic Supporters Limited is registered with the ICO (ZB985030). Your details will be used to submit and verify this requisition and for related campaign communications. They will not be passed to third parties. To request deletion, contact{" "}
        <a href="mailto:info@celticsupporters.net" className="underline">info@celticsupporters.net</a>.
        {" "}
        <Link href="/privacy" className="underline">Full privacy policy.</Link>
      </p>
    </form>
  );
}
