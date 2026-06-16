/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#0b0b0b',
          900: '#131314',
          850: '#1a1a1c',
          800: '#222224',
          700: '#2d2d30',
          600: '#3c3c41',
          500: '#5f6368',
          400: '#9aa0a6',
          300: '#bdc1c6',
          200: '#e8eaed',
        },
        accent: {
          DEFAULT: '#8ab4f8',
          glow: '#669df6',
          muted: '#4285f4',
        },
      },
      boxShadow: {
        glow: '0 0 20px rgba(138, 180, 248, 0.15)',
        'glow-lg': '0 0 40px rgba(138, 180, 248, 0.25)',
        'glow-accent': '0 0 12px rgba(102, 157, 246, 0.4)',
      },
      fontFamily: {
        sans: ['Google Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
