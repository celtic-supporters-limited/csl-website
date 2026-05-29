"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/share-tracing", label: "Share Tracing" },
  { href: "/proxy", label: "Proxy Assignment" },
  { href: "/membership", label: "Membership" },
  { href: "/celtic-paradox", label: "The Celtic Paradox" },
];

const aboutLinks = [
  { href: "/our-team", label: "Our Team" },
  { href: "/faq", label: "FAQs" },
  { href: "/articles-of-association", label: "Articles of Association" },
];

export default function Nav() {
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const aboutActive = aboutLinks.some((l) => pathname === l.href);

  return (
    <nav className="sticky top-0 z-50 bg-csl-dark border-b border-white/10 shadow-md">
      <div className="max-w-[1100px] mx-auto px-5 h-[68px] flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-extrabold text-xl text-white"
        >
          <span className="text-2xl">&#9752;</span>
          Celtic Supporters Limited
        </Link>

        <ul className="hidden md:flex items-center gap-5 list-none">
          {navLinks.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className={`text-[0.85rem] font-medium pb-1 border-b-2 transition-colors duration-200 ${
                  pathname === href
                    ? "text-white border-csl-gold"
                    : "text-white/75 border-transparent hover:text-white hover:border-white/40"
                }`}
              >
                {label}
              </Link>
            </li>
          ))}

          {/* About dropdown */}
          <li
            className="relative"
            onMouseEnter={() => setAboutOpen(true)}
            onMouseLeave={() => setAboutOpen(false)}
          >
            <button
              className={`text-[0.85rem] font-medium pb-1 border-b-2 transition-colors duration-200 flex items-center gap-1 ${
                aboutActive
                  ? "text-white border-csl-gold"
                  : "text-white/75 border-transparent hover:text-white hover:border-white/40"
              }`}
              aria-expanded={aboutOpen}
              aria-haspopup="true"
            >
              About
              <svg
                className={`w-3 h-3 transition-transform duration-150 ${aboutOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {aboutOpen && (
              <ul className="absolute top-full left-0 mt-1.5 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50 list-none">
                {aboutLinks.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`block px-4 py-2.5 text-[0.85rem] transition-colors duration-150 ${
                        pathname === href
                          ? "text-csl-dark font-semibold bg-csl-light"
                          : "text-gray-700 hover:text-csl-dark hover:bg-gray-50"
                      }`}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        </ul>

        <div className="flex items-center gap-2.5">
          <Link
            href={authed ? "/member-portal" : "/login"}
            className="hidden sm:inline-flex items-center px-5 py-2 rounded-lg text-[0.88rem] font-semibold border-[1.5px] border-white/50 text-white hover:bg-white/10 transition-colors duration-200"
          >
            {authed ? "Member Portal" : "Member Login"}
          </Link>
          <Link
            href="/membership"
            className="inline-flex items-center px-5 py-2 rounded-lg text-[0.88rem] font-semibold bg-csl-gold text-gray-900 hover:brightness-105 transition-all duration-200 shadow-sm"
          >
            Join CSL
          </Link>
        </div>
      </div>
    </nav>
  );
}
