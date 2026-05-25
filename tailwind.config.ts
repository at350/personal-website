import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg))',
        surface: 'hsl(var(--surface))',
        'text-primary': 'hsl(var(--text))',
        muted: 'hsl(var(--muted))',
        line: 'hsl(var(--line))',
        stroke: 'hsl(var(--stroke) / 0.18)',
        accent: 'hsl(var(--accent))',
        amber: 'hsl(var(--amber))',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        body: ['Archivo', 'sans-serif'],
      },
    },
  },
  plugins: [animate],
} satisfies Config
