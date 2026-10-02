/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Poppins', 'Segoe UI', 'system-ui', 'sans-serif'] },
      colors: {
        navy: {
          900: '#0B1A47',
          800: '#11245C',
          700: '#16305C'
        },
        accent: {
          50: '#EEF3FF',
          100: '#DCE6FF',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8'
        },
        danger: { DEFAULT: '#E5484D', bg: '#FDE8EA' },
        warn: { DEFAULT: '#C2670B', bg: '#FFF2E0' },
        success: { DEFAULT: '#127A45', bg: '#E3F6EC' },
        pink: { DEFAULT: '#D6336C', bg: '#FDE7EF' }
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        glass: '0 2px 0 0 rgba(11,26,71,.05), 0 10px 24px -12px rgba(11,26,71,.25)',
        'glass-sm': '0 1px 0 0 rgba(11,26,71,.05), 0 6px 14px -8px rgba(11,26,71,.22)'
      },
      borderRadius: { glass: '16px' }
    }
  },
  plugins: []
};
