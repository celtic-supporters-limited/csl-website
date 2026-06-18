"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { Container } from "@/components/Container";

const takeActionLinks = [
  { href: "/share-tracing", label: "Share Tracing" },
  { href: "/proxy", label: "Proxy Assignment" },
];

const aboutLinks = [
  { href: "/our-team", label: "Our Team" },
  { href: "/celtic-paradox", label: "The Celtic Paradox" },
  { href: "/faq", label: "FAQs" },
];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform duration-150 flex-shrink-0 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

const dropdownItemClass = (active: boolean) =>
  `block px-4 py-2.5 text-[0.88rem] transition-colors duration-150 ${
    active ? "text-csl-gold font-semibold" : "text-white hover:text-csl-gold"
  }`;

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [takeActionOpen, setTakeActionOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileTakeActionOpen, setMobileTakeActionOpen] = useState(false);
  const [mobileAboutOpen, setMobileAboutOpen] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Clear the Next.js router cache when the session ends so stale
        // portal RSC payloads cannot be served after sign-out.
        if (!session) router.refresh();
        setAuthed(!!session);
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const takeActionActive = takeActionLinks.some((l) => pathname === l.href);
  const aboutActive = aboutLinks.some((l) => pathname === l.href);

  const topLinkClass = (active: boolean) =>
    `text-[0.9rem] font-medium transition-colors duration-150 ${
      active ? "text-csl-gold" : "text-white/85 hover:text-white"
    }`;

  return (
    <nav className="sticky top-0 z-50 bg-csl-dark shadow-md">
      {/* MAIN BAR */}
      <Container className="h-14 flex items-center justify-between">
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
        <ul className="hidden md:flex items-center gap-0.5 list-none">
          {/* Home */}
          <li>
            <Link
              href="/"
              className={`block px-3.5 py-2 ${topLinkClass(pathname === "/")}`}
            >
              Home
            </Link>
          </li>

          {/* Take Action dropdown */}
          <li
            className="relative"
            onMouseEnter={() => setTakeActionOpen(true)}
            onMouseLeave={() => setTakeActionOpen(false)}
          >
            <button
              className={`px-3.5 py-2 flex items-center gap-1.5 ${topLinkClass(takeActionActive)}`}
              aria-expanded={takeActionOpen}
              aria-haspopup="true"
            >
              Take Action
              <Chevron open={takeActionOpen} />
            </button>
            {takeActionOpen && (
              <ul className="absolute top-full left-0 mt-0.5 min-w-[180px] bg-csl-dark border border-white/20 rounded-[6px] shadow-2xl py-1.5 z-50 list-none">
                {takeActionLinks.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className={dropdownItemClass(pathname === href)}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>

          {/* About dropdown */}
          <li
            className="relative"
            onMouseEnter={() => setAboutOpen(true)}
            onMouseLeave={() => setAboutOpen(false)}
          >
            <div className="flex items-center">
              <Link
                href="/#about"
                className={`pl-3.5 pr-1.5 py-2 ${topLinkClass(aboutActive)}`}
              >
                About
              </Link>
              <button
                className={`pr-3.5 py-2 ${topLinkClass(aboutActive)}`}
                onClick={() => setAboutOpen((o) => !o)}
                aria-expanded={aboutOpen}
                aria-haspopup="true"
                aria-label="Open About menu"
              >
                <Chevron open={aboutOpen} />
              </button>
            </div>
            {aboutOpen && (
              <ul className="absolute top-full left-0 mt-0.5 min-w-[180px] bg-csl-dark border border-white/20 rounded-[6px] shadow-2xl py-1.5 z-50 list-none">
                {aboutLinks.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className={dropdownItemClass(pathname === href)}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>

          {/* Governance */}
          <li>
            <Link
              href="/governance"
              className={`block px-3.5 py-2 ${topLinkClass(pathname === "/governance")}`}
            >
              Governance
            </Link>
          </li>

          {/* Membership */}
          <li>
            <Link
              href="/membership"
              className={`block px-3.5 py-2 ${topLinkClass(pathname === "/membership")}`}
            >
              Membership
            </Link>
          </li>
        </ul>

        {/* RIGHT ACTIONS */}
        <div className="flex items-center gap-2">
          <Link
            href={authed ? "/member-portal" : "/login"}
            prefetch={false}
            className="hidden lg:inline-flex items-center px-4 py-2 rounded-lg text-[0.88rem] font-semibold border border-white text-white bg-transparent hover:bg-csl-mid transition-colors duration-200"
          >
            {authed ? "Member Portal" : "Member Login"}
          </Link>
          <Link
            href="/membership"
            className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg text-[0.88rem] font-semibold bg-csl-gold text-csl-dark hover:brightness-105 transition-all duration-200"
          >
            Join CSL
          </Link>

          {/* Hamburger */}
          <button
            className="md:hidden p-2 flex flex-col justify-center items-center gap-[5px]"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
          >
            <span className={`block w-5 h-0.5 bg-white origin-center transition-transform duration-200 ${mobileOpen ? "translate-y-[7px] rotate-45" : ""}`} />
            <span className={`block w-5 h-0.5 bg-white transition-opacity duration-200 ${mobileOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-white origin-center transition-transform duration-200 ${mobileOpen ? "-translate-y-[7px] -rotate-45" : ""}`} />
          </button>
        </div>
      </Container>

      {/* MOBILE MENU */}
      {mobileOpen && (
        <div className="md:hidden bg-csl-dark border-t border-white/10">
          <Container className="py-3">
            {/* Home */}
            <Link
              href="/"
              className={`block px-3 py-2.5 rounded text-[0.92rem] font-medium transition-colors duration-150 ${
                pathname === "/" ? "text-csl-gold" : "text-white/85 hover:text-white"
              }`}
            >
              Home
            </Link>

            {/* Take Action accordion */}
            <div className="border-t border-white/10 mt-1 pt-1">
              <button
                className={`w-full flex items-center justify-between px-3 py-2.5 text-[0.92rem] font-medium transition-colors duration-150 ${
                  takeActionActive ? "text-csl-gold" : "text-white/85 hover:text-white"
                }`}
                onClick={() => setMobileTakeActionOpen((o) => !o)}
                aria-expanded={mobileTakeActionOpen}
              >
                Take Action
                <Chevron open={mobileTakeActionOpen} />
              </button>
              {mobileTakeActionOpen && (
                <div className="pl-5 pb-1 space-y-0.5">
                  {takeActionLinks.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      className={`block px-3 py-2 rounded text-[0.9rem] transition-colors duration-150 ${
                        pathname === href ? "text-csl-gold font-semibold" : "text-white/70 hover:text-white"
                      }`}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* About accordion */}
            <div className="border-t border-white/10 mt-1 pt-1">
              <div className="flex items-center justify-between">
                <Link
                  href="/#about"
                  className={`flex-1 px-3 py-2.5 text-[0.92rem] font-medium transition-colors duration-150 ${
                    aboutActive ? "text-csl-gold" : "text-white/85 hover:text-white"
                  }`}
                >
                  About
                </Link>
                <button
                  className={`px-3 py-2.5 transition-colors duration-150 ${
                    aboutActive ? "text-csl-gold" : "text-white/85 hover:text-white"
                  }`}
                  onClick={() => setMobileAboutOpen((o) => !o)}
                  aria-expanded={mobileAboutOpen}
                  aria-label="Open About menu"
                >
                  <Chevron open={mobileAboutOpen} />
                </button>
              </div>
              {mobileAboutOpen && (
                <div className="pl-5 pb-1 space-y-0.5">
                  {aboutLinks.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      className={`block px-3 py-2 rounded text-[0.9rem] transition-colors duration-150 ${
                        pathname === href ? "text-csl-gold font-semibold" : "text-white/70 hover:text-white"
                      }`}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Governance */}
            <div className="border-t border-white/10 mt-1 pt-1">
              <Link
                href="/governance"
                className={`block px-3 py-2.5 rounded text-[0.92rem] font-medium transition-colors duration-150 ${
                  pathname === "/governance" ? "text-csl-gold" : "text-white/85 hover:text-white"
                }`}
              >
                Governance
              </Link>
            </div>

            {/* Membership */}
            <div className="border-t border-white/10 mt-1 pt-1">
              <Link
                href="/membership"
                className={`block px-3 py-2.5 rounded text-[0.92rem] font-medium transition-colors duration-150 ${
                  pathname === "/membership" ? "text-csl-gold" : "text-white/85 hover:text-white"
                }`}
              >
                Membership
              </Link>
            </div>

            {/* CTA buttons */}
            <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-2.5">
              <Link
                href={authed ? "/member-portal" : "/login"}
                prefetch={false}
                className="block text-center px-4 py-2.5 rounded-lg text-[0.92rem] font-semibold border border-white text-white bg-transparent hover:bg-csl-mid transition-colors duration-200"
              >
                {authed ? "Member Portal" : "Member Login"}
              </Link>
              <Link
                href="/membership"
                className="block text-center px-4 py-2.5 rounded-lg text-[0.92rem] font-semibold bg-csl-gold text-csl-dark hover:brightness-105 transition-all duration-200"
              >
                Join CSL
              </Link>
            </div>
          </Container>
        </div>
      )}
    </nav>
  );
}
