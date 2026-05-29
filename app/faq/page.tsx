"use client";

import { useState } from "react";
import { Container } from "@/components/Container";

const sections = [
  {
    heading: "About CSL",
    items: [
      { q: "What is Celtic Supporters Limited?", a: "Celtic Supporters Limited is a member-owned company formed to build a meaningful, organised fan shareholding in Celtic PLC. Our purpose is simple: unite dispersed fan shareholders, acquire additional shares over time, aggregate proxy voting power, and establish a credible, sustained fan voice at PLC level. We are not a protest group. We are not a pressure campaign. We are building structured shareholder influence." },
      { q: "What is the long-term goal?", a: "The long-term objective is to build a material shareholding and voting block capable of influencing governance outcomes at Celtic PLC. Success looks like: a large, coordinated fan voting bloc; meaningful leverage at AGMs and general meetings; structured dialogue at PLC level; and a seat at the table if shareholding scale justifies it. This is a long-term strategy. It will not be achieved overnight." },
      { q: "How is CSL different from other supporter bodies?", a: "CSL differs in three structural ways: we are a company with Articles of Association; we are building voting power through share acquisition and proxy aggregation; and we operate on one member, one vote internally. We are not dependent on annual resolutions alone. We are building ownership leverage." },
      { q: "How is CSL governed?", a: "CSL operates under formal Articles of Association. Key governance principles: one member one vote; directors are unpaid; major decisions subject to member approval where required; Register of Members maintained; financial records maintained and reported." },
      { q: "Are directors paid?", a: "No. All directors are unpaid and work on a voluntary basis. No subscription funds are distributed as profit or wages to directors." },
    ],
  },
  {
    heading: "Membership",
    items: [
      { q: "What is the membership structure?", a: "We currently offer monthly, annual, and lifetime membership. All membership types carry the same internal rights - one member, one vote. Paying more does not buy more influence. Lifetime membership exists because members asked for a one-off contribution option." },
      { q: "What are subscriptions used for?", a: "Subscription income is used for two purposes: share acquisition and running costs necessary to operate lawfully and credibly. Running costs include legal advice, compliance, accounting, technology, banking, and administration. We operate transparently and maintain proper records." },
      { q: "Where are funds held?", a: "Funds are held in a UK bank account in the name of Celtic Supporters Limited. CSL is responsible for safeguarding funds and maintaining financial controls." },
      { q: "What happens if I stop subscribing?", a: "Your CSL membership rights cease in accordance with our membership terms. Any shares owned by CSL remain owned by CSL. Subscription payments are not share purchases in your personal name." },
      { q: "Can Celtic Supporters Clubs join as lifetime members?", a: "CSL's Articles currently operate on a one member, one vote basis. If a CSC joins as a member, it would hold one internal vote, not multiple votes on behalf of its members. We are reviewing structural implications carefully before expanding membership categories." },
    ],
  },
  {
    heading: "Shares and Proxy",
    items: [
      { q: "Do members own shares directly?", a: "No. Shares purchased by CSL are owned by CSL as a company. Members do not receive individual share certificates in their personal name through CSL subscription. Members influence CSL's direction through internal voting rights." },
      { q: "If I already own Celtic PLC shares, do I lose them?", a: "No. Your shares always remain yours. If you appoint CSL as proxy for a meeting, that is voluntary and limited to that specific meeting. Proxy voting does not transfer ownership." },
      { q: "Do I need to be a member to give CSL my proxy?", a: "No. A shareholder can appoint CSL as proxy on a meeting-by-meeting basis without being a CSL member. Membership relates to internal CSL governance." },
      { q: "Can CSL sell its shares?", a: "CSL may sell shares if the directors and members determine that doing so is in the company's best interests and consistent with its purpose. Any major strategic decision would be subject to proper governance processes. CSL exists to build influence, not to trade shares opportunistically." },
    ],
  },
  {
    heading: "Governance and Strategy",
    items: [
      { q: "How many shares do you need to influence change?", a: "Influence depends on context. In general: 5% allows requisition of certain shareholder resolutions; 25% can block special resolutions; larger stakes increase leverage materially. Major shareholders currently control a significant majority of votes. The dispersed retail shareholder base accounts for a substantial minority. CSL's aim is to consolidate and expand that dispersed block." },
      { q: "Can CSL block a sale of the club?", a: "Only a shareholder or coalition holding sufficient voting percentage could influence such outcomes. CSL does not currently hold a blocking stake. Our strategy is to build scale over time." },
      { q: "What happens if a major shareholder sells?", a: "If a controlling shareholder sells, control transfers based on share ownership. CSL's objective is to ensure that fan representation is part of the governance landscape regardless of ownership structure." },
      { q: "Are you regulated by the FCA?", a: "CSL is not offering financial products or regulated investments. We are a member-owned company acquiring shares in a publicly listed company. We do not provide investment advice." },
      { q: "Is CSL against other supporter groups?", a: "No. CSL is independent. We respect the right of other groups to pursue their strategies. Where objectives align and members approve, cooperation is possible. Our mandate remains with CSL members." },
      { q: "Why now?", a: "A significant minority of shares sit with dispersed fans. Major shareholders hold dominant voting power. Fragmentation weakens influence. Coordination strengthens it. If we repeat past approaches, we repeat past outcomes." },
      { q: "How can non-shareholders help?", a: "You can become a member, support share acquisition, amplify messaging, encourage shareholder engagement, and attend briefings. Ownership influence is built collectively." },
      { q: "What would success look like in five years?", a: "Thousands of engaged members, a consolidated fan voting block, recognised stakeholder status, structured dialogue at PLC level, and material influence in governance matters." },
    ],
  },
];

export default function FaqPage() {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-csl-dark to-csl-mid text-white py-[60px]">
        <div className="absolute -top-[60px] -right-[60px] w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <div className="absolute -bottom-[100px] left-[20%] w-[300px] h-[300px] bg-white/[0.03] rounded-full" />
        <Container className="relative z-10">
          <div className="max-w-[680px]">
            <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.15] tracking-tight mb-5">
              Frequently Asked Questions
            </h1>
            <p className="text-[1.1rem] text-white/85 max-w-[540px] leading-[1.7]">
              Clear answers to the most common questions about CSL, our membership model, and our
              strategy.
            </p>
          </div>
        </Container>
      </section>

      {/* FAQ CONTENT */}
      <section className="py-[72px]">
        <Container>
          <div className="max-w-[820px]">
            {sections.map((section) => (
              <div key={section.heading} className="mb-12">
                <h2 className="text-[1.15rem] font-extrabold text-csl-dark mb-5 pb-2 border-b-2 border-csl-light uppercase tracking-wide">
                  {section.heading}
                </h2>
                <div className="space-y-2">
                  {section.items.map((item) => {
                    const id = `${section.heading}-${item.q}`;
                    const isOpen = openItems.has(id);
                    return (
                      <div key={id} className="border border-gray-200 rounded-xl overflow-hidden">
                        <button
                          onClick={() => toggle(id)}
                          className="w-full flex items-center justify-between px-6 py-4 text-left bg-white hover:bg-gray-50 transition-colors duration-150"
                          aria-expanded={isOpen}
                        >
                          <span className="font-semibold text-gray-900 text-[0.95rem] pr-4 leading-[1.5]">
                            {item.q}
                          </span>
                          <svg
                            className={`w-4 h-4 text-csl-dark flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isOpen && (
                          <div className="px-6 pb-5 pt-1 bg-white border-t border-gray-100">
                            <p className="text-gray-600 text-[0.93rem] leading-[1.75]">{item.a}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
