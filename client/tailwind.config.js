/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Deep botanical green — the Kupaa brand colour.
        brand: {
          50: '#f0fdf9',
          100: '#ccfbef',
          200: '#99f6e0',
          300: '#5fe9ce',
          400: '#2dd4b6',
          500: '#14b89d',
          600: '#079480',
          700: '#0a7668',
          800: '#0d5d54',
          900: '#104d46',
          950: '#022c29',
        },
        ink: {
          50: '#f6f7f8',
          100: '#eceef1',
          200: '#d5dae0',
          300: '#b0bac5',
          400: '#8595a5',
          500: '#67788a',
          600: '#526072',
          700: '#434e5d',
          800: '#3a434e',
          900: '#343b44',
          950: '#1d2126',
        },
        accent: '#f59e0b',
      },
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
