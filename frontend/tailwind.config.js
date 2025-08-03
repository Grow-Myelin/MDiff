/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: '#FFF8E7',
          light: '#FFFEF9',
          dark: '#F5E6D3'
        },
        verdant: {
          DEFAULT: '#2D5016',
          light: '#4A7C2E',
          dark: '#1B3009'
        },
        coffee: {
          DEFAULT: '#6F4E37',
          light: '#8B6F47',
          dark: '#503626'
        }
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}