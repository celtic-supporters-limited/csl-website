import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { Container } from "@/components/Container";

export const metadata: Metadata = {
  title: "Member Portal | Celtic Supporters Limited",
  description: "The CSL member portal is being prepared.",
};

export default function PortalComingSoonPage() {
  return (
    <>
      <Nav />
      <main className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-csl-light py-24 px-4">
        <Container>
          <div className="max-w-lg mx-auto text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-csl-dark mb-6">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">
              Member portal coming soon
            </h1>
            <p className="text-gray-500 text-sm leading-relaxed">
              We are preparing the member portal ahead of launch. It will be available to all members shortly. Please check back soon.
            </p>
            <p className="mt-6 text-xs text-gray-400">
              If you have a question in the meantime, contact us at{" "}
              <a
                href="mailto:info@celticsupporters.net"
                className="text-csl-dark hover:underline"
              >
                info@celticsupporters.net
              </a>
            </p>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
