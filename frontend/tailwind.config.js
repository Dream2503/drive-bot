/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        /* Supabase backgrounds — depth via surface color, not shadow */
        "sb-base":      "#0f0f0f",
        "sb-canvas":    "#121212",
        "sb-surface":   "#171717",
        "sb-elevated":  "#242424",
        "sb-overlay":   "#2e2e2e",

        /* Borders — the depth system */
        "sb-border":    "#2e2e2e",
        "sb-border-hi": "#393939",

        /* Text */
        "sb-text":      "#fafafa",
        "sb-text-2":    "#b4b4b4",
        "sb-text-3":    "#898989",

        /* Brand green — use sparingly */
        "sb-green":     "#3ecf8e",
        "sb-green-dk":  "#00c573",
        "sb-green-dim": "rgba(62,207,142,0.08)",

        /* Semantic */
        "sb-red":       "#f66061",
        "sb-red-dim":   "rgba(246,96,97,0.08)",
        "sb-amber":     "#e8912d",
        "sb-amber-dim": "rgba(232,145,45,0.08)",
      },
      fontFamily: {
        sans:  ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono:  ["Source Code Pro", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      fontSize: {
        "11": ["11px", { lineHeight: "16px" }],
        "12": ["12px", { lineHeight: "16px" }],
        "13": ["13px", { lineHeight: "20px" }],
        "14": ["14px", { lineHeight: "20px" }],
        "20": ["20px", { lineHeight: "28px" }],
        "24": ["24px", { lineHeight: "32px" }],
      },
      borderRadius: {
        "sm": "4px",
        "DEFAULT": "6px",
        "md": "8px",
        "lg": "12px",
        "full": "9999px",
      },
      boxShadow: {
        /* Supabase uses almost zero shadow — only functional focus shadows */
        "focus": "0 0 0 2px rgba(62,207,142,0.3)",
        "none": "none",
      },
    },
  },
  plugins: [],
};