"use client";

import { useState } from "react";
import Link from "next/link";

type FormState = "idle" | "submitting" | "success" | "error";

const inputClass =
  "w-full px-3.5 py-2.5 border-[1.5px] border-gray-200 rounded-lg text-[0.92rem] font-[inherit] transition-colors duration-200 focus:outline-none focus:border-csl-dark focus:ring-2 focus:ring-csl-dark/10";

const labelClass = "block text-[0.85rem] font-semibold text-gray-800 mb-1.5";

export default function ProxyForm() {
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [consent, setConsent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consent) {
      setErrorMsg("Please confirm your consent before submitting.");
      setState("error");
      return;
    }

    setState("submitting");
    setErrorMsg("");

    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get("name"),
      email: fd.get("email"),
      numShares: fd.get("numShares"),
      yearPurchased: fd.get("yearPurchased"),
      source: fd.get("source"),
    };

    try {
      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setState("error");
        return;
      }
      setState("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="bg-csl-light rounded-2xl text-center px-8 py-16 max-w-[520px] mx-auto">
        <div className="text-5xl mb-4">&#10003;</div>
        <h2 className="text-2xl font-extrabold text-csl-dark mb-3">
          Proxy Intent Registered
        </h2>
        <p className="text-gray-600 max-w-[420px] mx-auto mb-6">
          We&apos;ll send you the official proxy form ahead of the next Celtic
          PLC AGM. Thank you for supporting governance change.
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
      {state === "error" && errorMsg && (
        <div className="mb-5 px-4 py-3.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-[0.88rem]">
          {errorMsg}
        </div>
      )}

      <div className="mb-5">
        <label htmlFor="name" className={labelClass}>
          Full Name (as registered with Computershare){" "}
          <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
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
          placeholder="your@email.com"
          className={inputClass}
        />
      </div>

      <div className="mb-5">
        <label htmlFor="numShares" className={labelClass}>
          Number of Shares Held (approximately)
        </label>
        <input
          id="numShares"
          name="numShares"
          type="text"
          placeholder="e.g. 500 Ordinary + 500 Preference"
          className={inputClass}
        />
      </div>

      <div className="mb-5">
        <label htmlFor="yearPurchased" className={labelClass}>
          Year of Purchase (if known)
        </label>
        <input
          id="yearPurchased"
          name="yearPurchased"
          type="text"
          placeholder="e.g. 1995 or 'Unsure'"
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
          <option>Word of mouth</option>
          <option>Celtic forum or fan site</option>
          <option>Media / press</option>
          <option>Other</option>
        </select>
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
            personal data to handle this proxy registration, in accordance with
            the{" "}
            <Link href="#" className="text-csl-dark underline">
              Privacy Policy
            </Link>
            . <span className="text-red-500">*</span>
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={state === "submitting"}
        className="w-full flex justify-center items-center py-3.5 rounded-lg text-base font-semibold bg-csl-dark text-white hover:bg-csl-mid transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "submitting" ? "Submitting..." : "Register Proxy Intent"}
      </button>

      <p className="text-center text-[0.8rem] text-gray-400 mt-3">
        CSL will contact you with the official proxy form before the next AGM date.
      </p>
    </form>
  );
}
