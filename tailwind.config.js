module.exports = {
  content: [
    "./*.html",
    "./js/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff',
          500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 900: '#581c87',
        }
      },
      animation: {
        'float': 'float 4s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0) scale(1.15)', filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.1))' },
          '50%': { transform: 'translateY(-12px) scale(1.15)', filter: 'drop-shadow(0 20px 25px rgba(79,70,229,0.3))' },
        }
      }
    }
  },
  plugins: [],
}
