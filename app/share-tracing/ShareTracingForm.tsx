"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { createBrowserSupabase } from "@/lib/supabase-browser";

type FormState = "idle" | "submitting" | "success" | "error";

const inputClass =
  "w-full px-3.5 py-2.5 border-[1.5px] border-gray-200 rounded-lg text-[0.92rem] font-[inherit] transition-colors duration-200 focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10";

const labelClass = "block text-[0.85rem] font-semibold text-gray-800 mb-1.5";

export default function ShareTracingForm() {
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [prefillName, setPrefillName] = useState("");
  const [prefillEmail, setPrefillEmail] = useState("");
  const successRef = useRef<HTMLDivElement>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

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
  }, [state]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const fd = new FormData(e.currentTarget);

    // Honeypot: silently reject submissions where the hidden field is filled
    if (fd.get("website")) {
      setState("success");
      return;
    }

    if (!consent) {
      setErrorMsg("Please confirm your consent before submitting.");
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
      name: fd.get("name"),
      email: fd.get("email"),
      enquiryType: fd.get("enquiryType"),
      yearPurchased: fd.get("yearPurchased"),
      numShares: fd.get("numShares"),
      source: fd.get("source"),
      notes: fd.get("notes"),
      turnstileToken,
    };

    try {
      const res = await fetch("/api/share-tracing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        turnstileRef.current?.reset();
        setTurnstileToken("");
        setState("error");
        return;
      }
      setState("success");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      turnstileRef.current?.reset();
      setTurnstileToken("");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div ref={successRef} className="bg-csl-light rounded-2xl text-center px-8 py-16 max-w-[520px] mx-auto">
        <div className="text-5xl mb-4">&#10003;</div>
        <h2 className="text-2xl font-extrabold text-csl-dark mb-3">
          Enquiry Received
        </h2>
        <p className="text-gray-600 max-w-[420px] mx-auto mb-6">
          Our team will review your details and send you a personalised guidance
          pack within 5 working days. You will receive a confirmation email
          shortly.
        </p>
        <Link
          href="/membership"
          className="inline-flex items-center px-7 py-3 rounded-lg text-[0.92rem] font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200"
        >
          Support Our Work - Join CSL
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="max-w-[520px] mx-auto bg-white rounded-2xl p-10 shadow-lg border border-gray-200"
    >
      {/* Honeypot — hidden from real users; bots fill it in */}
      <input
        type="text"
        name="website"
        style={{ display: "none" }}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      {state === "error" && errorMsg && (
        <div className="mb-5 px-4 py-3.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-[0.88rem]">
          {errorMsg}
        </div>
      )}

      <div className="mb-5">
        <label htmlFor="name" className={labelClass}>
          Your Full Name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={prefillName}
          onChange={(e) => setPrefillName(e.target.value)}
          placeholder="e.g. James McPherson"
          className={inputClass}
        />
      </div>

      <div className="mb-5">
        <label htmlFor="email" className={labelClass}>
          Email Address <span className="text-red-500">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={prefillEmail}
          onChange={(e) => setPrefillEmail(e.target.value)}
          placeholder="your@email.com"
          className={inputClass}
        />
      </div>

      <div className="mb-5">
        <label htmlFor="enquiryType" className={labelClass}>
          Enquiry Type <span className="text-red-500">*</span>
        </label>
        <select id="enquiryType" name="enquiryType" required className={inputClass}>
          <option value="">-- Select --</option>
          <option>I have lost my share certificate</option>
          <option>I inherited shares from a family member</option>
          <option>My address details need updating</option>
          <option>I want to sell my shares to CSL</option>
          <option>I want to assign my proxy to CSL</option>
          <option>Other / Not sure</option>
        </select>
      </div>

      <div className="mb-5">
        <label htmlFor="yearPurchased" className={labelClass}>
          Approximate Year of Purchase (if known)
        </label>
        <input
          id="yearPurchased"
          name="yearPurchased"
          type="text"
          placeholder="e.g. 1995 or 'Inherited - unsure'"
          className={inputClass}
        />
      </div>

      <div className="mb-5">
        <label htmlFor="numShares" className={labelClass}>
          Number of Shares (if known)
        </label>
        <input
          id="numShares"
          name="numShares"
          type="text"
          placeholder="e.g. 500 Ordinary + 500 Preference, or 'Unknown'"
          className={inputClass}
        />
      </div>

      <div className="mb-5">
        <label htmlFor="source" className={labelClass}>
          How did you hear about CSL?
        </label>
        <select id="source" name="source" className={inputClass}>
          <option value="">-- Select --</option>
          <option>Twitter / X</option>
          <option>Facebook</option>
          <option>LinkedIn</option>
          <option>Word of mouth / friend</option>
          <option>Celtic forum or fan site</option>
          <option>Newspaper / media</option>
          <option>Direct email from CSL</option>
          <option>Other</option>
        </select>
      </div>

      <div className="mb-5">
        <label htmlFor="notes" className={labelClass}>
          Additional Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Any other details that may help us with your enquiry..."
          className={`${inputClass} resize-y`}
        />
      </div>

      <div className="mb-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-csl-dark shrink-0"
          />
          <span className="text-[0.82rem] text-gray-600 leading-snug">
            I consent to Celtic Supporters Limited storing and processing my
            personal data to handle this enquiry, in accordance with the{" "}
            <Link href="/privacy" className="text-csl-dark underline">
              Privacy Policy
            </Link>
            . <span className="text-red-500">*</span>
          </span>
        </label>
      </div>

      <div className="mb-5 flex justify-center">
        <Turnstile
          ref={turnstileRef}
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
          onSuccess={(token) => {
            setTurnstileToken(token);
            setTurnstileError("");
          }}
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
        {state === "submitting" ? "Submitting..." : "Submit Enquiry"}
      </button>

      <p className="text-center text-[0.8rem] text-gray-400 mt-3">
        We aim to respond within 5 working days. Your data is held in accordance
        with our Privacy Policy.
      </p>
    </form>
  );
}
