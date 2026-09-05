/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0f2a44",
        fairness: "#15803d",
        lottery: "#ea580c",
        audit: "#7e22ce"
      },
      boxShadow: {
        soft: "0 10px 28px rgba(15, 42, 68, 0.08)"
      }
    }
  },
  plugins: []
};

