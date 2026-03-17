import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f6f0e8",
        ink: "#1f2521",
        surface: "#fffcf7",
        line: "#d8cab8",
        shipping: "#e67e4f",
        enablement: "#178f84",
        complexity: "#d4aa2a",
        consistency: "#7d6ee7",
      },
      boxShadow: {
        panel: "0 18px 60px rgba(51, 39, 25, 0.12)",
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Avenir Next"', "sans-serif"],
        body: ['"Manrope"', '"Segoe UI"', "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
