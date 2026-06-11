import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // RGB-triplet vars (globals.css) so html.light can swap the palette
        ink: "rgb(var(--ink) / <alpha-value>)",
        coal: "rgb(var(--coal) / <alpha-value>)",
        seam: "rgb(var(--seam) / <alpha-value>)",
        bone: "rgb(var(--bone) / <alpha-value>)",
        dust: "rgb(var(--dust) / <alpha-value>)",
        gold: "rgb(var(--gold) / <alpha-value>)",
        goldDim: "rgb(var(--gold-dim) / <alpha-value>)",
        sage: "rgb(var(--sage) / <alpha-value>)",
        ember: "rgb(var(--ember) / <alpha-value>)"
      },
      fontFamily: {
        display: ["var(--font-display)", "Barlow Condensed", "Arial Narrow", "sans-serif"],
        body: ["var(--font-body)", "Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
export default config;
