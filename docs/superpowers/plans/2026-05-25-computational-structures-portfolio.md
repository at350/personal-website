# Computational Structures Portfolio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Alan Tai's single-page dark portfolio ("Computational Structures") — an architectural-drawing-meets-systems-diagram landing page — and deploy it to GitHub Pages.

**Architecture:** Static React + Vite SPA. One page composed of section components rendered in `App.tsx`, all data centralized in `content.ts`. GSAP/ScrollTrigger drives the hero assembly, the scroll-scrubbed Explorations build, and the footer marquee; Framer Motion drives content-section reveals; Lenis provides smooth scroll synced to ScrollTrigger. No backend, no router.

**Tech Stack:** React 18, Vite 5, TypeScript (strict), Tailwind CSS 3 + tailwindcss-animate, GSAP + ScrollTrigger, Framer Motion, Lenis. Deploy via GitHub Actions → GitHub Pages.

**Verification model (read this):** This is a static visual site. Per the approved spec, the per-task verification loop is **`npm run typecheck` (tsc --noEmit) and `npm run build` pass cleanly**, plus a **browser pass at milestones** (after Hero, after all sections wired, final). We are *not* writing red/green unit tests — there is no logic worth unit-testing that build+typecheck+eyeballs don't cover better. Commit after each task.

**Reference spec:** `docs/superpowers/specs/2026-05-25-computational-structures-portfolio-design.md` — contains exact Tailwind class strings and animation params for every section. This plan provides full code for infrastructure and complete structural code + the spec's exact classes for components.

---

## File Structure

```
.github/workflows/deploy.yml      # build + deploy to GitHub Pages
.gitignore
index.html                        # fonts, meta/OG, root
package.json
tsconfig.json  tsconfig.node.json
vite.config.ts                    # base path (switchable for custom domain)
postcss.config.js
tailwind.config.ts                # colors, fonts, content globs, animate plugin
public/
  CNAME.example                   # template for future alantai.org
  projects/.gitkeep               # drop architec.png/greenchain.png/... here later
src/
  main.tsx                        # React root
  App.tsx                         # section composition, loading state, smooth scroll init, corner ticks
  index.css                       # CSS vars, .drafting-grid, .accent-gradient, all @keyframes, reduced-motion
  vite-env.d.ts
  data/content.ts                 # typed source of truth
  lib/
    smoothScroll.ts               # Lenis + GSAP ScrollTrigger sync; scrollToId helper
    useReducedMotion.ts           # prefers-reduced-motion hook
  components/
    CornerTicks.tsx
    LoadingScreen.tsx
    Navbar.tsx
    Hero.tsx
    StructureStage.tsx            # hero isometric tower SVG + GSAP assembly + parallax
    SelectedStructures.tsx
    ProjectCard.tsx
    Capabilities.tsx
    Log.tsx
    Explorations.tsx
    ContactFooter.tsx
    glyphs/
      TowerGlyph.tsx  GlobeGlyph.tsx  TreeGlyph.tsx  GridGlyph.tsx
      index.ts
```

---

## Task 1: Scaffold Vite + React + TS, install dependencies

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `src/main.tsx`, `index.html`, `src/vite-env.d.ts`, `.gitignore`

- [ ] **Step 1: Scaffold and install**

Run from repo root (the dir already has `README.md` and `docs/`; scaffold in place):

```bash
npm create vite@latest . -- --template react-ts
# if prompted about non-empty dir, choose "Ignore files and continue"
npm install
npm install gsap framer-motion lenis
npm install -D tailwindcss@^3.4 postcss autoprefixer tailwindcss-animate
```

- [ ] **Step 2: Configure `vite.config.ts`** (switchable base for future custom domain)

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Project site now: /personal-website/. For custom domain (alantai.org),
// set VITE_BASE=/ in the build env and add public/CNAME.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/personal-website/',
  plugins: [react()],
})
```

- [ ] **Step 3: Add scripts to `package.json`**

Ensure the `scripts` block contains:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 4: Replace `src/main.tsx` with a minimal root** (App comes in Task 4)

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 5: Create a temporary `src/App.tsx` and empty `src/index.css`** so the build runs

```tsx
// src/App.tsx (temporary — replaced in Task 4)
export default function App() {
  return <div className="p-10">scaffold ok</div>
}
```

Create `src/index.css` empty for now. Delete the Vite boilerplate `src/App.css` if present.

- [ ] **Step 6: Verify build + typecheck**

```bash
npm run typecheck
npm run build
```
Expected: both succeed; `dist/` produced.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite react-ts + deps (gsap, framer-motion, lenis, tailwind)"
```

---

## Task 2: Tailwind + global stylesheet (design system)

**Files:**
- Create: `postcss.config.js`, `tailwind.config.ts`
- Modify: `src/index.css`, `index.html`

- [ ] **Step 1: `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 2: `tailwind.config.ts`**

```ts
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
```

- [ ] **Step 3: Google Fonts in `index.html` `<head>`** (set lang, title, meta, OG)

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500&family=JetBrains+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap" rel="stylesheet" />
<title>Alan Tai — Computational Structures</title>
<meta name="description" content="Alan Tai — engineer building software the way an architect designs a building." />
<meta property="og:title" content="Alan Tai — Computational Structures" />
<meta property="og:description" content="Industrial Engineering & AI @ Northwestern. Building structures out of code." />
<meta property="og:type" content="website" />
```
Also set `<html lang="en">`. The favicon is added in Task 16; leave the default for now.

- [ ] **Step 4: Full `src/index.css`** (CSS vars, grid, gradient, all keyframes, reduced motion)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: 216 17% 9%;
  --surface: 213 16% 12%;
  --text: 140 9% 92%;
  --muted: 140 5% 53%;
  --line: 150 11% 82%;
  --stroke: 150 11% 82%;
  --accent: 171 57% 61%;
  --amber: 32 60% 61%;
  --font-display: 'Syne', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --font-body: 'Archivo', sans-serif;
}

html { -webkit-text-size-adjust: 100%; }

body {
  @apply bg-bg text-text-primary font-body antialiased;
  background-image:
    linear-gradient(hsl(var(--line)/0.05) 1px, transparent 1px),
    linear-gradient(90deg, hsl(var(--line)/0.05) 1px, transparent 1px),
    linear-gradient(hsl(var(--line)/0.09) 1px, transparent 1px),
    linear-gradient(90deg, hsl(var(--line)/0.09) 1px, transparent 1px);
  background-size: 30px 30px, 30px 30px, 150px 150px, 150px 150px;
}

/* Lenis */
html.lenis, html.lenis body { height: auto; }
.lenis.lenis-smooth { scroll-behavior: auto !important; }

.accent-gradient {
  background-image: linear-gradient(90deg, #63d4c2 0%, #3fa896 100%);
}

@keyframes draw-line { to { stroke-dashoffset: 0; } }
@keyframes node-pulse {
  0%, 100% { r: 4; opacity: 0.85; }
  50% { r: 6; opacity: 1; }
}
@keyframes role-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes scan {
  from { transform: translateY(-100%); }
  to { transform: translateY(200%); }
}
@keyframes gradient-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes grid-fade-in {
  from { opacity: 0; transform: scale(1.02); }
  to { opacity: 1; transform: scale(1); }
}

.animate-role-fade-in { animation: role-fade-in 0.4s ease-out; }
.animate-scan { animation: scan 1.5s linear infinite; }
.animate-node-pulse { animation: node-pulse 2.8s ease-in-out infinite; }
.animate-grid-fade-in { animation: grid-fade-in 0.8s ease-out; }

/* gradient border ring helper (used by hover rings + pills) */
.gradient-ring {
  background-image: linear-gradient(90deg, #63d4c2 0%, #3fa896 50%, #63d4c2 100%);
  background-size: 200% 100%;
  animation: gradient-shift 6s ease infinite;
}

/* GSAP initial states (JS animates to final; reduced-motion overrides below) */
.blur-in { opacity: 0; filter: blur(10px); transform: translateY(20px); }
.name-reveal { opacity: 0; transform: translateY(50px); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
  .blur-in, .name-reveal { opacity: 1 !important; filter: none !important; transform: none !important; }
}
```

- [ ] **Step 5: Smoke-test the system** — temporarily set `src/App.tsx` body to verify colors/fonts/grid render:

```tsx
export default function App() {
  return (
    <main className="min-h-screen p-10 space-y-4">
      <h1 className="font-display text-6xl font-extrabold">Alan Tai</h1>
      <p className="font-mono text-accent uppercase tracking-[0.3em] text-xs">// system check</p>
      <p className="font-body text-muted max-w-md">Readable body copy in Archivo.</p>
      <div className="accent-gradient h-2 w-40 rounded-full" />
    </main>
  )
}
```

- [ ] **Step 6: Verify in browser**

```bash
npm run dev
```
Expected: dark bg with faint drafting grid, Syne display heading, teal accent bar, mono eyebrow. Then `npm run build` passes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: tailwind design system, fonts, drafting grid, keyframes, reduced-motion"
```

---

## Task 3: Centralized content (`src/data/content.ts`)

**Files:**
- Create: `src/data/content.ts`

- [ ] **Step 1: Write the typed data module** (Devpost + X/Twitter are placeholders to fill later)

```ts
export type GlyphKind = 'tower' | 'globe' | 'tree' | 'grid'

export interface Project {
  id: string          // "STR. 001"
  slug: string        // matches public/projects/<slug>.png
  title: string
  span: 5 | 7
  blurb: string
  stack: string[]
  url: string         // "#" = placeholder, render as not-yet-linked
  glyph: GlyphKind
}

export interface CapabilityGroup {
  label: string
  items: string[]
}

export interface LogEntry {
  title: string
  url: string
  date: string        // ISO
  readTime: string    // "5 min"
  excerpt?: string
}

export interface SocialLink {
  label: string
  url: string         // "#" = not set yet
}

export const HERO_ROLES = [
  'Full-Stack Engineer',
  'AI Systems Builder',
  'Founder',
  'Software Engineer',
] as const

export const EMAIL = 'alantai@u.northwestern.edu'
export const GITHUB_PROFILE = 'https://github.com/at350'

export const projects: Project[] = [
  {
    id: 'STR. 001',
    slug: 'architec',
    title: 'Architec',
    span: 7,
    glyph: 'tower',
    blurb:
      'AI energy audits for commercial buildings. OCR ingests utility bills, benchmarks the building against 5,000 federal records, and returns a report with upgrade recommendations and payback estimates — alongside a Three.js + Mapbox model that simulates solar gain and heat loss, plus an ElevenLabs voice walkthrough. Compresses a $15K–$50K, months-long process into ten free minutes.',
    stack: ['Next.js', 'FastAPI', 'Three.js', 'scikit-learn', 'Gemini'],
    url: '#', // TODO: paste Devpost URL
  },
  {
    id: 'STR. 002',
    slug: 'greenchain',
    title: 'GreenChain',
    span: 5,
    glyph: 'globe',
    blurb:
      'Supply-chain sustainability scoring. A multi-agent research swarm (Dedalus + Claude) crawls manufacturer sustainability pages in parallel for certification signals, an XGBoost quantile model estimates emissions with uncertainty bands, and results land on a Three.js globe with animated shipping routes and a force-directed supply graph. Replaces ~$50K/yr ESG software with a free, minutes-long workflow.',
    stack: ['Multi-agent', 'Claude', 'XGBoost', 'Three.js'],
    url: '#', // TODO: paste Devpost URL
  },
  {
    id: 'STR. 003',
    slug: 'prophis',
    title: 'Prophis',
    span: 5,
    glyph: 'tree',
    blurb:
      'Patient-context intelligence for public health. A React/TypeScript interface turns fragmented medical records into an interactive patient timeline, then links each case to County Health Rankings data across 3,142 U.S. counties to compute similarity cohorts and a Health Equity Context Score — surfacing preventability signals in chronic disease. Built at YHack.',
    stack: ['React', 'TypeScript', 'Python'],
    url: 'https://at350-yhack2026.vercel.app/',
  },
  {
    id: 'STR. 004',
    slug: 'legal-llm',
    title: 'Legal LLM Benchmarking',
    span: 7,
    glyph: 'grid',
    blurb:
      'An automated pipeline benchmarking how large language models reason on structured legal tasks, built as a Thomson Reuters research fellow. Forces IRAC-structured JSON outputs, embeds and clusters them with UMAP + HDBSCAN to measure reasoning consistency, and scores with rubric-based LLM-as-a-judge ensembles. Cut expert review time by 90%.',
    stack: ['Python', 'UMAP', 'HDBSCAN', 'LLM-as-judge'],
    url: 'https://github.com/at350/tr-benchmarking',
  },
]

export const capabilities: CapabilityGroup[] = [
  { label: 'LANGUAGES', items: ['Python', 'TypeScript / JavaScript', 'Java', 'SQL', 'R'] },
  { label: 'ML & DATA', items: ['PyTorch', 'scikit-learn', 'XGBoost', 'Pandas', 'NumPy', 'BeautifulSoup'] },
  { label: 'FRAMEWORKS', items: ['React', 'Next.js', 'FastAPI', 'Three.js', 'Firebase', 'Postgres'] },
  { label: 'SYSTEMS', items: ['Multi-agent / agentic engineering', 'model evaluation', 'API design', 'cloud deployment', 'Git'] },
]

// Empty for now → Log renders "Writing soon." A future build-time bake fills this.
export const logEntries: LogEntry[] = []
export const SUBSTACK_URL = '' // e.g. 'https://alantai.substack.com'

export const socials: SocialLink[] = [
  { label: 'GitHub', url: 'https://github.com/at350' },
  { label: 'LinkedIn', url: 'https://www.linkedin.com/in/alan-tai-nu' },
  { label: 'X / Twitter', url: '#' }, // TODO: paste X URL
]
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: centralized typed content (projects, capabilities, log, socials)"
```

---

## Task 4: Lib utilities + App shell

**Files:**
- Create: `src/lib/useReducedMotion.ts`, `src/lib/smoothScroll.ts`, `src/components/CornerTicks.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: `src/lib/useReducedMotion.ts`**

```ts
import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const handler = () => setReduced(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}
```

- [ ] **Step 2: `src/lib/smoothScroll.ts`** (Lenis ↔ ScrollTrigger sync + anchor helper)

```ts
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

let lenis: Lenis | null = null

export function initSmoothScroll(reduced: boolean): () => void {
  if (reduced) return () => {}
  lenis = new Lenis({ duration: 1.1, smoothWheel: true })
  lenis.on('scroll', ScrollTrigger.update)
  const raf = (time: number) => lenis?.raf(time * 1000)
  gsap.ticker.add(raf)
  gsap.ticker.lagSmoothing(0)
  return () => {
    gsap.ticker.remove(raf)
    lenis?.destroy()
    lenis = null
  }
}

export function scrollToId(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  if (lenis) lenis.scrollTo(el, { offset: -20 })
  else el.scrollIntoView({ behavior: 'smooth' })
}
```

- [ ] **Step 3: `src/components/CornerTicks.tsx`** (L-shaped registration marks, fixed, drafting-sheet style)

```tsx
// Four L-shaped marks pinned to the viewport corners.
const tick = 'pointer-events-none fixed z-40 h-4 w-4 border-stroke'
export default function CornerTicks() {
  return (
    <div aria-hidden className="animate-grid-fade-in">
      <span className={`${tick} left-4 top-4 border-l border-t`} />
      <span className={`${tick} right-4 top-4 border-r border-t`} />
      <span className={`${tick} bottom-4 left-4 border-b border-l`} />
      <span className={`${tick} bottom-4 right-4 border-b border-r`} />
    </div>
  )
}
```

- [ ] **Step 4: `src/App.tsx`** (composition + loading + smooth scroll init). Components are stubbed now; each later task replaces a stub with the real component.

```tsx
import { useEffect, useState } from 'react'
import { useReducedMotion } from './lib/useReducedMotion'
import { initSmoothScroll } from './lib/smoothScroll'
import CornerTicks from './components/CornerTicks'
import LoadingScreen from './components/LoadingScreen'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import SelectedStructures from './components/SelectedStructures'
import Capabilities from './components/Capabilities'
import Log from './components/Log'
import Explorations from './components/Explorations'
import ContactFooter from './components/ContactFooter'

export default function App() {
  const reduced = useReducedMotion()
  const [isLoading, setIsLoading] = useState(!reduced)

  useEffect(() => initSmoothScroll(reduced), [reduced])

  return (
    <>
      {isLoading && <LoadingScreen onComplete={() => setIsLoading(false)} />}
      <CornerTicks />
      <Navbar />
      <main>
        <Hero />
        <SelectedStructures />
        <Capabilities />
        <Log />
        <Explorations />
      </main>
      <ContactFooter />
    </>
  )
}
```

- [ ] **Step 5: Create minimal stubs** for every imported component so the app compiles. For each of `LoadingScreen, Navbar, Hero, SelectedStructures, Capabilities, Log, Explorations, ContactFooter` create a file that default-exports a placeholder. `LoadingScreen` must accept and immediately call `onComplete`:

```tsx
// src/components/LoadingScreen.tsx (stub)
export default function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  return <button onClick={onComplete} className="fixed inset-0 z-[9999] bg-bg" />
}
```
```tsx
// e.g. src/components/Hero.tsx (stub) — repeat shape for the others, give each its section id
export default function Hero() {
  return <section id="top" className="min-h-screen grid place-items-center font-mono text-muted">Hero</section>
}
```
Use ids: Hero `id="top"`, SelectedStructures `id="structures"`, Capabilities `id="toolkit"`, Log `id="log"`, ContactFooter `id="contact"`. (Navbar/Explorations need no id; Explorations wraps its own.)

- [ ] **Step 6: Verify build + browser**

```bash
npm run typecheck && npm run build && npm run dev
```
Expected: corner ticks visible, stub sections stack and smooth-scroll works (mouse wheel feels eased).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: app shell, reduced-motion hook, lenis/scrolltrigger sync, corner ticks, component stubs"
```

---

## Task 5: LoadingScreen

**Files:**
- Modify: `src/components/LoadingScreen.tsx`

- [ ] **Step 1: Implement the full component**

Requirements (spec §6.1): full-screen `fixed inset-0 z-[9999] bg-bg`, rAF counter 000→100 over ~2700ms, top-left mono label, center mini isometric wireframe that draws itself + cycling boot log (~700ms cadence: `RESOLVING GRID…`, `PLACING NODES…`, `LINKING SYSTEMS…`, `STRUCTURE STABLE`), bottom-right `padStart(3,'0')` counter in `font-display text-6xl md:text-8xl lg:text-9xl tabular-nums`, bottom progress bar (`h-[3px]` track `bg-stroke`, inner `.accent-gradient` scaled `scaleX(count/100)` with teal glow). At 100 → 400ms delay → `onComplete()` then fade out.

```tsx
import { useEffect, useRef, useState } from 'react'

const BOOT = ['RESOLVING GRID…', 'PLACING NODES…', 'LINKING SYSTEMS…', 'STRUCTURE STABLE']
const DURATION = 2700

export default function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [count, setCount] = useState(0)
  const [boot, setBoot] = useState(0)
  const [exit, setExit] = useState(false)
  const start = useRef<number | null>(null)

  useEffect(() => {
    let raf = 0
    const step = (t: number) => {
      if (start.current === null) start.current = t
      const p = Math.min((t - start.current) / DURATION, 1)
      setCount(Math.round(p * 100))
      if (p < 1) raf = requestAnimationFrame(step)
      else {
        setTimeout(() => {
          setExit(true)
          setTimeout(onComplete, 500)
        }, 400)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [onComplete])

  useEffect(() => {
    const id = setInterval(() => setBoot((b) => Math.min(b + 1, BOOT.length - 1)), 700)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-bg transition-opacity duration-500 ${exit ? 'opacity-0' : 'opacity-100'}`}
      style={{
        backgroundImage:
          'linear-gradient(hsl(var(--line)/0.05) 1px,transparent 1px),linear-gradient(90deg,hsl(var(--line)/0.05) 1px,transparent 1px)',
        backgroundSize: '30px 30px,30px 30px',
      }}
    >
      <div className="absolute left-6 top-6 font-mono text-xs uppercase tracking-[0.3em] text-muted">
        // COMPUTATIONAL STUDIO
      </div>

      {/* center mini wireframe + boot log */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-5">
          <svg width="120" height="150" viewBox="0 0 120 150" className="overflow-visible">
            {[0, 1, 2].map((i) => {
              const cy = 110 - i * 36
              const rx = 44 - i * 8
              const ry = 22 - i * 4
              return (
                <path
                  key={i}
                  d={`M60 ${cy - ry} L ${60 - rx} ${cy} L 60 ${cy + ry} L ${60 + rx} ${cy} Z`}
                  fill="none"
                  stroke="hsl(var(--accent))"
                  strokeWidth="1.25"
                  pathLength={1}
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: 1,
                    animation: `draw-line 0.6s ease-out ${0.3 + i * 0.35}s forwards`,
                  }}
                />
              )
            })}
            {[110, 74, 38].map((cy, i) => (
              <circle key={i} cx="60" cy={cy} r="3" fill="hsl(var(--accent))"
                style={{ opacity: 0, animation: `role-fade-in 0.4s ease-out ${0.7 + i * 0.35}s forwards` }} />
            ))}
          </svg>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">{BOOT[boot]}</p>
        </div>
      </div>

      <div className="absolute bottom-10 right-6 font-display text-6xl tabular-nums md:text-8xl lg:text-9xl">
        {String(count).padStart(3, '0')}
      </div>

      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-stroke">
        <div
          className="accent-gradient h-full origin-left"
          style={{ transform: `scaleX(${count / 100})`, boxShadow: '0 0 8px rgba(99,212,194,0.4)' }}
        />
      </div>
    </div>
  )
}
```
Note: `draw-line` keyframe animates `stroke-dashoffset` to 0; with `pathLength={1}` and `strokeDasharray:1` the path draws fully. (Reduced-motion users skip LoadingScreen entirely — `isLoading` starts false in App.)

- [ ] **Step 2: Verify build + browser**

```bash
npm run typecheck && npm run dev
```
Expected: counter runs 000→100 (~2.7s), wireframe draws, boot log cycles, bar fills, then fades to reveal the app.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: loading screen — compiling the structure"
```

---

## Task 6: Navbar

**Files:**
- Modify: `src/components/Navbar.tsx`

- [ ] **Step 1: Implement** (spec §6.2). Fixed top-center pill; logo node with rotating accent ring; nav links `["Index","Structures","Toolkit","Log","Contact"]` → ids `top, structures, toolkit, log, contact`; active state via scroll position; "Say hi ↗" button with hover gradient ring; shadow when `scrollY > 100`. Use `scrollToId` from `lib/smoothScroll`.

```tsx
import { useEffect, useState } from 'react'
import { scrollToId } from '../lib/smoothScroll'

const LINKS: { label: string; id: string }[] = [
  { label: 'Index', id: 'top' },
  { label: 'Structures', id: 'structures' },
  { label: 'Toolkit', id: 'toolkit' },
  { label: 'Log', id: 'log' },
  { label: 'Contact', id: 'contact' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState('top')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id) })
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    LINKS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  return (
    <nav className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 md:pt-6">
      <div className={`inline-flex items-center rounded-full border border-stroke bg-surface px-2 py-2 backdrop-blur-md transition-shadow ${scrolled ? 'shadow-md shadow-black/20' : ''}`}>
        {/* logo node */}
        <button onClick={() => scrollToId('top')} className="group relative mx-1 grid h-9 w-9 place-items-center transition-transform hover:scale-110" aria-label="Top">
          <span className="accent-gradient absolute inset-0 rounded-full transition-transform duration-500 group-hover:[transform:rotate(-180deg)]" />
          <span className="absolute inset-[2px] grid place-items-center rounded-full bg-bg font-display text-[13px]">AT</span>
        </button>

        <span className="mx-1 hidden h-5 w-px bg-stroke sm:block" />

        {LINKS.map(({ label, id }) => (
          <button
            key={id}
            onClick={() => scrollToId(id)}
            className={`rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors sm:px-4 sm:text-sm ${
              active === id ? 'bg-stroke text-text-primary' : 'text-muted hover:bg-stroke hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        ))}

        <span className="mx-1 hidden h-5 w-px bg-stroke sm:block" />

        <button onClick={() => scrollToId('contact')} className="group relative mx-1 rounded-full px-3 py-1.5 sm:px-4">
          <span className="gradient-ring absolute -inset-[2px] rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
          <span className="relative grid place-items-center rounded-full bg-surface px-2 py-0.5 font-mono text-xs uppercase tracking-wider backdrop-blur-md sm:text-sm">
            Say hi ↗
          </span>
        </button>
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Verify browser** — pill floats, shadow appears after scrolling 100px, links scroll smoothly and highlight the active section, hover ring on "Say hi".

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: floating navbar with active section tracking + smooth scroll"
```

---

## Task 7: StructureStage (hero isometric tower)

**Files:**
- Modify: `src/components/StructureStage.tsx` (create it)

- [ ] **Step 1: Define geometry helpers + SVG** (spec §6.4). 5 stacked isometric diamond plates bottom→top with gentle massing; columns connecting corresponding corners + central spine; nodes at corners + apex; 3 dashed annotation leaders with mono labels; data-flow dots via `<animateMotion>`.

Use this coordinate model (viewBox `0 0 540 600`, `overflow:visible`). Plates indexed 0 (base) → 4 (apex), center x=270:

```tsx
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { useReducedMotion } from '../lib/useReducedMotion'

interface Plate { cx: number; cy: number; rx: number; ry: number }

// bottom (i=0) wide & low, narrowing & rising to apex
const PLATES: Plate[] = [
  { cx: 268, cy: 470, rx: 150, ry: 75 },
  { cx: 276, cy: 388, rx: 128, ry: 64 },
  { cx: 262, cy: 312, rx: 108, ry: 54 },
  { cx: 280, cy: 244, rx: 84, ry: 42 },
  { cx: 270, cy: 186, rx: 60, ry: 30 },
]

const platePath = (p: Plate) =>
  `M${p.cx},${p.cy - p.ry} L${p.cx - p.rx},${p.cy} L${p.cx},${p.cy + p.ry} L${p.cx + p.rx},${p.cy} Z`

// 4 corners of a plate: top, left, bottom, right
const corners = (p: Plate) => [
  { x: p.cx, y: p.cy - p.ry },
  { x: p.cx - p.rx, y: p.cy },
  { x: p.cx, y: p.cy + p.ry },
  { x: p.cx + p.rx, y: p.cy },
]

export default function StructureStage() {
  const reduced = useReducedMotion()
  const groupRef = useRef<SVGGElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // GSAP assembly on load
  useEffect(() => {
    if (reduced) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.fromTo('.ss-plate, .ss-edge',
        { strokeDashoffset: (i, el) => (el as SVGPathElement).getTotalLength() },
        { strokeDashoffset: 0, duration: 1.4, stagger: 0.12 }, 0.3)
        .fromTo('.ss-node', { scale: 0, opacity: 0, transformOrigin: 'center' },
          { scale: 1, opacity: 1, duration: 0.4, stagger: 0.05 }, '-=1.0')
        .fromTo('.ss-anno', { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: 0.1 }, '-=0.2')
    }, groupRef)
    return () => ctx.revert()
  }, [reduced])

  // set dash arrays so lines can draw
  useEffect(() => {
    if (reduced) return
    groupRef.current?.querySelectorAll<SVGPathElement>('.ss-plate, .ss-edge').forEach((el) => {
      const len = el.getTotalLength()
      el.style.strokeDasharray = String(len)
      el.style.strokeDashoffset = String(len)
    })
  }, [reduced])

  // mouse parallax
  useEffect(() => {
    if (reduced) return
    const root = rootRef.current
    if (!root) return
    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX / window.innerWidth - 0.5)
      const dy = (e.clientY / window.innerHeight - 0.5)
      gsap.to(groupRef.current, { x: dx * 14, y: dy * 14, scale: 1.03, duration: 0.6, ease: 'power2.out' })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [reduced])

  const annotations = [
    { node: corners(PLATES[4])[0], label: '[ TOP ] AGENT LAYER', dir: 1 },
    { node: corners(PLATES[2])[3], label: '[ MID ] API · NODE', dir: 1 },
    { node: corners(PLATES[0])[1], label: '[ BASE ] DATA · PG', dir: -1 },
  ]

  return (
    <div ref={rootRef} className="relative w-full">
      <svg viewBox="0 0 540 600" className="w-full overflow-visible" style={{ filter: 'drop-shadow(0 0 1px rgba(99,212,194,0.1))' }}>
        <g ref={groupRef}>
          {/* columns: connect corresponding corners between adjacent plates */}
          {PLATES.slice(0, -1).map((p, i) => {
            const a = corners(p), b = corners(PLATES[i + 1])
            return a.map((c, k) => (
              <path key={`col-${i}-${k}`} className="ss-edge" d={`M${c.x},${c.y} L${b[k].x},${b[k].y}`}
                fill="none" stroke="hsl(var(--line)/0.5)" strokeWidth="1" />
            ))
          })}
          {/* central spine */}
          <path className="ss-edge" d={`M${PLATES[0].cx},${PLATES[0].cy} L${PLATES[4].cx},${PLATES[4].cy - PLATES[4].ry}`}
            fill="none" stroke="hsl(var(--accent)/0.6)" strokeWidth="1" id="ss-spine" />
          {/* plates */}
          {PLATES.map((p, i) => (
            <path key={`plate-${i}`} className="ss-plate" d={platePath(p)} fill="hsl(var(--surface)/0.25)"
              stroke="hsl(var(--line)/0.85)" strokeWidth="1.25" />
          ))}
          {/* nodes */}
          {PLATES.flatMap((p, i) =>
            corners(p).map((c, k) => (
              <circle key={`node-${i}-${k}`} className="ss-node animate-node-pulse" cx={c.x} cy={c.y} r="4"
                fill="hsl(var(--accent))" style={{ filter: 'drop-shadow(0 0 4px hsl(var(--accent)))' }} />
            )),
          )}
          <circle className="ss-node animate-node-pulse" cx={PLATES[4].cx} cy={PLATES[4].cy - PLATES[4].ry} r="5"
            fill="hsl(var(--accent))" style={{ filter: 'drop-shadow(0 0 6px hsl(var(--accent)))' }} />

          {/* annotation leaders + labels */}
          {annotations.map((a, i) => {
            const endX = a.node.x + a.dir * 90
            return (
              <g key={`anno-${i}`} className="ss-anno">
                <line x1={a.node.x} y1={a.node.y} x2={endX} y2={a.node.y}
                  stroke="hsl(var(--accent)/0.7)" strokeWidth="1" strokeDasharray="3 3" />
                <text x={a.dir === 1 ? endX + 6 : endX - 6} y={a.node.y + 3}
                  textAnchor={a.dir === 1 ? 'start' : 'end'}
                  className="font-mono" fontSize="11" fill="hsl(var(--muted))" letterSpacing="1.5">
                  {a.label}
                </text>
              </g>
            )
          })}

          {/* data-flow dots */}
          {!reduced && (
            <>
              <circle r="3" fill="hsl(var(--accent))">
                <animateMotion dur="3s" repeatCount="indefinite"
                  path={`M${PLATES[0].cx},${PLATES[0].cy} L${PLATES[4].cx},${PLATES[4].cy - PLATES[4].ry}`} />
              </circle>
              <circle r="2.5" fill="hsl(var(--accent))">
                <animateMotion dur="4s" repeatCount="indefinite"
                  path={`M${corners(PLATES[0])[3].x},${corners(PLATES[0])[3].y} L${corners(PLATES[3])[3].x},${corners(PLATES[3])[3].y}`} />
              </circle>
            </>
          )}
        </g>
      </svg>
    </div>
  )
}
```
Note: when `reduced`, plates/edges keep default `strokeDashoffset:0` (fully drawn), nodes show, no parallax, no flow dots — final state immediately.

- [ ] **Step 2: Verify** by temporarily rendering `<StructureStage />` alone (or wait for Task 8). `npm run typecheck` passes.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: hero isometric structure stage with GSAP assembly, pulse, data flow, parallax"
```

---

## Task 8: Hero

**Files:**
- Modify: `src/components/Hero.tsx`

- [ ] **Step 1: Implement** (spec §6.3). Two-column asymmetric (text left, structure right), stacks on mobile with structure on top. Eyebrow (`blur-in`), name (`name-reveal`), role line cycling every 2s, description, two CTAs, scroll indicator. GSAP entrance for `.name-reveal` and `.blur-in`. Uses `StructureStage`, `HERO_ROLES`, `scrollToId`, `EMAIL`.

```tsx
import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import StructureStage from './StructureStage'
import { HERO_ROLES, EMAIL } from '../data/content'
import { scrollToId } from '../lib/smoothScroll'
import { useReducedMotion } from '../lib/useReducedMotion'

export default function Hero() {
  const reduced = useReducedMotion()
  const [roleIndex, setRoleIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = setInterval(() => setRoleIndex((i) => (i + 1) % HERO_ROLES.length), 2000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (reduced) return
    const ctx = gsap.context(() => {
      gsap.to('.name-reveal', { opacity: 1, y: 0, duration: 1.2, delay: 0.1, ease: 'power3.out' })
      gsap.to('.blur-in', { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, stagger: 0.1, delay: 0.3, ease: 'power3.out' })
    }, ref)
    return () => ctx.revert()
  }, [reduced])

  return (
    <section id="top" ref={ref} className="relative min-h-screen overflow-hidden px-6 pt-28 md:px-10 lg:px-16">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 md:min-h-[calc(100vh-7rem)] md:grid-cols-2">
        {/* structure: first on mobile (order), right on desktop */}
        <div className="order-1 md:order-2">
          <StructureStage />
        </div>

        <div className="order-2 md:order-1">
          <p className="blur-in mb-6 font-mono text-xs uppercase tracking-[0.3em] text-accent">
            // INDUSTRIAL ENGINEERING AND ARTIFICIAL INTELLIGENCE @ NORTHWESTERN UNIVERSITY
          </p>
          <h1 className="name-reveal mb-5 font-display text-6xl font-extrabold leading-[0.92] tracking-tight md:text-8xl lg:text-9xl">
            Alan Tai
          </h1>
          <p className="mb-8 font-display text-2xl md:text-3xl">
            A{' '}
            <span key={roleIndex} className="animate-role-fade-in inline-block text-accent">
              {HERO_ROLES[roleIndex]}
            </span>{' '}
            building in Cupertino, California.
          </p>
          <p className="blur-in mb-8 max-w-md font-body text-sm text-muted md:text-base">
            I design software the way an architect designs a building — load-bearing parts, clean joints, and a plan you can actually read.
          </p>
          <div className="inline-flex flex-wrap gap-4">
            <button onClick={() => scrollToId('structures')}
              className="group relative rounded-full bg-text-primary px-7 py-3.5 font-mono text-sm text-bg transition hover:scale-105 hover:bg-bg hover:text-text-primary">
              <span className="gradient-ring absolute -inset-[2px] rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
              <span className="relative">See Structures</span>
            </button>
            <a href={`mailto:${EMAIL}`}
              className="group relative rounded-full border-2 border-stroke bg-bg px-7 py-3.5 font-mono text-sm transition hover:scale-105 hover:border-transparent">
              <span className="gradient-ring absolute -inset-[2px] rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
              <span className="relative">Reach out ↗</span>
            </a>
          </div>
        </div>
      </div>

      {/* scroll indicator */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">SCROLL</span>
        <span className="relative h-10 w-px overflow-hidden bg-stroke">
          <span className="animate-scan absolute inset-x-0 top-0 h-4 bg-accent" />
        </span>
      </div>
    </section>
  )
}
```
Note: the solid CTA's text color flips to teal-ish via the gradient ring on hover; keep `hover:text-text-primary` as specified.

- [ ] **Step 2: Milestone browser verification** — loading → hero handoff, name + eyebrow animate in, role word cycles every 2s, structure assembles and pulses, parallax follows mouse, scroll indicator scans, CTAs scroll/mailto. Also verify mobile (structure on top). Check reduced-motion (DevTools → Rendering → emulate prefers-reduced-motion): no loading screen, final states shown.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: hero — name/role/eyebrow entrance, structure stage, CTAs, scroll indicator"
```

---

## Task 9: Project glyphs

**Files:**
- Create: `src/components/glyphs/TowerGlyph.tsx`, `GlobeGlyph.tsx`, `TreeGlyph.tsx`, `GridGlyph.tsx`, `index.ts`

- [ ] **Step 1: Shared props + four distinct isometric SVGs.** Each is a thin teal-stroke drawing ~64×64 with nodes that go `opacity-35 → opacity-100` + glow when an ancestor has `group-hover` (Tailwind `group-hover:` on the nodes). Each accepts `className`.

`TowerGlyph` — stacked plates (a building):
```tsx
export default function TowerGlyph({ className = '' }: { className?: string }) {
  const plates = [[32, 50, 24, 10], [32, 38, 19, 8], [32, 27, 14, 6], [32, 17, 9, 4]] as const
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      {plates.map(([cx, cy, rx, ry], i) => (
        <path key={i} d={`M${cx},${cy - ry} L${cx - rx},${cy} L${cx},${cy + ry} L${cx + rx},${cy} Z`}
          stroke="hsl(var(--accent))" strokeWidth="1" />
      ))}
      {plates.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="2" fill="hsl(var(--accent))"
          className="opacity-35 transition-opacity duration-300 group-hover:opacity-100"
          style={{ filter: 'drop-shadow(0 0 3px hsl(var(--accent)))' }} />
      ))}
    </svg>
  )
}
```

`GlobeGlyph` — ring/globe of nodes linked by arcs:
```tsx
export default function GlobeGlyph({ className = '' }: { className?: string }) {
  const nodes = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2
    return { x: 32 + Math.cos(a) * 20, y: 32 + Math.sin(a) * 20 }
  })
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      <circle cx="32" cy="32" r="20" stroke="hsl(var(--line)/0.5)" strokeWidth="1" />
      <ellipse cx="32" cy="32" rx="20" ry="8" stroke="hsl(var(--line)/0.5)" strokeWidth="1" />
      {nodes.map((n, i) => (
        <line key={i} x1="32" y1="32" x2={n.x} y2={n.y} stroke="hsl(var(--accent)/0.6)" strokeWidth="0.75" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r="2" fill="hsl(var(--accent))"
          className="opacity-35 transition-opacity duration-300 group-hover:opacity-100"
          style={{ filter: 'drop-shadow(0 0 3px hsl(var(--accent)))' }} />
      ))}
    </svg>
  )
}
```

`TreeGlyph` — branching timeline / node tree:
```tsx
export default function TreeGlyph({ className = '' }: { className?: string }) {
  const edges = [['12,32', '32,16'], ['12,32', '32,32'], ['12,32', '32,48'], ['32,16', '52,10'], ['32,48', '52,54']]
  const nodes = [[12, 32], [32, 16], [32, 32], [32, 48], [52, 10], [52, 54]]
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      {edges.map(([a, b], i) => (
        <line key={i} x1={a.split(',')[0]} y1={a.split(',')[1]} x2={b.split(',')[0]} y2={b.split(',')[1]}
          stroke="hsl(var(--accent)/0.6)" strokeWidth="1" />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="hsl(var(--accent))"
          className="opacity-35 transition-opacity duration-300 group-hover:opacity-100"
          style={{ filter: 'drop-shadow(0 0 3px hsl(var(--accent)))' }} />
      ))}
    </svg>
  )
}
```

`GridGlyph` — grid of cells collapsing into clusters:
```tsx
export default function GridGlyph({ className = '' }: { className?: string }) {
  const cells = []
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells.push([12 + c * 13, 12 + r * 13])
  const clustered = new Set([5, 6, 9, 10]) // center cells glow as a cluster
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      {cells.map(([x, y], i) => (
        <rect key={i} x={x - 4} y={y - 4} width="8" height="8" rx="1" stroke="hsl(var(--line)/0.5)" strokeWidth="0.75" />
      ))}
      {cells.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="hsl(var(--accent))"
          className={`transition-opacity duration-300 group-hover:opacity-100 ${clustered.has(i) ? 'opacity-70' : 'opacity-35'}`}
          style={{ filter: 'drop-shadow(0 0 3px hsl(var(--accent)))' }} />
      ))}
    </svg>
  )
}
```

`index.ts`:
```ts
import TowerGlyph from './TowerGlyph'
import GlobeGlyph from './GlobeGlyph'
import TreeGlyph from './TreeGlyph'
import GridGlyph from './GridGlyph'
import type { GlyphKind } from '../../data/content'

export const GLYPHS: Record<GlyphKind, (props: { className?: string }) => JSX.Element> = {
  tower: TowerGlyph,
  globe: GlobeGlyph,
  tree: TreeGlyph,
  grid: GridGlyph,
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: four hand-authored isometric project glyphs"
```

---

## Task 10: ProjectCard + SelectedStructures bento grid

**Files:**
- Create: `src/components/ProjectCard.tsx`
- Modify: `src/components/SelectedStructures.tsx`
- Create: `public/projects/.gitkeep`

- [ ] **Step 1: `ProjectCard.tsx`** (spec §6.5). Screenshot-or-placeholder background, blueprint+halftone overlay, glyph top-left, default number+title label, hover wash + `View — {Title}` pill linking to `project.url`, schedule footer chips. Image source built with `import.meta.env.BASE_URL`; fall back to code placeholder when the image fails to load.

```tsx
import { useState } from 'react'
import type { Project } from '../data/content'
import { GLYPHS } from './glyphs'

export default function ProjectCard({ project }: { project: Project }) {
  const [imgOk, setImgOk] = useState(true)
  const Glyph = GLYPHS[project.glyph]
  const src = `${import.meta.env.BASE_URL}projects/${project.slug}.png`
  const hasLink = project.url !== '#'

  return (
    <article className={`group relative overflow-hidden rounded-xl border border-stroke bg-surface ${project.span === 7 ? 'md:col-span-7' : 'md:col-span-5'}`}>
      <div className="relative aspect-[16/10] w-full">
        {/* screenshot or placeholder gradient */}
        {imgOk ? (
          <img src={src} alt={project.title} loading="lazy" onError={() => setImgOk(false)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--surface)),hsl(var(--bg)))]" />
        )}
        {/* blueprint halftone + grid overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-15 mix-blend-overlay"
          style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--line)) 1px, transparent 1px)', backgroundSize: '4px 4px' }} />
        <div className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'linear-gradient(hsl(var(--line)/0.06) 1px,transparent 1px),linear-gradient(90deg,hsl(var(--line)/0.06) 1px,transparent 1px)', backgroundSize: '30px 30px' }} />

        {/* glyph top-left */}
        <Glyph className="absolute left-5 top-5 h-12 w-12" />

        {/* default label */}
        <div className="absolute bottom-5 left-5">
          <p className="font-mono text-xs text-muted">{project.id}</p>
          <h3 className="font-display text-2xl">{project.title}</h3>
        </div>

        {/* hover wash + pill */}
        <div className="absolute inset-0 grid place-items-center bg-bg/70 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
          {hasLink ? (
            <a href={project.url} target="_blank" rel="noopener noreferrer" className="group/pill relative rounded-full">
              <span className="gradient-ring absolute -inset-[2px] rounded-full" />
              <span className="relative block rounded-full bg-surface px-5 py-2.5 font-display text-lg">View — {project.title}</span>
            </a>
          ) : (
            <span className="rounded-full border border-stroke bg-surface px-5 py-2.5 font-mono text-xs uppercase tracking-wider text-muted">Link soon</span>
          )}
        </div>
      </div>

      {/* schedule footer */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-stroke px-5 py-3 font-mono text-[11px] text-muted">
        <span>STACK ·</span>
        {project.stack.map((t) => (<span key={t} className="text-accent">{t}</span>))}
      </div>
    </article>
  )
}
```

- [ ] **Step 2: `SelectedStructures.tsx`** (spec §6.5 header + bento grid). Framer Motion `whileInView` header; grid of `ProjectCard`s.

```tsx
import { motion } from 'framer-motion'
import { projects, GITHUB_PROFILE } from '../data/content'
import ProjectCard from './ProjectCard'

export default function SelectedStructures() {
  return (
    <section id="structures" className="bg-bg py-16 md:py-24">
      <div className="mx-auto max-w-[1200px] px-6 md:px-10 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 1 }}
          className="mb-10 flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="h-px w-8 bg-stroke" />
              <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted">Selected Structures</span>
            </div>
            <h2 className="font-display text-4xl md:text-5xl">Featured <span className="text-accent">structures</span></h2>
            <p className="mt-3 max-w-lg font-body text-muted">Things I've designed and built, broken down to their load-bearing parts.</p>
          </div>
          <a href={GITHUB_PROFILE} target="_blank" rel="noopener noreferrer"
            className="group relative hidden rounded-full border border-stroke px-5 py-2.5 font-mono text-sm md:inline-block">
            <span className="gradient-ring absolute -inset-[2px] rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
            <span className="relative">View all →</span>
          </a>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-12 md:gap-6">
          {projects.map((p) => (<ProjectCard key={p.id} project={p} />))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Verify browser** — four cards in 7/5/5/7 layout, glyphs render, placeholder gradient shows (no images yet), hover reveals wash + pill (Prophis/Legal link out; Architec/GreenChain show "Link soon"), stack chips teal. Header reveals on scroll.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: selected structures bento grid + project cards with blueprint overlay"
```

---

## Task 11: Capabilities (spec sheet)

**Files:**
- Modify: `src/components/Capabilities.tsx`

- [ ] **Step 1: Implement** (spec §6.6). Header eyebrow `Capabilities` + heading `The toolkit`; fine-ruled mono schedule grouped by `capabilities`; each group row animates in `whileInView` stagger; teal tick before each group label.

```tsx
import { motion } from 'framer-motion'
import { capabilities } from '../data/content'

export default function Capabilities() {
  return (
    <section id="toolkit" className="bg-bg py-16 md:py-24">
      <div className="mx-auto max-w-[1100px] px-6 md:px-10 lg:px-16">
        <div className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-px w-8 bg-stroke" />
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted">Capabilities</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl">The <span className="text-accent">toolkit</span></h2>
        </div>

        <div className="border-t border-stroke">
          {capabilities.map((group, i) => (
            <motion.div
              key={group.label}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.08 }}
              className="grid grid-cols-1 gap-2 border-b border-stroke py-6 md:grid-cols-[200px_1fr] md:gap-8"
            >
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                {group.label}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-sm">
                {group.items.map((item, k) => (
                  <span key={item} className="text-text-primary">
                    {item}{k < group.items.length - 1 && <span className="ml-3 text-muted">·</span>}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify browser** — four ruled rows, teal tick per group, rows stagger in on scroll.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: capabilities spec-sheet schedule"
```

---

## Task 12: Log (Writing — Substack placeholder)

**Files:**
- Modify: `src/components/Log.tsx`

- [ ] **Step 1: Implement** (spec §6.7). Header eyebrow `Log` + heading `Field notes`; if `logEntries` empty → quiet "Writing soon." placeholder; otherwise ruled rows linking out. Structured so a future `posts.json` fills `logEntries`.

```tsx
import { motion } from 'framer-motion'
import { logEntries, SUBSTACK_URL } from '../data/content'

export default function Log() {
  const hasPosts = logEntries.length > 0
  return (
    <section id="log" className="bg-bg py-16 md:py-24">
      <div className="mx-auto max-w-[1000px] px-6 md:px-10 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 1 }} className="mb-10"
        >
          <div className="mb-4 flex items-center gap-3">
            <span className="h-px w-8 bg-stroke" />
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted">Log</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl">Field <span className="text-accent">notes</span></h2>
          <p className="mt-3 max-w-lg font-body text-muted">Working notes on building with AI agents, systems, and whatever I'm currently obsessed with.</p>
        </motion.div>

        {!hasPosts ? (
          <div className="border-y border-stroke py-12 text-center font-mono text-sm uppercase tracking-[0.2em] text-muted">
            Writing soon.
          </div>
        ) : (
          <>
            <div className="border-t border-stroke">
              {logEntries.slice(0, 5).map((entry, i) => (
                <motion.a
                  key={entry.url} href={entry.url} target="_blank" rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="group flex items-baseline justify-between gap-6 border-b border-stroke py-5 transition-colors hover:bg-surface"
                >
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-xs text-muted">N°{String(i + 1).padStart(2, '0')}</span>
                    <span className="font-display text-xl transition-colors group-hover:text-accent md:text-2xl">{entry.title}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted">
                    <span>{new Date(entry.date).toLocaleDateString()} · {entry.readTime}</span>
                    <span className="transition-transform group-hover:translate-x-1">↗</span>
                  </div>
                </motion.a>
              ))}
            </div>
            {SUBSTACK_URL && (
              <a href={SUBSTACK_URL} target="_blank" rel="noopener noreferrer"
                className="mt-6 inline-block font-mono text-sm text-muted transition-colors hover:text-accent">
                Read more on Substack ↗
              </a>
            )}
          </>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify browser** — header reveals; "Writing soon." placeholder shows (since `logEntries` is empty).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: log section with writing-soon placeholder + future-ready entry list"
```

---

## Task 13: Explorations (scroll-scrubbed structure)

**Files:**
- Modify: `src/components/Explorations.tsx`

- [ ] **Step 1: Implement** (spec §6.8). `min-h-[300vh]` section; Layer 1 pinned center text (eyebrow `Explorations`, heading `The build`, subtext, GitHub button); Layer 2 a large isometric megastructure SVG behind that assembles as you scroll via a scrubbed GSAP timeline (foundation grid → columns → plates → nodes → flow), reversing on scroll up. Reduced-motion shows the final assembled state with no pin/scrub.

```tsx
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { GITHUB_PROFILE } from '../data/content'
import { useReducedMotion } from '../lib/useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

export default function Explorations() {
  const reduced = useReducedMotion()
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (reduced) return
    const ctx = gsap.context(() => {
      // set draw dash arrays
      svgRef.current?.querySelectorAll<SVGPathElement>('.ex-draw').forEach((el) => {
        const len = el.getTotalLength()
        el.style.strokeDasharray = String(len)
        el.style.strokeDashoffset = String(len)
      })

      ScrollTrigger.create({ trigger: sectionRef.current, start: 'top top', end: 'bottom bottom', pin: contentRef.current, pinSpacing: false })

      const tl = gsap.timeline({
        scrollTrigger: { trigger: sectionRef.current, start: 'top top', end: 'bottom bottom', scrub: true },
      })
      tl.to('.ex-foundation', { strokeDashoffset: 0, duration: 1 })
        .to('.ex-column', { strokeDashoffset: 0, duration: 1, stagger: 0.05 })
        .to('.ex-plate', { strokeDashoffset: 0, duration: 1, stagger: 0.1 })
        .fromTo('.ex-node', { scale: 0, opacity: 0, transformOrigin: 'center' }, { scale: 1, opacity: 1, duration: 0.5, stagger: 0.03 })
        .fromTo('.ex-layer-back', { yPercent: 8 }, { yPercent: -8, duration: 3 }, 0)
    }, sectionRef)
    return () => ctx.revert()
  }, [reduced])

  return (
    <section ref={sectionRef} className="relative min-h-[300vh] bg-bg">
      {/* Layer 2: scrubbed megastructure (behind) */}
      <div className="ex-layer-back absolute inset-0 z-0 grid place-items-center opacity-60">
        <svg ref={svgRef} viewBox="0 0 800 600" className="h-screen w-full max-w-[1100px] overflow-visible">
          {/* foundation grid */}
          <path className="ex-draw ex-foundation" d="M150,460 L400,360 L650,460 L400,560 Z" fill="none" stroke="hsl(var(--line)/0.4)" strokeWidth="1" />
          {/* columns */}
          {[[250, 420], [400, 360], [550, 420], [400, 500]].map(([x, y], i) => (
            <path key={i} className="ex-draw ex-column" d={`M${x},${y} L${x},${y - 140}`} fill="none" stroke="hsl(var(--line)/0.55)" strokeWidth="1" />
          ))}
          {/* plates */}
          {[300, 200].map((cy, i) => (
            <path key={i} className="ex-draw ex-plate" d={`M400,${cy - 60} L${400 - 160 + i * 30},${cy} L400,${cy + 60} L${400 + 160 - i * 30},${cy} Z`}
              fill="none" stroke="hsl(var(--accent)/0.7)" strokeWidth="1.25" />
          ))}
          {/* nodes */}
          {[[250, 280], [550, 280], [400, 140], [400, 360]].map(([x, y], i) => (
            <circle key={i} className="ex-node" cx={x} cy={y} r="5" fill="hsl(var(--accent))" style={{ filter: 'drop-shadow(0 0 6px hsl(var(--accent)))' }} />
          ))}
        </svg>
      </div>

      {/* Layer 1: pinned center text */}
      <div ref={contentRef} className="relative z-10 grid h-screen place-items-center px-6 text-center">
        <div className="max-w-xl">
          <div className="mb-4 flex items-center justify-center gap-3">
            <span className="h-px w-8 bg-stroke" />
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted">Explorations</span>
          </div>
          <h2 className="font-display text-5xl md:text-7xl">The <span className="text-accent">build</span></h2>
          <p className="mx-auto mt-4 max-w-md font-body text-muted">Scroll to watch a structure assemble — foundation, columns, plates, then the nodes light up and start computing.</p>
          <a href={GITHUB_PROFILE} target="_blank" rel="noopener noreferrer"
            className="group relative mt-8 inline-block rounded-full border border-stroke px-6 py-3 font-mono text-sm">
            <span className="gradient-ring absolute -inset-[2px] rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
            <span className="relative">GitHub ↗</span>
          </a>
        </div>
      </div>
    </section>
  )
}
```
Note: under reduced motion, no dash arrays are set (so `ex-draw` paths render fully) and nodes default to visible — render final assembled state. Ensure nodes have no opacity:0 baseline in CSS; GSAP `fromTo` sets it only when animating.

- [ ] **Step 2: Verify browser** — scrolling into the section pins the center text while the megastructure assembles/reverses with scroll; parallax depth on the back layer; GitHub button works. Then test reduced-motion: structure shown assembled, no pin.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: explorations — scroll-scrubbed megastructure assembly with pinned text"
```

---

## Task 14: ContactFooter

**Files:**
- Modify: `src/components/ContactFooter.tsx`

- [ ] **Step 1: Implement** (spec §6.9). GSAP marquee of `BUILDING STRUCTURES OUT OF CODE • `; big email CTA (mailto); footer bar with socials, pulsing teal node + "Available for work", wordmark `ALAN TAI.` (teal period).

```tsx
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { EMAIL, socials } from '../data/content'
import { useReducedMotion } from '../lib/useReducedMotion'

export default function ContactFooter() {
  const reduced = useReducedMotion()
  const marqueeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (reduced) return
    const ctx = gsap.context(() => {
      gsap.to('.marquee-track', { xPercent: -50, duration: 40, ease: 'none', repeat: -1 })
    }, marqueeRef)
    return () => ctx.revert()
  }, [reduced])

  const phrase = 'BUILDING STRUCTURES OUT OF CODE • '
  return (
    <footer id="contact" className="overflow-hidden bg-bg pb-8 pt-16 md:pt-20">
      {/* marquee */}
      <div ref={marqueeRef} className="select-none overflow-hidden whitespace-nowrap">
        <div className="marquee-track inline-block">
          <span className="font-display text-[10vw] leading-none text-text-primary/10">{phrase.repeat(10)}</span>
          <span className="font-display text-[10vw] leading-none text-text-primary/10">{phrase.repeat(10)}</span>
        </div>
      </div>

      {/* CTA */}
      <div className="mx-auto max-w-[1100px] px-6 py-16 text-center md:px-10 lg:px-16">
        <a href={`mailto:${EMAIL}`} className="group relative inline-block rounded-full bg-text-primary px-10 py-5 font-display text-2xl text-bg transition hover:scale-105 md:text-4xl">
          <span className="gradient-ring absolute -inset-[2px] rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
          <span className="relative">Let's build something ↗</span>
        </a>
      </div>

      {/* footer bar */}
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-4 border-t border-stroke px-6 pt-6 md:px-10 lg:px-16">
        <div className="flex items-center gap-4 font-mono text-sm">
          {socials.map((s) => (
            <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer"
              className={`text-muted underline-offset-4 transition-colors hover:text-text-primary hover:underline ${s.url === '#' ? 'pointer-events-none opacity-40' : ''}`}>
              {s.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          Available for work
        </div>
        <div className="font-display text-xl">ALAN TAI<span className="text-accent">.</span></div>
      </div>
    </footer>
  )
}
```
(`animate-ping` is built into Tailwind; under reduced-motion the global CSS neutralizes it.)

- [ ] **Step 2: Verify browser** — marquee scrolls seamlessly, email CTA opens mail client, socials render (X disabled until URL added), pulsing node, wordmark with teal period.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: contact footer — marquee, email CTA, socials, availability node"
```

---

## Task 15: Full integration + reduced-motion + responsive audit

**Files:**
- Modify: `src/App.tsx` (already imports real components — verify), any fixes found.

- [ ] **Step 1: Confirm all stubs are replaced** and `App.tsx` renders the real components in order: LoadingScreen, CornerTicks, Navbar, Hero, SelectedStructures, Capabilities, Log, Explorations, ContactFooter.

- [ ] **Step 2: Full browser pass at desktop width.** Walk the whole page top→bottom: loading→hero handoff; nav active states update per section; every reveal/animation fires; Explorations pins and scrubs without layout jump into the footer.

- [ ] **Step 3: Reduced-motion pass.** DevTools → Rendering → "Emulate prefers-reduced-motion: reduce". Reload. Confirm: no loading screen, hero/structure shown in final state, no parallax, Explorations shows assembled structure with no pin, no marquee motion, content sections fully visible.

- [ ] **Step 4: Responsive pass.** Narrow to ~375px: navbar dividers hidden, hero stacks with structure on top, bento grid single column, schedule/log rows readable, no horizontal overflow. Fix any overflow (usually the marquee or large display type — already `overflow-hidden`).

- [ ] **Step 5: Verify build**

```bash
npm run typecheck && npm run build
```
Expected: PASS.

- [ ] **Step 6: Commit** (any fixes)

```bash
git add -A && git commit -m "fix: integration, reduced-motion, and responsive audit passes"
```

---

## Task 16: Favicon (AT node glyph) + OG + public assets

**Files:**
- Create: `public/favicon.svg`, `public/projects/.gitkeep` (if not present)
- Modify: `index.html`

- [ ] **Step 1: `public/favicon.svg`** — the AT node glyph on `--bg`.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#14171c"/>
  <circle cx="32" cy="32" r="22" fill="none" stroke="#63d4c2" stroke-width="3"/>
  <text x="32" y="40" text-anchor="middle" font-family="Syne, sans-serif" font-weight="800" font-size="22" fill="#e9ede9">AT</text>
</svg>
```

- [ ] **Step 2: Reference it in `index.html` `<head>`** (replace the default vite favicon link):

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```
Note: Vite rewrites `/favicon.svg` against `base` automatically for files in `public/` referenced in `index.html`. Verify the built `dist/index.html` href includes the base.

- [ ] **Step 3: Verify** the favicon shows in the dev tab. `npm run build` passes.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: AT node-glyph favicon + public/projects drop-in dir"
```

---

## Task 17: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`, `public/CNAME.example`
- Modify: `README.md`

- [ ] **Step 1: `.github/workflows/deploy.yml`** — build with the project-site base and deploy to Pages.

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
        # For a custom domain (alantai.org) set base to root instead:
        #   VITE_BASE: "/"
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: `public/CNAME.example`** (template for the future custom domain)

```
alantai.org
```
Add a comment in README: when ready, rename to `public/CNAME` and set `VITE_BASE: "/"` in the workflow.

- [ ] **Step 3: Update `README.md`** with run/build/deploy instructions and the custom-domain switch.

```md
# personal-website

Alan Tai's portfolio — "Computational Structures". React + Vite + Tailwind + GSAP.

## Develop
\`\`\`bash
npm install
npm run dev
\`\`\`

## Build
\`\`\`bash
npm run build      # outputs dist/
\`\`\`

## Deploy
Pushes to \`main\` deploy to GitHub Pages via \`.github/workflows/deploy.yml\`.
Enable Pages → Source: "GitHub Actions" in repo Settings once.

Current URL: https://at350.github.io/personal-website/

### Custom domain (later)
1. Rename \`public/CNAME.example\` → \`public/CNAME\`.
2. Set \`VITE_BASE: "/"\` in the workflow's build step env.
3. Point \`alantai.org\` DNS at GitHub Pages.

## Add project screenshots
Drop \`architec.png\`, \`greenchain.png\`, \`prophis.png\`, \`legal-llm.png\`
(~1600px, 16:10) into \`public/projects/\`. Cards use them automatically.
\`\`\`
```

- [ ] **Step 4: Verify** the workflow YAML is valid (it'll run on push). `npm run build` still passes locally.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "ci: github pages deploy workflow + README + custom-domain template"
```

---

## Task 18: Final verification + finish branch

**Files:** none (verification only)

- [ ] **Step 1: Clean build from scratch**

```bash
rm -rf dist node_modules/.vite
npm run typecheck
npm run build
npm run preview
```
Expected: typecheck + build pass; `preview` serves the site at the base path with no console errors. Open it and click each nav link; confirm assets (favicon, fonts) load under `/personal-website/`.

- [ ] **Step 2: Final reduced-motion + responsive spot check** in `preview` (same as Task 15 Steps 3–4) to confirm the production bundle behaves.

- [ ] **Step 3: Push branch and open PR** (or merge per user preference — see finishing-a-development-branch).

```bash
git push -u origin feat/computational-structures-portfolio
```

- [ ] **Step 4:** Use superpowers:finishing-a-development-branch to decide merge/PR/cleanup. After merge to `main`, confirm the Actions deploy succeeds and the live URL renders.

---

## Self-Review (completed during planning)

**Spec coverage:** Loading §6.1→T5; Navbar §6.2→T6; Hero §6.3→T8; StructureStage §6.4→T7; SelectedStructures §6.5→T10 (+glyphs T9); Capabilities §6.6→T11; Log §6.7→T12; Explorations §6.8→T13; ContactFooter §6.9→T14; design system §4→T2; data model §7→T3; reduced motion §10→T2/T4/T15; deploy §3→T17; verification §11→T15/T18; favicon §12→T16. All covered.

**Placeholder scan:** No vague steps; Devpost/X placeholders are intentional `#` values documented in code comments and README. The only "TODO" markers are in `content.ts` next to the two Devpost URLs and the X URL — intentional, one-line edits.

**Type consistency:** `Project.url === '#'` sentinel used consistently in ProjectCard (`hasLink`) and socials (disabled style). `GlyphKind` union matches `GLYPHS` record keys (`tower|globe|tree|grid`). `scrollToId`/`initSmoothScroll` signatures match call sites. `logEntries`/`SUBSTACK_URL` names match Log usage. Section ids (`top, structures, toolkit, log, contact`) match Navbar `LINKS` and component `id` attributes.
