/**
 * The four texts of one saved wording, read-only. Shared between the current
 * wording panel and the wording history entries on
 * app/member-portal/admin/resolution/ResolutionAdminClient.tsx, so the two
 * never drift out of sync with each other or with what the public page
 * actually renders. Renders plain text nodes only, never an input or
 * textarea - that absence is what makes the immutability of body/
 * declaration_text/consent_text/supporting_statement visible in the UI, not
 * just enforced in the database.
 */

export type WordingRow = {
  id: string;
  version_label: string;
  body: string;
  declaration_text: string;
  consent_text: string;
  supporting_statement: string | null;
};

function ContentBlock({
  icon,
  label,
  text,
}: {
  icon: React.ReactNode;
  label: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-csl-light text-csl-dark" aria-hidden="true">
          {icon}
        </span>
        <p className="text-[0.68rem] font-bold uppercase tracking-wider text-csl-dark">{label}</p>
      </div>
      <p className="text-[0.82rem] text-gray-800 leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}

const iconProps = { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "1.6", className: "w-3.5 h-3.5" };

export function WordingContent({ wording }: { wording: WordingRow }) {
  return (
    <div className="space-y-2.5">
      <ContentBlock
        label="Resolution"
        text={wording.body}
        icon={
          <svg {...iconProps}>
            <rect x="4" y="3" width="12" height="14" rx="1" />
            <path d="M7 7h6M7 10h6M7 13h4" strokeLinecap="round" />
          </svg>
        }
      />
      {wording.supporting_statement && (
        <ContentBlock
          label="Supporting Statement"
          text={wording.supporting_statement}
          icon={
            <svg {...iconProps}>
              <path d="M4 5h12v7H9l-3 3v-3H4V5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
      )}
      <ContentBlock
        label="Declaration"
        text={wording.declaration_text}
        icon={
          <svg {...iconProps}>
            <path d="M10 3l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V5l6-2z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7.5 10l2 2 3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
      />
      <ContentBlock
        label="Consent"
        text={wording.consent_text}
        icon={
          <svg {...iconProps}>
            <rect x="5" y="9" width="10" height="7" rx="1" />
            <path d="M7 9V6a3 3 0 016 0v3" strokeLinecap="round" />
          </svg>
        }
      />
    </div>
  );
}
