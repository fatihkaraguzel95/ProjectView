/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
          500: '#64748b',
          400: '#94a3b8',
          300: '#cbd5e1',
          200: '#e2e8f0',
          100: '#f1f5f9',
          50: '#f8fafc',
        },
        brand: {
          700: '#1e3a8a',
          600: '#1e40af',
          500: '#2563eb',
          400: '#3b82f6',
          100: '#dbeafe',
          50: '#eff6ff',
        },
        accent: {
          600: '#b45309',
          500: '#d97706',
          400: '#f59e0b',
          50: '#fffbeb',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15,23,42,0.04), 0 1px 3px 0 rgba(15,23,42,0.06)',
        pop: '0 10px 30px -8px rgba(15,23,42,0.18)',
      },
    },
  },
  plugins: [],
}
