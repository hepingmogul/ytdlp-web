/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c1712",
        panel: "#261f18",
        raised: "#32281f",
        line: "#4a3d30",
        paper: "#efe4cf",
        amber: "#e09a2b",
        signal: "#d4583c",
        ok: "#2f9e8a",
        mute: "#b5a48c",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        sans: ["Outfit", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        inset: "inset 0 1px 0 rgba(239,228,207,0.06)",
      },
    },
  },
  plugins: [],
};
