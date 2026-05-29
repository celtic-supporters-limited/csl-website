import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "csl-dark":    "#1B4D2E",
        "csl-mid":     "#246038",
        "csl-light":   "#F8F6F1",
        "csl-gold":    "#C8A951",
        "csl-surface": "#F8F6F1",
        "csl-text":    "#1A1A1A",
        "csl-muted":   "#6B7280",
      },
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
