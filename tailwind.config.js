/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/renderer/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        // You can customize the color palette to match Shadowrun's cyberpunk theme
        cyan: {
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
        },
      },
    },
  },
  plugins: [],
};
