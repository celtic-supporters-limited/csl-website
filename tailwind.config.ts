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
        "csl-dark": "#1D6130",
        "csl-mid": "#2E7D4F",
        "csl-light": "#E8F5EE",
      },
    },
  },
  plugins: [],
};
export default config;
