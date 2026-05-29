import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Celtic Supporters Limited - Own Your Club. Shape Its Future.",
  description:
    "Celtic Supporters Limited is a shareholder-led organisation committed to responsible ownership, transparent governance, and a Celtic FC that works for everyone who loves the club.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className={`${inter.className} text-csl-text bg-white`}>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
