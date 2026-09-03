/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Kupaa palette: sage accent, black/charcoal darks, ivory surfaces.
        brand: {
          50: '#eef2ee',
          100: '#dce5de',
          200: '#c2d1c5',
          300: '#a7bcae',
          400: '#7f9b87',
          500: '#526B5A',
          600: '#526B5A',
          700: '#526B5A',
          800: '#405346',
          900: '#1C1C1C',
          950: '#111111',
        },
        ink: {
          50: '#F6F4F0',
          100: '#E4E1DC',
          200: '#D5D2CC',
          300: '#B8B5AF',
          400: '#92908B',
          500: '#6F6F6F',
          600: '#555555',
          700: '#3F3F3F',
          800: '#2A2A2A',
          900: '#181818',
          950: '#111111',
        },
        accent: '#526B5A',
        // The eight brand tokens, addressable by their palette names so a
        // component can reach for the exact swatch instead of guessing a ramp step.
        kupaa: {
          black: '#111111',   // hero / header / footer
          charcoal: '#1C1C1C',// secondary dark surfaces, dark-card hovers
          ivory: '#F6F4F0',   // page background
          white: '#FFFFFF',   // cards, inputs, popovers
          text: '#181818',    // headings and body
          muted: '#6F6F6F',   // descriptions, secondary detail
          line: '#E4E1DC',    // borders and dividers
          sage: '#526B5A',    // buttons, links, badges, icon accents
        },
      },
      // Tailwind's stock ring fallback is a blue; point the default at the accent
      // so a bare `ring` utility can never reintroduce an off-palette colour.
      ringColor: { DEFAULT: '#526B5A' },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -12px rgba(16,24,40,0.12)',
        lift: '0 8px 32px -8px rgba(16,24,40,0.18)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
