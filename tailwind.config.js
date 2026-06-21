/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ios: {
          background: {
            light: '#f2f2f7',
            dark: '#000000',
            cardLight: 'rgba(255, 255, 255, 0.7)',
            cardDark: 'rgba(28, 28, 30, 0.7)'
          },
          label: {
            primaryLight: '#000000',
            primaryDark: '#ffffff',
            secondaryLight: '#3c3c43',
            secondaryDark: '#ebebf5'
          },
          blue: {
            light: '#007af5',
            dark: '#0a84ff'
          },
          green: {
            light: '#34c759',
            dark: '#30d158'
          },
          orange: {
            light: '#ff9500',
            dark: '#ff9f0a'
          },
          indigo: {
            light: '#5856d6',
            dark: '#5e5ce6'
          },
          pink: {
            light: '#ff2d55',
            dark: '#ff375f'
          },
          gray: {
            1: '#8e8e93',
            2: '#aeaeb2',
            3: '#c7c7cc',
            4: '#d1d1d6',
            5: '#e5e5ea',
            6: '#f2f2f7'
          }
        }
      },
      backdropBlur: {
        xs: '2px',
        ios: '20px'
      },
      borderRadius: {
        'ios-sm': '8px',
        'ios-md': '12px',
        'ios-lg': '18px',
        'ios-xl': '24px'
      },
      boxShadow: {
        'ios-soft': '0 4px 30px rgba(0, 0, 0, 0.03)',
        'ios-strong': '0 8px 32px 0 rgba(0, 0, 0, 0.08)',
        'ios-glow': '0 0 15px rgba(10, 132, 255, 0.4)'
      },
      animation: {
        'fade-in': 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'float': 'float 3s ease-in-out infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '10%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' }
        }
      }
    },
  },
  plugins: [],
}
