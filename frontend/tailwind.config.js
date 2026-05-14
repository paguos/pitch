/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0E1311',         // deep near-black, slight green warmth
        ash: '#1A201D',         // panel surface
        bone: '#EAE5D8',        // cream off-white
        chalk: '#F6F2E7',
        pitch: '#1FAE4E',       // pitch green accent
        pitchDeep: '#0E5A2A',
        coral: '#FF5A3D',       // hot coral for emphasis
        rust: '#C8421F',
        hairline: '#2A302D',
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        sans: ['"Inter Tight"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        widest2: '0.25em',
      },
    },
  },
  plugins: [],
};
