"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";

// ── Types (exported so page.tsx can reference them) ──────────────────────────

export type Member = {
  id: string;
  email: string;
  name: string | null;
  stripe_customer_id: string | null;
  membership_tier: string | null;
  status: string | null;
  created_at: string;
};

export type PortalEvent = {
  id: string;
  title: string | null;
  event_date: string | null;
  recording_url: string | null;
  slides_url: string | null;
  members_only: boolean;
};

export type PortalCase = {
  id: string;
  contact_name: string | null;
  email: string | null;
  case_type: string | null;
  status: string | null;
  created_at: string;
};

type Props = {
  user: { email: string; id: string };
  member: Member | null;
  events: PortalEvent[];
  cases: PortalCase[];
};

type Tab = "dashboard" | "subscription" | "recordings" | "enquiries" | "settings";

// ── Helpers ───────────────────────────────────────────────────────────────────

function tierLabel(tier: string | null): string {
  if (tier === "monthly") return "Monthly Member";
  if (tier === "annual") return "Annual Member";
  if (tier === "lifetime") return "Lifetime Member";
  return "No active membership";
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function StatusPill({ status }: { status: string | null }) {
  if (status === "active")
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
        &#9679; Active
      </span>
    );
  if (status === "payment_failed")
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
        &#9679; Payment Failed
      </span>
    );
  if (status === "cancelled")
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

function CaseStatusBadge({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    New: "bg-blue-50 text-blue-700 border-blue-200",
    "In Progress": "bg-amber-50 text-amber-700 border-amber-200",
    Resolved: "bg-green-50 text-green-700 border-green-200",
  };
  const cls = map[status ?? ""] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {status ?? "Unknown"}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-6 ${className}`}>
      {children}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0 gap-4">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{children}</span>
    </div>
  );
}

// ── Tab components ────────────────────────────────────────────────────────────

function DashboardTab({
  member,
  events,
  cases,
  onTabChange,
}: {
  member: Member | null;
  events: PortalEvent[];
  cases: PortalCase[];
  onTabChange: (tab: Tab) => void;
}) {
  if (!member) {
    return (
      <Card>
        <div className="text-center py-8">
          <div className="text-4xl mb-3">&#9752;</div>
          <h3 className="font-bold text-gray-900 mb-2">No active membership found</h3>
          <p className="text-gray-500 text-sm mb-5">
            Your email is verified but no membership record was found. If you have
            recently joined, it may take a few minutes to appear.
          </p>
          <Link
            href="/membership"
            className="inline-block bg-csl-dark text-white font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-csl-mid transition-colors"
          >
            Join CSL
          </Link>
        </div>
      </Card>
    );
  }

  const recentEvents = events.slice(0, 2);

  return (
    <div className="space-y-5">
      {member.status === "payment_failed" && (
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
          <span className="flex-shrink-0">&#9888;&#65039;</span>
          <div>
            <strong>Payment failed.</strong> Your last payment could not be
            processed.{" "}
            <button
              onClick={() => onTabChange("subscription")}
              className="font-semibold underline hover:no-underline"
            >
              View subscription details.
            </button>
          </div>
        </div>
      )}

      <Card>
        <h3 className="font-bold text-gray-900 mb-4">Membership Overview</h3>
        <DetailRow label="Status">
          <StatusPill status={member.status} />
        </DetailRow>
        <DetailRow label="Plan">{tierLabel(member.membership_tier)}</DetailRow>
        <DetailRow label="Member since">{formatDate(member.created_at)}</DetailRow>
        {member.stripe_customer_id && (
          <DetailRow label="Stripe Customer ID">
            <span className="font-mono text-xs text-gray-500">
              {member.stripe_customer_id}
            </span>
          </DetailRow>
        )}
      </Card>

      {recentEvents.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Recent Content</h3>
            <button
              onClick={() => onTabChange("recordings")}
              className="text-csl-dark text-xs font-semibold hover:underline"
            >
              View all
            </button>
          </div>
          <div className="space-y-3">
            {recentEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{ev.title ?? "Untitled"}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(ev.event_date)}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {ev.recording_url && (
                    <a
                      href={ev.recording_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-csl-dark hover:text-csl-mid"
                    >
                      Watch
                    </a>
                  )}
                  {ev.slides_url && (
                    <a
                      href={ev.slides_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                    >
                      Slides
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-bold text-gray-900 mb-4">My Enquiries</h3>
        {cases.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-gray-400 text-sm mb-3">No enquiries submitted yet.</p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/share-tracing"
                className="text-xs font-semibold text-csl-dark hover:underline"
              >
                Trace my shares
              </Link>
              <span className="text-gray-300">|</span>
              <Link
                href="/proxy"
                className="text-xs font-semibold text-csl-dark hover:underline"
              >
                Assign proxy
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {cases.slice(0, 3).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 gap-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.case_type}</p>
                  <p className="text-xs text-gray-400">{formatDate(c.created_at)}</p>
                </div>
                <CaseStatusBadge status={c.status} />
              </div>
            ))}
            {cases.length > 3 && (
              <button
                onClick={() => onTabChange("enquiries")}
                className="mt-1 text-xs font-semibold text-csl-dark hover:underline"
              >
                View all {cases.length} enquiries
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function SubscriptionTab({ member }: { member: Member | null }) {
  if (!member) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">No membership record found.</p>
          <Link
            href="/membership"
            className="mt-4 inline-block bg-csl-dark text-white font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-csl-mid transition-colors"
          >
            Join CSL
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-bold text-gray-900 mb-4">Current Subscription</h3>
        <DetailRow label="Plan">{tierLabel(member.membership_tier)}</DetailRow>
        <DetailRow label="Status">
          <StatusPill status={member.status} />
        </DetailRow>
        <DetailRow label="Member since">{formatDate(member.created_at)}</DetailRow>
        {member.membership_tier === "lifetime" && (
          <DetailRow label="Renewal">Lifetime - no renewal required</DetailRow>
        )}
        <div className="mt-5 pt-4 border-t border-gray-100 text-sm text-gray-500">
          <p>
            To cancel or update your payment method, contact{" "}
            <a
              href="mailto:membership@celticsupporterslimited.net"
              className="text-csl-dark hover:underline font-medium"
            >
              membership@celticsupporterslimited.net
            </a>
            . Direct Stripe billing management will be available in an upcoming update.
          </p>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold text-gray-900 mb-2">Payment History</h3>
        <p className="text-sm text-gray-400 mb-4">
          Full payment history from Stripe will be shown here once billing webhooks are configured (Phase 6).
        </p>
        <DetailRow label={formatDate(member.created_at)}>
          Membership activated - {tierLabel(member.membership_tier)}
        </DetailRow>
      </Card>

      {member.membership_tier !== "lifetime" && (
        <Card>
          <h3 className="font-bold text-gray-900 mb-2">Upgrade</h3>
          <p className="text-sm text-gray-500 mb-4">
            Upgrade to Lifetime membership for a single one-off payment of &pound;5,000.
          </p>
          <Link
            href="/membership"
            className="inline-block bg-csl-dark text-white font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-csl-mid transition-colors"
          >
            View membership options
          </Link>
        </Card>
      )}
    </div>
  );
}

function RecordingsTab({ events }: { events: PortalEvent[] }) {
  return (
    <Card>
      <h3 className="font-bold text-gray-900 mb-1">Content Library</h3>
      <p className="text-sm text-gray-400 mb-5">
        Member-only recordings, presentations and governance briefings.
      </p>

      {events.length === 0 ? (
        <div className="text-center py-10">
          <div className="text-3xl mb-3">&#127909;</div>
          <p className="text-gray-500 text-sm">No content has been published yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center gap-4 py-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-csl-light flex items-center justify-center text-xl">
                {ev.recording_url ? "🎥" : "📋"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {ev.title ?? "Untitled"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDate(ev.event_date)}
                  {ev.members_only && (
                    <span className="ml-2 text-csl-dark font-medium">
                      Members only
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {ev.recording_url && (
                  <a
                    href={ev.recording_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block bg-csl-dark text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-csl-mid transition-colors"
                  >
                    Watch
                  </a>
                )}
                {ev.slides_url && (
                  <a
                    href={ev.slides_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block border border-csl-dark text-csl-dark text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-csl-light transition-colors"
                  >
                    Slides
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function EnquiriesTab({ cases }: { cases: PortalCase[] }) {
  return (
    <Card>
      <h3 className="font-bold text-gray-900 mb-1">My Share Enquiries</h3>
      <p className="text-sm text-gray-400 mb-5">
        Track the progress of any share tracing or proxy assignment enquiries you have submitted.
      </p>

      {cases.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center">
          <div className="text-3xl mb-3">&#128236;</div>
          <p className="font-semibold text-gray-900 mb-1">No active enquiries</p>
          <p className="text-sm text-gray-400 mb-5">
            Submit a share tracing or proxy enquiry to see it tracked here.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/share-tracing"
              className="inline-block bg-csl-dark text-white font-semibold px-5 py-2 rounded-lg text-sm hover:bg-csl-mid transition-colors"
            >
              Trace my shares
            </Link>
            <Link
              href="/proxy"
              className="inline-block border border-csl-dark text-csl-dark font-semibold px-5 py-2 rounded-lg text-sm hover:bg-csl-light transition-colors"
            >
              Assign proxy
            </Link>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {cases.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">{c.case_type}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Submitted {formatDate(c.created_at)}
                </p>
              </div>
              <CaseStatusBadge status={c.status} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SettingsTab({
  member,
  userEmail,
}: {
  member: Member | null;
  userEmail: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(member?.name ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setStatus("saving");
    setErrorMsg("");

    const res = await fetch("/api/member/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setStatus("error");
      setErrorMsg(data.error ?? "Failed to save changes.");
      return;
    }

    setStatus("saved");
    router.refresh();
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-bold text-gray-900 mb-4">Account Details</h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label
              htmlFor="settings-name"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              Full name
            </label>
            <input
              id="settings-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={status === "saving"}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-csl-dark focus:border-transparent disabled:opacity-60"
              placeholder="Your full name"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Email address
            </label>
            <p className="text-[0.95rem] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
              {userEmail}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Email is tied to your login and cannot be changed here.
            </p>
          </div>

          {status === "error" && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              {errorMsg}
            </p>
          )}
          {status === "saved" && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
              Changes saved.
            </p>
          )}

          <button
            type="submit"
            disabled={status === "saving" || !name.trim()}
            className="bg-csl-dark text-white font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-csl-mid transition-colors disabled:opacity-60"
          >
            {status === "saving" ? "Saving..." : "Save changes"}
          </button>
        </form>
      </Card>

      <Card>
        <h3 className="font-bold text-gray-900 mb-2">Contact</h3>
        <p className="text-sm text-gray-500">
          For membership queries email{" "}
          <a
            href="mailto:membership@celticsupporterslimited.net"
            className="text-csl-dark hover:underline font-medium"
          >
            membership@celticsupporterslimited.net
          </a>
          .
        </p>
      </Card>
    </div>
  );
}

// ── Main portal component ─────────────────────────────────────────────────────

const NAV_ITEMS: { tab: Tab; label: string; icon: string }[] = [
  { tab: "dashboard", label: "Dashboard", icon: "&#9776;" },
  { tab: "subscription", label: "Subscription", icon: "&#128179;" },
  { tab: "recordings", label: "Recordings Library", icon: "&#127909;" },
  { tab: "enquiries", label: "My Enquiries", icon: "&#128269;" },
  { tab: "settings", label: "Account Settings", icon: "&#9881;" },
];

export default function PortalClient({ user, member, events, cases }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();

  const displayName = member?.name ?? user.email.split("@")[0];

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
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
              Welcome back, {displayName}
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
                  {NAV_ITEMS.map(({ tab, label }) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                        activeTab === tab
                          ? "bg-csl-dark text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Desktop sidebar card */}
              <div className="hidden lg:block bg-white rounded-xl border border-gray-200 p-5">
                {/* Avatar + identity */}
                <div className="text-center mb-5 pb-5 border-b border-gray-100">
                  <div className="w-14 h-14 rounded-full bg-csl-light flex items-center justify-center text-2xl mx-auto mb-3">
                    &#9752;
                  </div>
                  <p className="font-bold text-gray-900 text-sm">{displayName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{tierLabel(member?.membership_tier ?? null)}</p>
                </div>

                {/* Nav */}
                <nav>
                  <ul className="space-y-0.5">
                    {NAV_ITEMS.map(({ tab, label, icon }) => (
                      <li key={tab}>
                        <button
                          onClick={() => setActiveTab(tab)}
                          className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                            activeTab === tab
                              ? "bg-csl-light text-csl-dark font-semibold"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          }`}
                          dangerouslySetInnerHTML={{
                            __html: `<span>${icon}</span>&nbsp;${label}`,
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </nav>

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

              {/* Mobile sign-out */}
              <div className="lg:hidden flex justify-end">
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="text-xs text-red-500 hover:underline disabled:opacity-50"
                >
                  {signingOut ? "Signing out..." : "Sign out"}
                </button>
              </div>
            </aside>

            {/* Main content */}
            <div>
              {activeTab === "dashboard" && (
                <DashboardTab
                  member={member}
                  events={events}
                  cases={cases}
                  onTabChange={setActiveTab}
                />
              )}
              {activeTab === "subscription" && (
                <SubscriptionTab member={member} />
              )}
              {activeTab === "recordings" && (
                <RecordingsTab events={events} />
              )}
              {activeTab === "enquiries" && (
                <EnquiriesTab cases={cases} />
              )}
              {activeTab === "settings" && (
                <SettingsTab member={member} userEmail={user.email} />
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
