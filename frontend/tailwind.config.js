/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // FairRoom's civic, pastel-and-earth system. The aliases below also
        // intentionally remap legacy utility names used throughout the app so
        // every route inherits the same visual language.
        ivory: "#F7F3E8",
        cream: "#FBF8F0",
        surface: "#FFFFFF",
        sage: "#B8CBBE",
        "sage-light": "#DDE8DF",
        earth: "#557563",
        forest: "#29483A",
        sand: "#F3E4C5",
        mustard: "#E8C77A",
        terracotta: "#C96B4B",
        "terracotta-dark": "#A94D35",
        clay: "#D99A7B",
        info: "#6B8792",
        navy: "#29483A",
        fairness: "#4F8063",
        lottery: "#A94D35",
        audit: "#A94D35",
        slate: {
          50: "#FBF8F0",
          100: "#F7F3E8",
          200: "#DDE1D9",
          300: "#C8D3C9",
          400: "#98A79A",
          500: "#68756D",
          600: "#516057",
          700: "#33483D",
          800: "#29483A",
          900: "#24352D",
          950: "#1D3027"
        },
        blue: {
          50: "#EFF5F0",
          100: "#DDE8DF",
          200: "#C5D9CB",
          300: "#A8C7B0",
          400: "#7EA18B",
          500: "#557563",
          600: "#4B6A59",
          700: "#557563",
          800: "#29483A",
          900: "#29483A",
          950: "#20382E"
        },
        green: {
          50: "#EFF5F0",
          100: "#DDE8DF",
          200: "#B8CBBE",
          300: "#98BAA1",
          400: "#6D9A78",
          500: "#4F8063",
          600: "#416B53",
          700: "#4F8063",
          800: "#38614A",
          900: "#29483A"
        },
        orange: {
          50: "#FFF7E7",
          100: "#FBECCB",
          200: "#F3D69C",
          300: "#E8C77A",
          400: "#D6AA54",
          500: "#C7923E",
          600: "#B07B2B",
          700: "#8C5E20",
          800: "#704A1E",
          900: "#503514"
        },
        amber: {
          100: "#FBECCB",
          800: "#704A1E"
        },
        purple: {
          50: "#F8EEE9",
          100: "#F0D9CF",
          200: "#E6B9A8",
          500: "#C96B4B",
          700: "#A94D35",
          800: "#843A2C",
          900: "#6E382A",
          950: "#4F2B21"
        },
        red: {
          50: "#FCEDEA",
          100: "#F7D3CA",
          200: "#F0B7A7",
          300: "#DE8C73",
          500: "#C96B4B",
          600: "#B95445",
          700: "#A94D35",
          800: "#843A2C",
          900: "#612C22"
        }
      },
      boxShadow: {
        soft: "0 8px 24px rgba(41, 72, 58, 0.08)"
      }
    }
  },
  plugins: []
};
