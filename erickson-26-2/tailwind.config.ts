import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F0E0B",
        coal: "#1A1814",
        seam: "#2A2722",
        bone: "#F2EBDA",
        dust: "#9A917D",
        gold: "#F2B707",
        goldDim: "#B98C0A",
        sage: "#7BA05B",
        ember: "#D96B4A"
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
