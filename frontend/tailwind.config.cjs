/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ["var(--font-heading)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        display: ["var(--font-display)", "serif"],
      },
      colors: {
        app: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          muted: "var(--surface-muted)",
          strong: "var(--surface-strong)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        strong: "var(--text)",
        muted: "var(--text-muted)",
        quiet: "var(--text-quiet)",
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          soft: "var(--accent-soft)",
          glow: "var(--accent-glow)",
        },
        success: {
          DEFAULT: "var(--success)",
          glow: "var(--success-glow)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          glow: "var(--warning-glow)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          glow: "var(--danger-glow)",
        },
      },
      boxShadow: {
        glow: "0 0 20px var(--accent-glow)",
        "glow-sm": "0 0 10px var(--accent-glow)",
        "glow-success": "0 0 20px var(--success-glow)",
        "glow-warning": "0 0 20px var(--warning-glow)",
        "glow-danger": "0 0 20px var(--danger-glow)",
        card: "var(--shadow-card)",
        panel: "var(--shadow-panel)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in-up": "fade-in-up 0.4s ease-out",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "grid-pattern": `linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                          linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)`,
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
