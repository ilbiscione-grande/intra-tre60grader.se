import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './docs/**/*.{md,mdx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
          soft: 'hsl(var(--primary-soft))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        status: {
          upcoming: 'hsl(var(--status-upcoming-bg))',
          ongoing: 'hsl(var(--status-ongoing-bg))',
          delivered: 'hsl(var(--status-delivered-bg))',
          invoiced: 'hsl(var(--status-invoiced-bg))'
        },
        system: {
          offline: 'hsl(var(--offline-bg))',
          syncing: 'hsl(var(--syncing-bg))',
          conflict: 'hsl(var(--conflict-bg))'
        },
        money: {
          in: 'hsl(var(--money-in-bg))',
          out: 'hsl(var(--money-out-bg))'
        },
        bg: 'hsl(var(--background))',
        fg: 'hsl(var(--foreground))',
        danger: 'hsl(var(--destructive))'
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: 'var(--radius-card)',
        button: 'var(--radius-button)'
      },
      boxShadow: {
        card: '0 1px 2px 0 hsl(var(--shadow-color) / 0.08)'
      },
      minHeight: {
        touch: '44px',
        action: '48px'
      }
    }
  },
  plugins: []
};

export default config;
