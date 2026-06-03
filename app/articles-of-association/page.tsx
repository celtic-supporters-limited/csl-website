import type { Metadata } from "next";
import { Container } from "@/components/Container";

export const metadata: Metadata = {
  title: "Articles of Association | Celtic Supporters Limited",
  description:
    "Articles of Association of Celtic Supporters Limited (Company Number SC862186), adopted 13 October 2025. Private company limited by guarantee, registered in Scotland.",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-14 mb-2">
      <span className="inline-block bg-csl-light text-csl-dark text-xs font-bold uppercase tracking-[0.15em] px-3 py-1 rounded">
        {children}
      </span>
    </div>
  );
}

function ArticleHeading({ id, number, title }: { id: string; number: string; title: string }) {
  return (
    <h2
      id={id}
      className="text-lg font-bold text-gray-900 mt-8 mb-4 pb-2 border-b border-gray-200"
    >
      <span className="text-csl-dark mr-1">{number}.</span> {title}
    </h2>
  );
}

function P({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-gray-700 leading-relaxed text-[0.95rem] mb-3 ${className}`}>
      {children}
    </p>
  );
}

function Sub({ number, children }: { number: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 text-gray-700 leading-relaxed text-[0.95rem]">
      <span className="font-semibold text-gray-900">{number}</span>{" "}
      {children}
    </div>
  );
}

function SubNested({ number, children }: { number: string; children: React.ReactNode }) {
  return (
    <div className="ml-6 mb-2 text-gray-700 leading-relaxed text-[0.95rem]">
      <span className="font-semibold text-gray-900">{number}</span>{" "}
      {children}
    </div>
  );
}


export default function ArticlesOfAssociation() {
  return (
    <main>
      {/* Hero */}
      <section className="bg-csl-dark text-white py-14">
        <Container><div className="max-w-[800px]">
          <p className="text-csl-light/80 text-xs font-bold uppercase tracking-[0.15em] mb-3">
            Legal Document
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-3">
            Articles of Association
          </h1>
          <p className="text-white/80 text-lg mb-1">Celtic Supporters Limited</p>
          <p className="text-white/55 text-sm">
            Companies Act 2006 &middot; Private Company Limited by Guarantee &middot; Company Number SC862186 &middot; Adopted 13 October 2025
          </p>
        </div></Container>
      </section>

      {/* Document body */}
      <section className="py-12 bg-white">
        <Container><div className="max-w-[800px]">
          <p className="text-[0.8rem] text-gray-500 uppercase tracking-widest font-semibold mb-8 pb-4 border-b border-gray-100">
            Articles of the Companies Act 2006: Private Company Limited by Guarantee
          </p>

          {/* Article 1 */}
          <ArticleHeading id="article-1" number="1" title="INTERPRETATION" />

          <Sub number="1.1">
            In these Articles, unless the context otherwise requires:
          </Sub>
          <div className="ml-6 mb-4 space-y-2 text-gray-700 text-[0.95rem] leading-relaxed">
            <p><strong className="text-gray-900">Act:</strong> means the Companies Act 2006;</p>
            <p><strong className="text-gray-900">Articles:</strong> means the Company&apos;s articles of association for the time being in force;</p>
            <p><strong className="text-gray-900">Board:</strong> means the board of directors of the Company from time to time;</p>
            <p><strong className="text-gray-900">Business Day:</strong> means any day (other than a Saturday, Sunday or public holiday in the United Kingdom) on which clearing banks in Edinburgh are generally open for business;</p>
            <p><strong className="text-gray-900">Club:</strong> means Celtic PLC (company number SC003487);</p>
            <p><strong className="text-gray-900">Conflict:</strong> means a situation in which a director has or can have, a direct or indirect interest that conflicts or possibly may conflict, with the interests of the Company;</p>
            <p><strong className="text-gray-900">Eligible Director:</strong> means a director who would be entitled to vote on the matter at a meeting of directors (but excluding in relation to the authorisation of a Conflict pursuant to article 11, any director whose vote is not to be counted in respect of the particular matter);</p>
            <p><strong className="text-gray-900">Member:</strong> means a member of the Company;</p>
            <p><strong className="text-gray-900">Model Articles:</strong> means the model articles for private companies limited by guarantee contained in Schedule 2 of the Companies (Model Articles) Regulations 2008 (SI 2008/3229) as amended prior to the date of adoption of these Articles and reference to a numbered &quot;Model Article&quot; is a reference to that article of the Model Articles;</p>
            <p><strong className="text-gray-900">Objects:</strong> means the objects of the Company set out in article 2;</p>
            <p><strong className="text-gray-900">Register of Members:</strong> means the register of members which the Company is required to keep in accordance with section 113 of the Act; and</p>
            <p><strong className="text-gray-900">Rules:</strong> means the rules established by directors under article 30 from time to time.</p>
          </div>
          <Sub number="1.2">
            Save as otherwise specifically provided in these Articles, words and expressions which have particular meanings in the Model Articles shall have the same meanings in these Articles.
          </Sub>
          <Sub number="1.3">
            Headings in these Articles are used for convenience only and shall not affect the construction or interpretation of these Articles.
          </Sub>
          <Sub number="1.4">
            A reference in these Articles to an &quot;article&quot; is a reference to the relevant article of these Articles unless expressly provided otherwise.
          </Sub>
          <Sub number="1.5">
            Unless expressly provided otherwise, a reference to a statute, statutory provision or subordinate legislation is a reference to it as it is in force from time to time, taking account of:
          </Sub>
          <SubNested number="1.5.1">any subordinate legislation from time to time made under it; and</SubNested>
          <SubNested number="1.5.2">any amendment or re-enactment and includes any statute, statutory provision or subordinate legislation which it amends or re-enacts.</SubNested>
          <Sub number="1.6">
            Any phrase introduced by the terms &quot;including&quot;, &quot;include&quot;, &quot;in particular&quot; or any similar expression shall be construed as illustrative and shall not limit the sense of the words preceding those terms.
          </Sub>
          <Sub number="1.7">
            The Model Articles shall apply to the Company, except in so far as they are modified or excluded by these Articles.
          </Sub>
          <Sub number="1.8">
            Model Articles 2, 8, 9(1), 11(2) and (3), 13, 14(1), (2), (3) and (4), 17(1), 22(2), (3), 30(2) and (3), 35, 38 and 39 shall not apply to the Company.
          </Sub>
          <Sub number="1.9">
            Model Article 7 shall be amended by:
          </Sub>
          <SubNested number="1.9.1">
            the insertion of the words &quot;for the time being&quot; at the end of article 7(2)(a); and
          </SubNested>
          <SubNested number="1.9.2">
            the insertion in article 7(2) of the words &quot;(for so long as he remains the sole director)&quot; after the words &quot;and the director may&quot;.
          </SubNested>
          <Sub number="1.10">
            Model Article 20 shall be amended by the insertion of the words &quot;including the secretary (if any)&quot; before the words &quot;properly incur&quot;.
          </Sub>

          {/* Article 2 */}
          <ArticleHeading id="article-2" number="2" title="OBJECTS" />
          <P>The Objects for which the Company is established are:</P>
          <Sub number="2.1">Primary Objects</Sub>
          <SubNested number="2.1.1">
            to acquire, either directly or through a subsidiary, all or any of the shares or other securities in the Club; and
          </SubNested>
          <SubNested number="2.1.2">
            to hold any and all shares or securities acquired in the Club for the benefit of supporters of the Club and the members of the Company.
          </SubNested>
          <Sub number="2.2">Secondary Objects</Sub>
          <SubNested number="2.2.1">
            to promote the success, financial security and operational stability of the Club, and, consistent with these purposes, encourage funding of every description for the Club, including donations to support its activities;
          </SubNested>
          <SubNested number="2.2.2">
            to promote and develop support for the Club from existing and new supporters anywhere in the world;
          </SubNested>
          <SubNested number="2.2.3">
            to strengthen the bonds between the Club and the communities which it serves and to represent the interests of those communities to the Club;
          </SubNested>
          <SubNested number="2.2.4">
            to encourage the Club to take proper account of the interests of its supporters in its decisions; and
          </SubNested>
          <SubNested number="2.2.5">
            to encourage and promote the principle of supporter representation on the board of the Club.
          </SubNested>

          {/* Article 3 */}
          <ArticleHeading id="article-3" number="3" title="POWERS" />
          <Sub number="3.1">In pursuance of the Objects, the Company has the power to:</Sub>
          <SubNested number="3.1.1">raise money in such manner as the directors shall think fit;</SubNested>
          <SubNested number="3.1.2">invest and deal with the funds of the Company not immediately required for its operations in or upon such investments, securities or bank deposits as may be thought fit;</SubNested>
          <SubNested number="3.1.3">lobby, advertise, publish, educate, examine, research and survey in respect of all matters of law, regulation, economics, accounting, governance, politics and/or other issues and to hold meetings, events and other procedures and co-operate with or assist any other body or organisation in each case in such way or by such means as may, in the opinion of the directors, affect or advance the principal Objects in any way;</SubNested>
          <SubNested number="3.1.4">pay all or any expenses incurred in connection with the promotion, formation and incorporation of the Company and to contract with any person, firm or company to pay the same;</SubNested>
          <SubNested number="3.1.5">enter into contracts to provide services to or on behalf of other bodies;</SubNested>
          <SubNested number="3.1.6">provide and assist in the provision of money, materials or other help;</SubNested>
          <SubNested number="3.1.7">open and operate bank accounts and other facilities for banking; incorporate subsidiary companies to carry on any trade;</SubNested>
          <SubNested number="3.1.8">promote any company or other entity whose activities may further one or more of the Objects, or may generate income to support the activities of the Company;</SubNested>
          <SubNested number="3.1.9">support any charitable trusts, associations or institutions formed for any of the purposes included in the Objects;</SubNested>
          <SubNested number="3.1.10">enter into any partnership or joint venture arrangement with any other body or bodies for any purpose consistent with the Objects;</SubNested>
          <SubNested number="3.1.11">employ, or otherwise engage any person, company and other body to perform services or act on its behalf from time to time and to remunerate such person (including employees, consultants, agents and professional advisers);</SubNested>
          <SubNested number="3.1.12">insure the Company&apos;s property and activities against the usual risks;</SubNested>
          <SubNested number="3.1.13">lend and advance money, or give credit, or enter into guarantees, contracts of indemnity or suretyships of any kind, or guarantee the payment of any sums of money or the performance of any obligation by any company, firm or person including any holding company; and</SubNested>
          <SubNested number="3.1.14">do all such other lawful things as are incidental, ancillary or conducive to the pursuit or to the attainment of any of the Objects.</SubNested>

          {/* Article 4 */}
          <ArticleHeading id="article-4" number="4" title="NOT FOR DISTRIBUTION" />
          <Sub number="4.1">Subject to article 4.3, the income and property of the Company shall be applied solely in promoting the Objects.</Sub>
          <Sub number="4.2">The Company shall not accumulate, nor shall it hold, at any time assets or cash in hand or at bank in excess of what is deemed necessary by the Board for the proper conduct and administration of the Company, and the achievement of its Objects.</Sub>
          <Sub number="4.3">
            No dividends or bonus may be paid or capital otherwise returned to the Members, provided that nothing in these Articles shall prevent any payment in good faith by the Company of:
          </Sub>
          <SubNested number="4.3.1">reasonable and proper remuneration to any Member, officer or servant of the Company for any services rendered to the Company;</SubNested>
          <SubNested number="4.3.2">reasonable and proper rent for premises demised or let by any Member or director;</SubNested>
          <SubNested number="4.3.3">reasonable out-of-pocket expenses properly incurred by any director;</SubNested>
          <SubNested number="4.3.4">reasonable payment to members for goods, facilities or services supplied or made to the Company; or</SubNested>
          <SubNested number="4.3.5">to provide an indemnity from the Company.</SubNested>

          {/* Article 5 */}
          <ArticleHeading id="article-5" number="5" title="WINDING UP" />
          <Sub number="5.1">
            On the winding-up or dissolution of the Company, any assets or property that remains available to be distributed or paid to the Members shall not be paid or distributed to such Members but shall be transferred to such body (charitable or otherwise) to be determined by the Members at the time of winding up or dissolution:
          </Sub>
          <SubNested number="5.1.1">with objects similar to those of the Company; and</SubNested>
          <SubNested number="5.1.2">which shall prohibit the distribution of its or their income to its or their members.</SubNested>

          {/* Article 6 */}
          <ArticleHeading id="article-6" number="6" title="GUARANTEE" />
          <Sub number="6.1">
            The liability of each Member is limited to &pound;1, being the amount that each Member undertakes to contribute to the assets of the Company in the event of its being wound up while he is a Member or within one year after he ceases to be a Member, for:
          </Sub>
          <SubNested number="6.1.1">payment of the Company&apos;s debts and liabilities contracted before he ceases to be a Member,</SubNested>
          <SubNested number="6.1.2">payment of the costs, charges and expenses of the winding up, and</SubNested>
          <SubNested number="6.1.3">adjustment of the rights of the contributories among themselves.</SubNested>

          {/* Article 7 */}
          <ArticleHeading id="article-7" number="7" title="UNANIMOUS DECISIONS" />
          <Sub number="7.1">A decision of the directors is taken in accordance with this article when all Eligible Directors indicate to each other by any means that they share a common view on a matter.</Sub>
          <Sub number="7.2">Such a decision may take the form of a resolution in writing, where each Eligible Director has signed one or more copies of it, or to which each Eligible Director has otherwise indicated agreement in writing.</Sub>
          <Sub number="7.3">A decision may not be taken in accordance with this article if the Eligible Directors would not have formed a quorum at such a meeting.</Sub>

          {/* Article 8 */}
          <ArticleHeading id="article-8" number="8" title="CALLING A DIRECTORS' MEETING" />
          <Sub number="8.1">Any director may call a directors&apos; meeting by giving notice of the meeting to the directors or by authorising the company secretary (if any) to give such notice.</Sub>
          <Sub number="8.2">Notice of a directors&apos; meeting shall be given to each director in writing.</Sub>
          <Sub number="8.3">A director who is absent from the UK and who has no registered address in the UK shall not be entitled to notice of the directors&apos; meeting.</Sub>

          {/* Article 9 */}
          <ArticleHeading id="article-9" number="9" title="QUORUM FOR DIRECTORS' MEETINGS" />
          <Sub number="9.1">Subject to article 9.2, the quorum for the transaction of business at a meeting of directors is any four Eligible Directors.</Sub>
          <Sub number="9.2">For the purposes of any meeting (or part of a meeting) held pursuant to article 11 to authorise a Conflict, if there are less than six or four (as appropriate) Eligible Directors in office other than the Interested Director(s) (defined in article 11.1), the quorum for such meeting (or part of a meeting) shall be equal to the number of Eligible Directors.</Sub>
          <Sub number="9.3">If the total number of directors in office for the time being is less than the quorum required, the directors must not take any decision other than a decision to call a general meeting so as to enable the Members to appoint further directors.</Sub>

          {/* Article 10 */}
          <ArticleHeading id="article-10" number="10" title="CASTING VOTE" />
          <P>If the numbers of votes for and against a proposal at a meeting of directors are equal, the chairman or other director chairing the meeting shall have a casting vote.</P>

          {/* Article 11 */}
          <ArticleHeading id="article-11" number="11" title="DIRECTORS' CONFLICTS OF INTEREST" />
          <Sub number="11.1">The directors may, in accordance with the requirements set out in this article, authorise any Conflict proposed to them by any director which would, if not authorised, involve a director (an &quot;Interested Director&quot;) breaching his duty under section 175 of the Act to avoid conflicts of interest.</Sub>
          <Sub number="11.2">Any authorisation under this article 11 shall be effective only if:</Sub>
          <SubNested number="11.2.1">the matter in question shall have been proposed by any director for consideration in the same way that any other matter may be proposed to the directors under the provisions of these Articles or in such other manner as the directors may determine;</SubNested>
          <SubNested number="11.2.2">any requirement as to the quorum for consideration of the relevant matter is met without counting the Interested Director; and</SubNested>
          <SubNested number="11.2.3">the matter was agreed to without the Interested Director voting or would have been agreed to if the Interested Director&apos;s vote had not been counted.</SubNested>
          <Sub number="11.3">Any authorisation of a Conflict under this article 11 may (whether at the time of giving the authorisation or subsequently):</Sub>
          <SubNested number="11.3.1">extend to any actual or potential conflict of interest which may reasonably be expected to arise out of the matter or situation so authorised;</SubNested>
          <SubNested number="11.3.2">provide that the Interested Director be excluded from the receipt of documents and information and the participation in discussions (whether at meetings of the directors or otherwise) related to the Conflict;</SubNested>
          <SubNested number="11.3.3">provide that the Interested Director shall or shall not be an Eligible Director in respect of any future decision of the directors in relation to any resolution related to the Conflict;</SubNested>
          <SubNested number="11.3.4">impose upon the Interested Director such other terms for the purposes of dealing with the Conflict as the directors think fit;</SubNested>
          <SubNested number="11.3.5">
            <span className="block mt-1 ml-4">(a) provide that, where the Interested Director obtains, or has obtained (through his involvement in the Conflict and otherwise than through his position as a director of the Company) information that is confidential to a third party, he shall not be obliged to disclose that information to the Company, or to use it in relation to the Company&apos;s affairs where to do so would amount to a breach of that confidence; and</span>
            <span className="block mt-2 ml-4">(b) permit the Interested Director to absent himself from the discussion of matters relating to the Conflict at any meeting of the directors and be excused from reviewing papers prepared by, or for, the directors to the extent they relate to such matters.</span>
          </SubNested>
          <Sub number="11.4">Where the directors authorise a Conflict, the Interested Director shall be obliged to conduct himself in accordance with any terms and conditions imposed by the directors in relation to the Conflict.</Sub>
          <Sub number="11.5">The directors may revoke or vary such authorisation at any time, but this shall not affect anything done by the Interested Director prior to such revocation or variation in accordance with the terms of such authorisation.</Sub>
          <Sub number="11.6">A director is not required, by reason of being a director (or because of the fiduciary relationship established by reason of being a director), to account to the Company for any remuneration, profit or other benefit which he derives from or in connection with a relationship involving a Conflict which has been authorised by the directors in accordance with these Articles or by the Company in general meeting (subject in each case to any terms, limits or conditions attaching to that authorisation) and no contract shall be liable to be avoided on such grounds.</Sub>
          <Sub number="11.7">Subject to sections 177(5) and 177(6) and sections 182(5) and 182(6) of the Act, and provided he has declared the nature and extent of his interest in accordance with the requirements of the Act, a director who is in any way, whether directly or indirectly, interested in an existing or proposed transaction or arrangement with the Company:</Sub>
          <SubNested number="11.7.1">may be a party to, or otherwise interested in, any transaction or arrangement with the Company or in which the Company is otherwise (directly or indirectly) interested;</SubNested>
          <SubNested number="11.7.2">shall be an Eligible Director for the purposes of any proposed decision of the directors (or committee of directors) in respect of such existing or proposed transaction or arrangement in which he is interested;</SubNested>
          <SubNested number="11.7.3">shall be entitled to vote at a meeting of directors (or of a committee of the directors) or participate in any unanimous decision, in respect of such existing or proposed transaction or arrangement in which he is interested;</SubNested>
          <SubNested number="11.7.4">may act by himself or his firm in a professional capacity for the Company (otherwise than as auditor) and he or his firm shall be entitled to remuneration for professional services as if he were not a director;</SubNested>
          <SubNested number="11.7.5">may be a director or other officer of, or employed by, or a party to a transaction or arrangement with, or otherwise interested in, any body corporate in which the Company is otherwise (directly or indirectly) interested; and</SubNested>
          <SubNested number="11.7.6">shall not, save as he may otherwise agree, be accountable to the Company for any benefit which he (or a person connected with him (as defined in section 252 of the Act)) derives from any such transaction or arrangement or from any such office or employment or from any interest in any such body corporate and no such transaction or arrangement shall be liable to be avoided on the grounds of any such interest or benefit nor shall the receipt of any such remuneration or other benefit constitute a breach of his duty under section 176 of the Act.</SubNested>

          {/* Article 12 */}
          <ArticleHeading id="article-12" number="12" title="RECORDS OF DECISIONS TO BE KEPT" />
          <P>Where decisions of the directors are taken by electronic means, such decisions shall be recorded by the directors in permanent form, so that they may be read with the naked eye.</P>

          {/* Article 13 */}
          <ArticleHeading id="article-13" number="13" title="NUMBER OF DIRECTORS AND METHODS OF APPOINTING" />
          <Sub number="13.1">The number of directors shall be up to a maximum of ten, but shall not be less than three, but the remaining directors shall have power to act notwithstanding any vacancies until the vacancies are filled.</Sub>
          <Sub number="13.2">Subject to these Articles, any person who is willing to act as a director, and is permitted by law to do so, may be appointed or elected as a Director as provided in article 14, provided that the appointment does not cause the number of directors in office for the time being to exceed any maximum number fixed or otherwise determined in accordance with these Articles.</Sub>
          <Sub number="13.3">No director may appoint as an alternate any other director, or any other person, to exercise that director&apos;s powers.</Sub>

          {/* Article 14 */}
          <ArticleHeading id="article-14" number="14" title="ELIGIBILITY AND ELECTION OF DIRECTORS" />
          <Sub number="14.1">Only Members who are natural persons aged 16 years or more at the time their appointments take effect may be appointed directors.</Sub>
          <Sub number="14.2">No person shall be eligible for appointment as a director who:</Sub>
          <SubNested number="14.2.1">is subject to a sequestration order or has in place any arrangement or composition with his creditors or the equivalent thereof in any jurisdiction to which the person is subject;</SubNested>
          <SubNested number="14.2.2">is prohibited from being a director by law;</SubNested>
          <SubNested number="14.2.3">has, within five years before the day of nomination or appointment, been convicted in the United Kingdom of any offence and has had passed on him a sentence of imprisonment (whether suspended or not) for a period of not less than three months without the option of a fine; or</SubNested>
          <SubNested number="14.2.4">is or may on the basis of medical evidence be suffering from mental disorder.</SubNested>
          <Sub number="14.3">No Member shall be eligible for appointment as a director at a general meeting unless nominated for election by notice in writing signed by not less than 20 Members (or, if less, one tenth of the total number of Members at the time), each of whom (i) has been a Member throughout the period of six months ending with the date of nomination; (ii) is aged 16 years or more; and (iii) is duly qualified to attend and vote at the annual general meeting. Any such notice must be delivered to the registered office of the Company, addressed to the Company, not less than 42 clear days before the date appointed for the meeting, and must be accompanied by a statement signed by the candidate stating (i) his willingness to be appointed, and (ii) the particulars which would, if he were appointed, be required to be included in the Company&apos;s register of directors. The notice may consist of several documents in like form, each signed by one or more of the nominating Members. Any nomination received less than 42 clear days before the date appointed for the annual general meeting shall be ineffective, and shall not be carried forward as a nomination for the next election at the next annual general meeting.</Sub>
          <Sub number="14.4">Elections of Directors shall be conducted either:</Sub>
          <SubNested number="14.4.1">on a poll of the Members taken at the annual general meeting; or</SubNested>
          <SubNested number="14.4.2">if the directors so determine, by ballot of the Members conducted in accordance with article 32 in that part of the Company&apos;s financial year which precedes the date of the annual general meeting, in which event the result shall be declared at the annual general meeting.</SubNested>
          <div className="ml-6 mb-3 text-gray-700 leading-relaxed text-[0.95rem]">
            Subject to article 14.6.3, the vacancies shall be filled by those candidates obtaining the most votes in their favour. The Members entitled to vote in an election of Directors conducted by ballot are those Members who, on the voting date, are entitled to vote on an ordinary resolution.
          </div>
          <Sub number="14.5">If, on the election of Directors, there are more candidates than vacancies to be filled by the election, each Member entitled to vote in the election shall have one vote in respect of each vacancy, but cannot be required to cast all or any of his votes.</Sub>
          <Sub number="14.6">If, on the election of Directors, there are not more candidates than vacancies to be filled by the election:</Sub>
          <SubNested number="14.6.1">each Member entitled to vote in the election shall have one vote in respect of every candidate, but cannot be required to cast all or any of his votes;</SubNested>
          <SubNested number="14.6.2">each vote shall be capable of being cast either for or against the candidate concerned; and</SubNested>
          <SubNested number="14.6.3">a candidate shall be elected if, and only if, more votes are cast for him than against him.</SubNested>
          <Sub number="14.7">The directors may establish Rules in respect of any election of Directors to govern, or provide guidance in respect of, the conduct of campaigning by candidates.</Sub>
          <Sub number="14.8">Unless otherwise determined by the directors, a candidate for election may not withdraw his nomination after the notice of the meeting at which the election is to be conducted or (as the case may be) the notice of ballot is sent out.</Sub>
          <Sub number="14.9">All candidates shall be entitled to furnish the Company, before the closing date for nomination of candidates, with an election address of not more than 500 words.</Sub>
          <Sub number="14.10">Subject to article 14.12, the Company shall send a copy of each address to each Member who is entitled to vote in the election.</Sub>
          <Sub number="14.11">Each Member&apos;s copy shall be sent in the same manner and, so far as practicable, at the same time as, the notice of the meeting at which the election is to be conducted or (as the case may be) the notice of ballot is sent out, or as soon as is practicable thereafter, but failure to do so shall not invalidate the election.</Sub>
          <Sub number="14.12">Article 14.10 does not require the Company to send copies of an address to Members in any case where the rights conferred by that article are being abused to seek needless publicity for a defamatory matter or for frivolous or vexatious purposes, or where the address does not relate directly to the affairs of the Company.</Sub>
          <Sub number="14.13">The notice of any annual general meeting at which an election is to be conducted by poll shall specify the full name of each candidate for the office of director.</Sub>
          <Sub number="14.14">A director elected to office by ballot in accordance with article 32 shall be deemed to have been elected at the annual general meeting at which the result of the ballot is announced.</Sub>
          <Sub number="14.15">References in this article 14 to the appointment or election of directors include (unless inconsistent with the subject or context) the reappointment or (as the case may be) re-election of directors.</Sub>

          {/* Article 15 */}
          <ArticleHeading id="article-15" number="15" title="VACATION OF OFFICE OF DIRECTOR" />
          <Sub number="15.1">Article 18 of the Model Articles shall be amended by the addition of the following events upon the occurrence of which a person shall cease to be a director:</Sub>
          <SubNested number="15.1.1">he ceases to be a Member;</SubNested>
          <SubNested number="15.1.2">all of the other directors resolve that he cease to be a director;</SubNested>
          <SubNested number="15.1.3">he is absent without the permission of the directors from directors&apos; meetings for six consecutive months and the directors decide that his office be vacated.</SubNested>

          {/* Article 16 */}
          <ArticleHeading id="article-16" number="16" title="SECRETARY" />
          <P>The directors may appoint any person who is willing to act as the secretary for such term, at such remuneration and upon such conditions as they may think fit and from time to time remove such person and, if the directors so decide, appoint a replacement, in each case by a decision of the directors.</P>

          {/* Article 17 */}
          <ArticleHeading id="article-17" number="17" title="REMUNERATION OF DIRECTORS" />
          <div className="mb-3 text-gray-700 leading-relaxed text-[0.95rem]">
            <span className="font-semibold text-gray-900">(a)</span> The directors shall not be entitled to be paid any remuneration for undertaking any services for the Company, whether by way of employment or otherwise.
          </div>
          <div className="mb-3 text-gray-700 leading-relaxed text-[0.95rem]">
            <span className="font-semibold text-gray-900">(b)</span> The Company may pay any reasonable expenses which the directors properly incur in connection with the exercise of their powers and the discharge of their responsibilities in relation to the company.
          </div>

          {/* Membership section */}
          <SectionLabel>Membership</SectionLabel>

          {/* Article 18 */}
          <ArticleHeading id="article-18" number="18" title="APPLICATION FOR MEMBERSHIP" />
          <Sub number="18.1">No person shall become a Member unless he or she has completed an application for membership in a form approved by the directors from time to time, or has otherwise agreed to become a Member in a way acceptable to the directors. A document shall be sent to each successful applicant confirming their membership of the Company, and the details of each successful applicant shall be entered into the Register of Members by the Company.</Sub>
          <Sub number="18.2">The directors may decline to accept any application for membership if, acting reasonably and properly, they consider it is in the best interests of the Company as a whole to decline to accept, and need not give reasons for doing so.</Sub>

          {/* Article 19 */}
          <ArticleHeading id="article-19" number="19" title="CLASSES OF MEMBERSHIP" />
          <Sub number="19.1">The directors may establish different classes of Members and set out their respective rights and obligations.</Sub>
          <Sub number="19.2">A person under the age of 16 years may be a Member, but shall not be entitled to vote at any general meeting of the Company held before he reaches the age of 16.</Sub>

          {/* Article 20 */}
          <ArticleHeading id="article-20" number="20" title="CLUB DIRECTORS" />
          <P>No Club director shall be eligible to be a director of the Company.</P>

          {/* Article 21 */}
          <ArticleHeading id="article-21" number="21" title="TERMINATION OF MEMBERSHIP" />
          <Sub number="21.1">The directors may establish Rules about when a person&apos;s membership terminates, including Rules about termination of membership if a particular payment is not made to the Company within a prescribed period.</Sub>
          <Sub number="21.2">The directors may terminate the membership of any Member without his consent by giving him written notice if, in the reasonable opinion of the directors:</Sub>
          <SubNested number="21.2.1">he is guilty of conduct which has or is likely to have a serious adverse effect on the Company or bring the Company or any or all of the Members and directors into disrepute; or</SubNested>
          <SubNested number="21.2.2">he has acted or has threatened to act in a manner which is contrary to the interests of the Company as a whole; or</SubNested>
          <SubNested number="21.2.3">he has failed to observe the terms of these Articles and the Rules.</SubNested>
          <div className="ml-6 mb-3 text-gray-700 leading-relaxed text-[0.95rem]">
            Following such termination, the Member shall be removed from the Register of Members by the Company.
          </div>
          <Sub number="21.3">The notice to the Member under article 21.2 must give the Member the opportunity to be heard in writing or in person as to why his membership should not be terminated. The directors must consider any representations made by the Member and inform the Member of their decision following such consideration. There shall be no right to appeal from a decision of the directors to terminate the membership of a Member.</Sub>
          <Sub number="21.4">A Member whose membership terminates pursuant to this article 21, and a Member who withdraws from membership under article 22.1 of the Model Articles, shall not be entitled to a refund of any contribution, subscription or entrance fee, and shall remain liable to pay to the Company any subscription or other sum owed by him.</Sub>

          {/* Meetings section */}
          <SectionLabel>Meetings of Members</SectionLabel>

          {/* Article 22 */}
          <ArticleHeading id="article-22" number="22" title="ANNUAL GENERAL MEETINGS" />
          <P>An annual general meeting shall be held in each period of nine months beginning with the day following the Company&apos;s accounting reference date, at such place, date and time as may be determined by the directors.</P>

          {/* Article 23 */}
          <ArticleHeading id="article-23" number="23" title="ARRANGEMENTS FOR GENERAL MEETINGS" />
          <Sub number="23.1">A general meeting (including an annual general meeting) may only be validly called by notice of at least 14 days. The period of notice shall be exclusive of the day on which it is served or deemed to be served and of the day on which the meeting is to be held.</Sub>
          <Sub number="23.2">The directors may make arrangements for Members and proxies who are entitled to attend and participate in a general meeting, but who cannot be seated in the main meeting room where the chairman will be, to attend and take part in a general meeting in an overflow room or rooms. Any overflow room must have appropriate links to the main room and must enable audio-visual communication between the meeting rooms throughout the meeting.</Sub>
          <Sub number="23.3">The directors will decide how to divide Members and proxies between the main room and the overflow room. If an overflow room is used, the meeting will be treated as being held and taking place in the main meeting room and the meeting will consist of all the Members and proxies who are attending both in the main meeting room and the overflow room.</Sub>
          <Sub number="23.4">Details of any arrangements for overflow rooms will be set out in the notice of the meeting but failure to do so will not invalidate the meeting.</Sub>
          <Sub number="23.5">To facilitate the organisation and administration of any general meeting, the directors may decide that the meeting shall be held at two or more locations, in accordance with the following provisions:</Sub>
          <SubNested number="23.5.1">for the purposes of these Articles, any general meeting of the Company taking place at two or more locations shall be treated as taking place where the chairman of the meeting presides (the &quot;principal meeting place&quot;) and any other location where that meeting takes place is referred in these Articles as a &quot;satellite meeting&quot;;</SubNested>
          <SubNested number="23.5.2">a Member present in person or by proxy at a satellite meeting may be counted in the quorum and may exercise all rights that they would have been able to exercise if they were present at the principal meeting place;</SubNested>
          <SubNested number="23.5.3">the directors may make and change from time to time such arrangements as they shall in their absolute discretion consider appropriate to:
            <span className="block mt-2 ml-4">(a) ensure that all Members and proxies for Members wishing to attend the meeting can do so;</span>
            <span className="block mt-1 ml-4">(b) ensure that all persons attending the meeting are able to participate in the business of the meeting and to see and hear anyone else addressing the meeting;</span>
            <span className="block mt-1 ml-4">(c) ensure the safety of persons attending the meeting and the orderly conduct of the meeting; and</span>
            <span className="block mt-1 ml-4">(d) restrict the numbers of Members and proxies at any one location to such number as can safely and conveniently be accommodated there;</span>
          </SubNested>
          <SubNested number="23.5.4">the entitlement of any Member or proxy to attend a satellite meeting shall be subject to any such arrangements then in force and stated by the notice of the meeting or adjourned meeting to apply to the meeting;</SubNested>
          <SubNested number="23.5.5">if there is a failure of communication equipment or any other failure in the arrangements for participation in the meeting at more than one place, the chairman may adjourn the meeting in accordance with these Articles. Such adjournment will not affect the validity of such meeting, or any business conducted at such meeting up to the point of adjournment, or any action taken pursuant to such meeting; and</SubNested>
          <SubNested number="23.5.6">a person (&quot;satellite chairman&quot;) appointed by the directors shall preside at each satellite meeting. Every satellite chairman shall carry out all requests made of him by the chairman of the meeting, may take such action as he thinks necessary to maintain the proper and orderly conduct of the satellite meeting and shall have all powers necessary or desirable for such purposes.</SubNested>
          <Sub number="23.6">The directors may direct that persons wishing to attend any general meeting should submit to such searches or other security arrangements or restrictions as the directors consider appropriate, and may authorise one or more persons to refuse entry to, or to eject from, such general meeting any person who fails to submit to such searches or to otherwise comply with such security arrangements or restrictions.</Sub>

          {/* Article 24 */}
          <ArticleHeading id="article-24" number="24" title="PROCEDURE AT GENERAL MEETINGS" />
          <Sub number="24.1">Members (or, if less, one tenth of the total number of Members at the time) present in person or by proxy and entitled to attend and to vote on the business to be transacted at a general meeting shall be a quorum for all purposes.</Sub>
          <Sub number="24.2">The chairman of a general meeting shall take such action as he thinks fit to promote the orderly conduct of the business of the meeting as laid down in the notice of the meeting, and the chairman&apos;s decision, taken in good faith, on matters of procedure or arising incidentally from the business of the meeting shall be final, as shall be his determination as to whether any matter is of such a nature.</Sub>
          <Sub number="24.3">The chairman may invite any person to attend and speak at any general meeting of the Company whom the chairman considers to be equipped with knowledge or experience of the Company&apos;s activities to assist in the deliberations of the meeting.</Sub>

          {/* Article 25 */}
          <ArticleHeading id="article-25" number="25" title="VOTES OF MEMBERS" />
          <P>Subject to the Act and article 19.2, at any general meeting, every Member who is present in person (or by proxy) shall on a show of hands have one vote and every Member present in person (or by proxy) shall on a poll (subject to articles 14.5 and 14.6) have one vote.</P>

          {/* Article 26 */}
          <ArticleHeading id="article-26" number="26" title="DEMANDING A POLL" />
          <Sub number="26.1">Article 30(2)(c) of the Model Articles shall be amended by substituting the word &quot;five&quot; for the word &quot;two&quot;.</Sub>
          <Sub number="26.2">Article 30(3) of the Model Articles shall be amended by the insertion of the words &quot;A demand so withdrawn shall not invalidate the result of a show of hands declared before the demand was made&quot; as a new paragraph at the end of that article.</Sub>
          <Sub number="26.3">A poll may not be demanded on the election of a person to chair a meeting or on a question of adjournment.</Sub>

          {/* Article 27 */}
          <ArticleHeading id="article-27" number="27" title="PROCEDURE ON POLL" />
          <Sub number="27.1">Polls at general meetings must be taken when, where and in such manner (including the use of ballot or voting papers or tickets) as the chairman of the meeting directs.</Sub>
          <Sub number="27.2">The chairman of the meeting may appoint scrutineers (who need not be Members) and decide how and when the result of the poll is to be declared.</Sub>
          <Sub number="27.3">The result of a poll shall be the decision of the meeting in respect of the resolution on which the poll was demanded.</Sub>
          <Sub number="27.4">A poll must be taken within 30 days of the date of the meeting at which the poll was demanded.</Sub>
          <Sub number="27.5">A demand for a poll does not prevent a general meeting from continuing, except as regards the question on which the poll was demanded.</Sub>
          <Sub number="27.6">No notice need be given of a poll not taken immediately if the time and place at which it is to be taken are announced at the meeting at which it is demanded. In any other case, at least 7 days&apos; notice must be given specifying the time and place at which the poll is to be taken.</Sub>

          {/* Article 28 */}
          <ArticleHeading id="article-28" number="28" title="PROXIES" />
          <Sub number="28.1">Article 31(1) of the Model Articles shall be amended by the insertion of the words &quot;and a proxy notice which is not delivered in such manner shall be invalid, unless the directors, in their discretion, accept the notice at any time before the meeting&quot; as a new paragraph at the end of that Article.</Sub>
          <Sub number="28.2">Article 31(3) of the Model Articles shall be amended by the substitution, for the words &quot;on one or more resolutions&quot;, of the words &quot;at the meeting&quot;.</Sub>
          <Sub number="28.3">Any notice of a general meeting must specify the address or addresses (&quot;proxy notification address&quot;) at which the Company or its agents will receive proxy notices relating to that meeting, or any adjournment of it, delivered in hard copy or electronic form.</Sub>
          <Sub number="28.4">Subject to articles 28.5 and 28.6, a proxy notice must be delivered to a proxy notification address not less than 48 hours before the general meeting or adjourned meeting to which it relates.</Sub>
          <Sub number="28.5">In the case of a poll taken more than 48 hours after it is demanded, the notice must be delivered to a proxy notification address not less than 24 hours before the time appointed for the taking of the poll.</Sub>
          <Sub number="28.6">In the case of a poll not taken during the meeting but taken not more than 48 hours after it was demanded, the proxy notice must be delivered:</Sub>
          <SubNested number="28.6.1">in accordance with article 28.4; or</SubNested>
          <SubNested number="28.6.2">at the meeting at which the poll was demanded to the chairman, secretary (if any) or any director.</SubNested>
          <Sub number="28.7">An appointment under a proxy notice may be revoked by delivering a notice in writing given by or on behalf of the person by whom or on whose behalf the proxy notice was given to a proxy notification address.</Sub>
          <Sub number="28.8">A notice revoking a proxy appointment only takes effect if it is delivered before:</Sub>
          <SubNested number="28.8.1">the start of the meeting or adjourned meeting to which it relates; or</SubNested>
          <SubNested number="28.8.2">
            (in the case of a poll not taken on the same day as the meeting or adjourned meeting) the time appointed for taking the poll to which it relates.
          </SubNested>
          <SubNested number="28.8.3">
            The directors may at their discretion determine that, in calculating the periods mentioned in this article 28, no account shall be taken of any part of a day that is not a working day.
          </SubNested>

          {/* Article 29 */}
          <ArticleHeading id="article-29" number="29" title="CORPORATE REPRESENTATIVES" />
          <Sub number="29.1">A corporation (whether or not a company within the meaning of the Act) which is a Member may nominate any individual as its representative at any meeting of the Company.</Sub>
          <Sub number="29.2">The representative shall be entitled to exercise the same powers on behalf of the corporation as the corporation could exercise if it were an individual Member.</Sub>
          <Sub number="29.3">The corporation shall for the purposes of these Articles be deemed to be present in person at any such meeting if its representative is present at it, and all references to attendance and voting in person shall be construed accordingly.</Sub>
          <Sub number="29.4">A director or the Company Secretary (if any) may require the representative to produce evidence of his authority reasonably satisfactory to them before permitting him to exercise his powers.</Sub>

          {/* Administrative Arrangements section */}
          <SectionLabel>Administrative Arrangements</SectionLabel>

          {/* Article 30 */}
          <ArticleHeading id="article-30" number="30" title="MEANS OF COMMUNICATION TO BE USED" />
          <Sub number="30.1">Any notice, document or other information shall be deemed served on or delivered to a Member by the Company:</Sub>
          <SubNested number="30.1.1">if properly addressed and sent by prepaid United Kingdom first class post to an address in the United Kingdom, 24 hours after it was posted;</SubNested>
          <SubNested number="30.1.2">if properly addressed and delivered by hand, when it was given or left at the appropriate address;</SubNested>
          <SubNested number="30.1.3">if properly addressed and sent or supplied by electronic means, one hour after the document or information was sent or supplied; and</SubNested>
          <SubNested number="30.1.4">if sent or supplied by means of a website, when the material is first made available on the website or (if later) when the Member receives (or is deemed to have received) notice of the fact that the material is available on the website.</SubNested>
          <div className="ml-6 mb-3 text-gray-700 leading-relaxed text-[0.95rem]">
            For the purposes of this article 30, no account shall be taken of any part of a day that is not a Business Day.
          </div>
          <Sub number="30.2">In proving that any notice, document or other information was properly addressed, it shall suffice to show that the notice, document or other information was addressed to an address permitted for the purpose by the Act.</Sub>
          <Sub number="30.3">A Member who, for the purposes of the Register of Members, registers only a postal address that is not within the United Kingdom shall not be entitled to receive any notice, document or other information from the Company.</Sub>
          <Sub number="30.4">A Member present in person or by proxy at any general meeting of the Company shall be deemed to have received notice of the meeting and of the purposes for which it was called.</Sub>

          {/* Article 31 */}
          <ArticleHeading id="article-31" number="31" title="RULES" />
          <Sub number="31.1">The directors may from time to time establish, alter and repeal such rules as they may deem necessary or expedient for the proper conduct and management of the Company. If there is a conflict between the terms of these Articles and any rules established under this article 31, the terms of these Articles shall prevail.</Sub>
          <Sub number="31.2">Without prejudice to any other provision of these Articles, Rules may make provision for the following matters, but are not restricted to them:</Sub>
          <SubNested number="31.2.1">the admission of Members (including the admission of corporate or unincorporated bodies to membership), and in particular the admission criteria for Members;</SubNested>
          <SubNested number="31.2.2">classes of Members and the rights and privileges of such Members;</SubNested>
          <SubNested number="31.2.3">the entrance fees, subscriptions, contributions and other fees or payments to be made by Members, subject always to article 18.2;</SubNested>
          <SubNested number="31.2.4">the conduct of election campaigning (article 14.7); and</SubNested>
          <SubNested number="31.2.5">the procedure at general meetings, in so far as such procedure is not regulated by the Act or these Articles, and arrangements for facilitating the organisation and administration of any general meeting.</SubNested>
          <Sub number="31.3">The directors shall adopt such means as they deem sufficient to bring to the notice of Members all Rules, alterations and repeals, and the Rules, so long as they are in force, shall be binding upon all Members.</Sub>

          {/* Article 32 */}
          <ArticleHeading id="article-32" number="32" title="BALLOTS TO ELECT DIRECTORS" />
          <Sub number="32.1">Where the directors determine under article 14.4.2 that the voting in an election of directors shall be conducted by ballot, the ballot shall be conducted in accordance with such arrangements and procedure as the directors shall determine, subject to the following principles:</Sub>
          <SubNested number="32.1.1">notice of the ballot shall be given, in the same way as notice of a general meeting is to be given (which may be in hard copy form or electronic form, or by means of a website), to every Member who would be entitled to vote in the election if the voting date fell on the date of the notice of postal ballot;</SubNested>
          <SubNested number="32.1.2">the voting date, and the address to which completed voting forms must be returned, must be clearly specified in the notice, and the period between the date of the notice and the voting date must be at least 14 days (exclusive of the date on which the notice is given and the voting date);</SubNested>
          <SubNested number="32.1.3">the notice must be accompanied by or incorporate a voting form and such explanatory notes as the directors may decide;</SubNested>
          <SubNested number="32.1.4">the Company must meet the postage costs (if any) of returning voting papers by post;</SubNested>
          <SubNested number="32.1.5">the votes cast must be fairly and accurately counted (subject to articles 32.3 and 32.6), and the count shall be overseen by an independent person;</SubNested>
          <SubNested number="32.1.6">a voting form shall be void if a Member votes for more candidates than there are vacancies to be filled; and</SubNested>
          <SubNested number="32.1.7">the announcement of election results at an annual general meeting pursuant to article 14.4.2 shall include the number of votes cast for each candidate.</SubNested>
          <div className="ml-6 mb-3 text-gray-700 leading-relaxed text-[0.95rem]">
            An address specified under article 32.1.2 may be an electronic address to which completed voting forms can be returned by electronic means.
          </div>
          <Sub number="32.3">In any case where a postal ballot is conducted, the directors may make such arrangements and provision as they think fit to permit some of the voting to be conducted by way of an electronic ballot (being a ballot in which Members have access on a website to a facility for registering their votes throughout the period beginning with the date of the notice of ballot and ending with the voting date). The arrangements and provision made by the directors may include (but need not be limited to) regulations prescribing:</Sub>
          <SubNested number="32.3.1">the manner in which the votes of Members who vote electronically may be registered;</SubNested>
          <SubNested number="32.3.2">the manner in which the authenticity and integrity of the votes of Members who vote electronically is to be established; and</SubNested>
          <SubNested number="32.3.3">the consequences of any irregularities occurring in the course of the electronic ballot, including the validity of multiple votes cast by a Member in the same election.</SubNested>
          <Sub number="32.4">Where access to the voting facility in an electronic ballot is available for a part but not all of the period beginning with the date of the notice of ballot and ending with the voting date, and the failure to make it available throughout the period is wholly attributable to circumstances which it would not be reasonable to have expected the Company to prevent or avoid, such failure shall not invalidate the ballot.</Sub>
          <Sub number="32.5">The accidental omission to give notice of a postal ballot or electronic ballot, or to send a voting form, to any person entitled to receive it, or non-receipt of such a notice or voting form by such a person, shall not invalidate the ballot.</Sub>
          <Sub number="32.6">If, on a postal ballot or electronic ballot:</Sub>
          <SubNested number="32.6.1">any votes are counted that ought not to have been counted; or</SubNested>
          <SubNested number="32.6.2">any votes are not counted that ought to have been counted,</SubNested>
          <div className="ml-6 mb-3 text-gray-700 leading-relaxed text-[0.95rem]">
            the error shall not vitiate the decision arrived at unless it has been in the opinion of the independent person referred to in article 32.1.5, of sufficient magnitude so to do.
          </div>

          {/* Registration details */}
          <div className="mt-14 pt-8 border-t-2 border-gray-200">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4 text-[0.9rem]">
              <div>
                <dt className="font-semibold text-gray-900">Registered Office</dt>
                <dd className="text-gray-600 mt-0.5">56 Ashton Lane, Glasgow G12 8SJ</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-900">Company Number</dt>
                <dd className="text-gray-600 mt-0.5">SC862186</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-900">ICO Registration</dt>
                <dd className="text-gray-600 mt-0.5">ZB985030</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-900">LEI Number</dt>
                <dd className="text-gray-600 mt-0.5">984500CDVAFEBEF83781</dd>
              </div>
            </dl>
          </div>
        </div></Container>
      </section>
    </main>
  );
}
