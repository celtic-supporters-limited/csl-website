import Link from "next/link";
import { Container } from "@/components/Container";

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.146zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function BlueskyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-3.51 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white/70">
      <Container className="pt-12 pb-7">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-10">
          <div>
            <div className="font-extrabold text-[1.1rem] text-white mb-2.5">
              &#9752; Celtic Supporters Limited
            </div>
            <p className="text-[0.85rem] leading-[1.7] mb-4">
              A not-for-profit organisation committed to governance-led change at
              Celtic FC, representing the collective voice of thousands of
              shareholders and supporters.
            </p>
            <div className="flex gap-4">
              <a
                href="https://x.com/celticCSL"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors duration-150"
                aria-label="Follow us on X"
              >
                <XIcon />
              </a>
              <a
                href="https://bsky.app/profile/celticsupporters.bsky.social"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors duration-150"
                aria-label="Follow us on Bluesky"
              >
                <BlueskyIcon />
              </a>
              <a
                href="https://www.linkedin.com/company/celticsupporters/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors duration-150"
                aria-label="Follow us on LinkedIn"
              >
                <LinkedInIcon />
              </a>
            </div>
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
                <Link href="/our-team" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  About CSL
                </Link>
              </li>
              <li>
                <a href="mailto:info@celticsupporterslimited.net" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Contact Us
                </a>
              </li>
              <li>
                <Link href="/privacy" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link href="/membership-agreement" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Membership Agreement
                </Link>
              </li>
              <li>
                <Link href="/articles-of-association" className="text-[0.85rem] text-white/60 hover:text-white transition-colors duration-150">
                  Articles of Association
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 text-[0.8rem] space-y-2">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2.5">
            <span>&#169; 2026 Celtic Supporters Limited. All rights reserved.</span>
            <span>Registered in Scotland. Not affiliated with Celtic FC or Celtic PLC.</span>
          </div>
          <p className="text-white/40 text-[0.75rem] text-center sm:text-left">
            Registered Office: 56 Ashton Lane, Glasgow G12&nbsp;8SJ &middot; Company No. SC862186 &middot; ICO Registration ZB985030 &middot; LEI 984500CDVAFEBEF83781
          </p>
        </div>
      </Container>
    </footer>
  );
}
