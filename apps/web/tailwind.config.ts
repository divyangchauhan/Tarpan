import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: 'var(--cream)',
        surface: 'var(--surface)',
        gold: {
          DEFAULT: 'var(--gold)',
          light: 'var(--gold-light)',
          mid: 'var(--gold-mid)',
        },
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          hover: 'var(--sidebar-hover)',
          text: 'var(--sidebar-text)',
          muted: 'var(--sidebar-muted)',
          accent: 'var(--sidebar-accent)',
          border: 'var(--sidebar-border)',
        },
        'al-text': 'var(--text)',
        'al-muted': 'var(--text-muted)',
        'al-faint': 'var(--text-faint)',
        'al-border': 'var(--border)',
        'al-border-strong': 'var(--border-strong)',
        'al-success': 'var(--success)',
        'al-success-bg': 'var(--success-bg)',
        'al-error': 'var(--error)',
        'al-error-bg': 'var(--error-bg)',
        'al-warning': 'var(--warning)',
        // Keep brand for backward compat with tests that don't check styling
        brand: {
          50: 'var(--gold-light)',
          100: '#f0e8d4',
          200: '#e0d0a8',
          300: '#d0b87c',
          400: '#c8a850',
          500: 'var(--gold)',
          600: 'var(--gold)',
          700: 'oklch(55% 0.14 68)',
          800: 'oklch(45% 0.12 68)',
          900: 'oklch(25% 0.02 265)',
          950: 'var(--sidebar)',
        },
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
};

export default config;
