/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html'],
  theme: {
    extend: {
      colors: {
        "surface": "#fbfbfb",
        "on-surface": "#1d1d1f",
        "on-surface-variant": "#6e6e73",
        "primary": "#1d1d1f",
        "on-primary": "#ffffff",
        "card-leads": "#eaf5f0",
        "card-verified": "#e9f0f7",
        "card-brand": "#f1edf7",
      },
      fontFamily: {
        "headline": ["Manrope", "sans-serif"],
        "body": ["Inter", "sans-serif"],
      },
      borderRadius: {
        "card": "2rem",
        "full": "9999px"
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
