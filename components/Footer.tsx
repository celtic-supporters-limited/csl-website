import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white/70">
      <div className="max-w-[1100px] mx-auto px-5 pt-12 pb-7">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-10">
          <div>
            <div className="font-extrabold text-[1.1rem] text-white mb-2.5">
              &#9752; Celtic Supporters Limited
            </div>
            <p className="text-[0.85rem] leading-[1.7]">
              A not-for-profit organisation committed to governance-led change at
              Celtic FC, representing the collective voice of thousands of
              shareholders and supporters.
            </p>
          </div>

          <div>
            <h4 className="text-white text-[0.85rem] font-bold mb-3.5 uppercase tracking-widest">
              Services
            </h4>
            <ul className="space-y-2">
              <li>
                <Link href="/share-tracing" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Share Tracing
                </Link>
              </li>
              <li>
                <Link href="/proxy" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Proxy Assignment
                </Link>
              </li>
              <li>
                <Link href="/membership" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Membership
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white text-[0.85rem] font-bold mb-3.5 uppercase tracking-widest">
              Members
            </h4>
            <ul className="space-y-2">
              <li>
                <Link href="/member-portal" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Member Portal
                </Link>
              </li>
              <li>
                <Link href="/member-portal" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Meeting Recordings
                </Link>
              </li>
              <li>
                <Link href="/membership" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Upgrade Subscription
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white text-[0.85rem] font-bold mb-3.5 uppercase tracking-widest">
              Organisation
            </h4>
            <ul className="space-y-2">
              <li>
                <Link href="#" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  About CSL
                </Link>
              </li>
              <li>
                <Link href="#" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="#" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-2.5 text-[0.8rem]">
          <span>&#169; 2026 Celtic Supporters Limited. All rights reserved.</span>
          <span>Registered in Scotland. Not affiliated with Celtic FC or Celtic PLC.</span>
        </div>
      </div>
    </footer>
  );
}
