export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: 'hsl(var(--muted))',
        border: 'hsl(var(--border))',
      },
      fontFamily: {
        body: ['Lato', 'Arial', 'sans-serif'],
        display: ['Lato', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0',
        sm: '0',
        md: '0',
        lg: '0',
        xl: '0',
        full: '0',
      },
    },
  },
  plugins: [],
};
