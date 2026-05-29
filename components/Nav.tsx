"use client";

import Link from "next/link";
import Image from "next/image";
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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setAuthed(!!session)
    );
    return () => subscription.unsubscribe();
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const aboutActive = aboutLinks.some((l) => pathname === l.href);

  return (
    <nav className="sticky top-0 z-50 bg-csl-dark shadow-md">
      {/* MAIN BAR — 64 px tall */}
      <div className="max-w-[1100px] mx-auto px-5 h-16 flex items-center justify-between">

        {/* LOGO */}
        <Link href="/" className="flex items-center gap-3 flex-shrink-0">
          <Image
            src="/images/csl-logo.png"
            alt="Celtic Supporters Limited"
            width={44}
            height={44}
            className="h-11 w-auto object-contain"
            priority
          />
          <span className="font-serif font-semibold text-[1.1rem] text-white leading-tight hidden sm:block">
            Celtic Supporters Limited
          </span>
        </Link>

        {/* DESKTOP LINKS */}
        <ul className="hidden md:flex items-center list-none">
          {navLinks.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className={`block text-[0.9rem] font-medium px-4 py-2 transition-colors duration-150 ${
                  pathname === href
                    ? "text-csl-gold"
                    : "text-white/80 hover:text-white"
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
              className={`text-[0.9rem] font-medium px-4 py-2 flex items-center gap-1 transition-colors duration-150 ${
                aboutActive ? "text-csl-gold" : "text-white/80 hover:text-white"
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
              <ul className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50 list-none">
                {aboutLinks.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`block px-4 py-2.5 text-[0.88rem] transition-colors duration-150 ${
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

        {/* RIGHT ACTIONS */}
        <div className="flex items-center gap-2 self-center">
          <Link
            href={authed ? "/member-portal" : "/login"}
            className="hidden lg:inline-flex items-center px-4 py-2 rounded-lg text-[0.88rem] font-semibold border border-white text-white bg-transparent hover:bg-csl-mid transition-colors duration-200"
          >
            {authed ? "Member Portal" : "Member Login"}
          </Link>
          <Link
            href="/membership"
            className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg text-[0.88rem] font-semibold bg-csl-gold text-gray-900 hover:brightness-105 transition-all duration-200"
          >
            Join CSL
          </Link>

          {/* Hamburger (mobile only) */}
          <button
            className="md:hidden p-2 flex flex-col justify-center items-center gap-[5px]"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
          >
            <span
              className={`block w-5 h-0.5 bg-white origin-center transition-transform duration-200 ${
                mobileOpen ? "translate-y-[7px] rotate-45" : ""
              }`}
            />
            <span
              className={`block w-5 h-0.5 bg-white transition-opacity duration-200 ${
                mobileOpen ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block w-5 h-0.5 bg-white origin-center transition-transform duration-200 ${
                mobileOpen ? "-translate-y-[7px] -rotate-45" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* MOBILE MENU */}
      {mobileOpen && (
        <div className="md:hidden bg-csl-dark border-t border-white/10 px-5 py-4">
          <div className="space-y-0.5">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`block px-3 py-2.5 rounded text-[0.92rem] font-medium transition-colors duration-150 ${
                  pathname === href ? "text-csl-gold" : "text-white/80 hover:text-white"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-white/10 space-y-0.5">
            <p className="px-3 pb-1 text-[0.72rem] text-white/40 uppercase tracking-widest font-medium">
              About
            </p>
            {aboutLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`block px-3 py-2.5 rounded text-[0.92rem] font-medium transition-colors duration-150 ${
                  pathname === href ? "text-csl-gold" : "text-white/80 hover:text-white"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-2.5">
            <Link
              href={authed ? "/member-portal" : "/login"}
              className="block text-center px-4 py-2.5 rounded-lg text-[0.92rem] font-semibold border border-white text-white bg-transparent hover:bg-csl-mid transition-colors duration-200"
            >
              {authed ? "Member Portal" : "Member Login"}
            </Link>
            <Link
              href="/membership"
              className="block text-center px-4 py-2.5 rounded-lg text-[0.92rem] font-semibold bg-csl-gold text-gray-900 hover:brightness-105 transition-all duration-200"
            >
              Join CSL
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
