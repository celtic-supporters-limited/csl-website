import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Membership Agreement | Celtic Supporters Limited",
  description: "CSL membership and volunteer data processing agreements.",
};

export default function MembershipAgreementPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-csl-dark to-csl-mid text-white px-[5%] py-[60px]">
        <div className="absolute -top-[60px] -right-[60px] w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <div className="relative z-10 max-w-[680px]">
          <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.15] tracking-tight mb-5">
            Membership Agreement
          </h1>
          <p className="text-[1.1rem] text-white/85 max-w-[540px] leading-[1.7]">
            Membership &amp; Volunteer Agreements
          </p>
        </div>
      </section>

      {/* MEMBERS SECTION */}
      <section className="px-[5%] py-[72px]">
        <div className="max-w-[780px] mx-auto">
          <h2 className="text-[1.4rem] font-extrabold text-gray-900 mb-8 pb-3 border-b-2 border-csl-dark">
            Members
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div>
              <h3 className="text-[1rem] font-bold text-csl-dark mb-4 uppercase tracking-wide">
                By joining CSL, you agree to:
              </h3>
              <ul className="space-y-3">
                {[
                  "Support the aims and values of CSL",
                  "Maintain accurate contact details",
                  "Pay membership fees as agreed",
                  "Comply with CSL's Articles of Association",
                  "Act respectfully toward other members, volunteers and staff",
                  "Not claim to speak on behalf of CSL without permission",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-gray-700 text-[0.93rem] leading-[1.65]">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-csl-dark flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-[1rem] font-bold text-csl-dark mb-4 uppercase tracking-wide">
                CSL agrees to:
              </h3>
              <ul className="space-y-3">
                {[
                  "Provide transparent governance",
                  "Use funds responsibly",
                  "Maintain member voting rights",
                  "Protect personal data",
                  "Communicate updates and progress clearly",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-gray-700 text-[0.93rem] leading-[1.65]">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-csl-dark flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-gray-600 text-[0.93rem] leading-[1.7] bg-csl-light rounded-xl px-6 py-4">
            Membership is voluntary and can be cancelled at any time. CSL may revoke membership for
            serious misconduct.
          </p>
        </div>
      </section>

      {/* VOLUNTEERS SECTION */}
      <section className="bg-gray-50 px-[5%] py-[72px]">
        <div className="max-w-[780px] mx-auto">
          <h2 className="text-[1.4rem] font-extrabold text-gray-900 mb-2 pb-3 border-b-2 border-csl-dark">
            Volunteers
          </h2>
          <p className="text-gray-500 text-[0.88rem] mb-10">Volunteer Data Processing Contract</p>
          <p className="text-gray-700 text-[0.95rem] leading-[1.8] mb-10">
            This agreement applies to anyone acting as a volunteer for CSL.
          </p>

          <VolSection number="1" title="Definition">
            <p>
              Volunteers may access limited personal data for specific tasks such as share tracing,
              member support or admin duties.
            </p>
          </VolSection>

          <VolSection number="2" title="Obligations of the Volunteer">
            <p>Volunteers must:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2 text-gray-700 text-[0.93rem] leading-[1.75]">
              <li>Use personal data only for assigned tasks</li>
              <li>Not download, copy or transfer data without permission</li>
              <li>Not share data with any third party</li>
              <li>Follow CSL&apos;s security procedures</li>
              <li>Immediately report data breaches</li>
              <li>Return or delete all data when tasks end</li>
              <li>Maintain confidentiality permanently</li>
            </ul>
          </VolSection>

          <VolSection number="3" title="Obligations of CSL">
            <p>CSL will:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2 text-gray-700 text-[0.93rem] leading-[1.75]">
              <li>Provide secure systems for data access</li>
              <li>Limit volunteer access to the minimum necessary</li>
              <li>Provide training and guidance</li>
              <li>Retain responsibility as Data Controller</li>
              <li>Maintain GDPR compliance</li>
            </ul>
          </VolSection>

          <VolSection number="4" title="Legal Basis">
            <p>
              Volunteers act under CSL&apos;s legitimate interest in providing services to members.
            </p>
          </VolSection>

          <VolSection number="5" title="Termination">
            <p>
              Access may be revoked at any time. Volunteers must delete all data immediately when
              access ends.
            </p>
          </VolSection>
        </div>
      </section>
    </>
  );
}

function VolSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h3 className="text-[1rem] font-bold text-gray-900 mb-3 pb-2 border-b border-gray-200">
        <span className="text-csl-dark mr-1.5">{number}.</span>
        {title}
      </h3>
      <div className="space-y-2 text-gray-700 text-[0.93rem] leading-[1.75]">{children}</div>
    </div>
  );
}
