"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export type ShellMember = {
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  membership_tier: string | null;
  plan_name: string | null;
  status: string | null;
  is_admin?: boolean | null;
};

type Props = {
  user: { email: string; id: string };
  member: ShellMember | null;
  children: React.ReactNode;
};

function toTitleCase(s: string): string {
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function displayName(member: ShellMember | null, email: string): string {
  if (member?.first_name && member.last_name)
    return toTitleCase(`${member.first_name} ${member.last_name}`);
  if (member?.first_name) return toTitleCase(member.first_name);
  if (member?.name) return toTitleCase(member.name);
  return email.split("@")[0];
}

function tierLabel(tier: string | null): string {
  if (tier === "monthly") return "Monthly Member";
  if (tier === "annual") return "Annual Member";
  if (tier === "lifetime") return "Lifetime Member";
  return "No active membership";
}

function StatusPill({ status }: { status: string | null }) {
  if (status === "active" || status === "trialing")
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
        &#9679; Active
      </span>
    );
  if (status === "past_due" || status === "payment_failed")
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
        &#9679; Payment Failed
      </span>
    );
  if (status === "cancelled" || status === "canceled")
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
        &#9679; Cancelled
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
      No membership
    </span>
  );
}

const NAV_LINKS = [
  { href: "/member-portal",                label: "Dashboard",      icon: "&#9776;"   },
  { href: "/member-portal?tab=membership", label: "My Membership",  icon: "&#128179;" },
  { href: "/member-portal?tab=documents",  label: "Documents",      icon: "&#128218;" },
  { href: "/member-portal?tab=enquiries",  label: "My Enquiries",   icon: "&#128269;" },
  { href: "/resolution",                   label: "Sign Resolution", icon: "&#128393;" },
  { href: "/member-portal?tab=profile",    label: "Edit Profile",   icon: "&#9998;"   },
];

const INACTIVITY_MS = 30 * 60 * 1000;

export default function PortalShell({ user, member, children }: Props) {
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    async function enforceSession() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        window.location.href = "/login";
      }
    }
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) void enforceSession();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    function resetTimer() {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(() => {
        void supabase.auth.signOut();
        sessionStorage.clear();
        window.location.href = "/login?reason=timeout";
      }, INACTIVITY_MS);
    }
    const activityEvents = ["mousemove", "keydown", "click", "scroll"] as const;
    activityEvents.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();
    return () => {
      activityEvents.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, []);

  const name = displayName(member, user.email);
  const tierDisplay = member?.plan_name ?? tierLabel(member?.membership_tier ?? null);

  async function handleSignOut() {
    setSigningOut(true);
    await createBrowserSupabase().auth.signOut();
    sessionStorage.clear();
    router.push("/");
    router.refresh();
  }

  return (
    <main>
      {/* Portal header */}
      <section className="bg-csl-dark text-white py-6">
        <div className="max-w-[1100px] mx-auto px-5 flex justify-between items-center gap-4">
          <div>
            <p className="text-csl-light/70 text-[0.75rem] font-semibold uppercase tracking-[0.12em]">
              Member Portal
            </p>
            <h1 className="text-xl font-extrabold mt-0.5">
              Welcome back, {name}
            </h1>
          </div>
          <StatusPill status={member?.status ?? null} />
        </div>
      </section>

      {/* Portal body */}
      <section className="bg-gray-50 min-h-[calc(100vh-200px)] py-8">
        <div className="max-w-[1100px] mx-auto px-5">
          <div className="grid grid-cols-1 lg:grid-cols-[220px,1fr] gap-6">

            {/* Sidebar */}
            <aside className="lg:sticky lg:top-6 lg:self-start">
              {/* Mobile: horizontal scroll nav */}
              <div className="lg:hidden overflow-x-auto mb-4">
                <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1.5 min-w-max">
                  {NAV_LINKS.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors text-gray-600 hover:bg-gray-100"
                    >
                      {item.label}
                    </Link>
                  ))}
                  {member?.is_admin && (
                    <>
                      {[
                        { href: "/member-portal/admin/members",       label: "Member Events" },
                        { href: "/member-portal/admin/cases",         label: "Cases"         },
                        { href: "/member-portal/admin/reporting",     label: "Reporting"     },
                        { href: "/member-portal/admin/operations",    label: "Operations"    },
                        { href: "/member-portal/admin/resolution",    label: "Resolution"    },
                        { href: "/member-portal/admin/documents/new", label: "Add Document"  },
                      ].map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                            pathname === item.href
                              ? "bg-csl-dark text-white"
                              : "text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Desktop sidebar card */}
              <div className="hidden lg:block bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-center mb-5 pb-5 border-b border-gray-100">
                  <div className="w-14 h-14 rounded-full bg-csl-light flex items-center justify-center text-2xl mx-auto mb-3">
                    &#9752;
                  </div>
                  <p className="font-bold text-gray-900 text-sm">{name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{tierDisplay}</p>
                  <p className="text-xs text-gray-400 mt-0.5 break-all">{user.email}</p>
                </div>

                <nav>
                  <ul className="space-y-0.5">
                    {NAV_LINKS.map((item) => (
                      <li key={item.label}>
                        <Link
                          href={item.href}
                          className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        >
                          <span dangerouslySetInnerHTML={{ __html: item.icon }} />
                          &nbsp;{item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>

                {member?.is_admin && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-gray-400 px-3 mb-1">
                      Admin
                    </p>
                    <ul className="space-y-0.5">
                      {[
                        { href: "/member-portal/admin/members",       icon: "&#128203;", label: "Member Events" },
                        { href: "/member-portal/admin/cases",         icon: "&#128269;", label: "Cases"          },
                        { href: "/member-portal/admin/reporting",     icon: "&#128202;", label: "Reporting"      },
                        { href: "/member-portal/admin/operations",    icon: "&#9881;",   label: "Operations"     },
                        { href: "/member-portal/admin/resolution",    icon: "&#128393;", label: "Resolution"     },
                        { href: "/member-portal/admin/documents/new", icon: "&#128196;", label: "Add Document"   },
                      ].map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                              pathname === item.href
                                ? "bg-csl-light text-csl-dark font-semibold"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            }`}
                          >
                            <span dangerouslySetInnerHTML={{ __html: item.icon }} />
                            &nbsp;{item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-5 pt-4 border-t border-gray-100 space-y-1">
                  <Link
                    href="/"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    &#8592; Back to website
                  </Link>
                  <button
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50"
                  >
                    {signingOut ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              </div>
            </aside>

            {/* Main content */}
            <div>{children}</div>
          </div>
        </div>
      </section>
    </main>
  );
}
