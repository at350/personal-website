# Alan Tai Portfolio — "Computational Structures" Design Spec

**Date:** 2026-05-25
**Status:** Approved (pending user spec review)
**Repo:** `personal-website` (GitHub: `at350`)

## 1. Overview

A single-page dark portfolio landing page whose visual language is an architectural
drawing crossed with a software-systems diagram. Projects are rendered as *structures*:
precise linework, a drafting grid, annotated parts. The site is moody and precise in
empty areas (hero, section breaks) and clean / instantly scannable wherever there is
real content.

The full visual specification supplied by the user is the source of truth for look and
feel. This document records the architecture, the engineering decisions, and the
section-by-section build contract so implementation can proceed unambiguously.

## 2. Stack

- **React + Vite + TypeScript**
- **Tailwind CSS** (custom colors, fonts, keyframes) + **tailwindcss-animate**
- **GSAP** + **ScrollTrigger** (hero assembly, scroll-scrubbed Explorations, marquee)
- **Framer Motion** (`whileInView` reveals for content sections)
- **Lenis** (smooth scroll, synced to ScrollTrigger)

### Decisions / deviations from the original dependency list

| Original | Decision | Rationale |
|---|---|---|
| `react-router-dom` | **Dropped** | Single page; nav = anchor scroll via Lenis. Router adds Pages friction (basename + 404 SPA hack) for no benefit. |
| `@studio-freight/lenis` | **`lenis`** | Current package name; `@studio-freight` scope deprecated. |
| `rss-parser` + `/api/posts` / build-time bake | **Omitted now** | Log renders the "Writing soon." placeholder. Structured so a feed URL + bake script can be added later with no refactor. |
| Vercel serverless + cron | **GitHub Actions → GitHub Pages** | Fully static site; no server-side needs. |

## 3. Deployment

- **Target:** GitHub Pages, deployed by a GitHub Actions workflow on push to `main`.
- **Now:** project site at `https://at350.github.io/personal-website/`.
  - `vite.config.ts` → `base: process.env.VITE_BASE ?? '/personal-website/'`.
- **Later (custom domain `alantai.org`):** set `VITE_BASE=/` (or change default) and add
  `public/CNAME` containing `alantai.org`. The base is the only thing that must flip.
- All internal asset references must respect Vite's `base` (use `import.meta.env.BASE_URL`
  for any runtime-constructed asset paths, e.g. project screenshots).

## 4. Global Design System

### Fonts (Google Fonts, loaded in `index.html`)
- **Syne** 600–800 → `--font-display` / Tailwind `font-display` (name, headings, big numbers)
- **JetBrains Mono** 400–500 → `--font-mono` / `font-mono` (labels, metadata, technical UI, schedules)
- **Archivo** 400–500 → `--font-body` / `font-body` (paragraphs, descriptions — the readable one)

Rule: display + mono for impact/texture, body for reading. Never set paragraphs in Syne or mono.

### CSS custom properties (HSL, no `hsl()` wrapper)
```
--bg:       216 17% 9%;
--surface:  213 16% 12%;
--text:     140 9% 92%;
--muted:    140 5% 53%;
--line:     150 11% 82%;
--stroke:   150 11% 82%;
--accent:   171 57% 61%;
--amber:    32 60% 61%;
```

### Tailwind custom colors
```
bg, surface, "text-primary":hsl(var(--text)), muted, line,
stroke: hsl(var(--stroke) / 0.18)   // low-alpha borders
accent, amber
```

### Accent gradient
`linear-gradient(90deg, #63d4c2 0%, #3fa896 100%)` as `.accent-gradient` utility —
logo node ring, hover border rings, progress bar, active data pulses. Optional warm
variant `#63d4c2 → #d6a05f` for one hero accent.

### Signature texture — `.drafting-grid` (applied to `body`)
```
background-image:
  linear-gradient(hsl(var(--line)/0.05) 1px, transparent 1px),
  linear-gradient(90deg, hsl(var(--line)/0.05) 1px, transparent 1px),
  linear-gradient(hsl(var(--line)/0.09) 1px, transparent 1px),
  linear-gradient(90deg, hsl(var(--line)/0.09) 1px, transparent 1px);
background-size: 30px 30px, 30px 30px, 150px 150px, 150px 150px;
```
Fine 30px module + major 150px module. Keep visible but quiet.

### Custom animations (`index.css`)
- `draw-line` — `stroke-dashoffset` full→0 (CSS fallback / glyphs; GSAP drives hero).
- `node-pulse` — `r` 4→6 + opacity breathe, 2.8s infinite.
- `data-flow` — via SVG `<animateMotion>` for dots traveling structure edges.
- `role-fade-in` — opacity 0 + `translateY(8px)` → 1 + 0, 0.4s ease-out.
- `scan` — highlight sliding down scroll-indicator line, `translateY(-100%→200%)`, 1.5s infinite.
- `gradient-shift` — `background-position` 0→100→0, 6s ease infinite (animated gradient borders).
- `grid-fade-in` — grid + corner ticks fade/scale in on first load.

### Global behaviors
- Forced dark theme; `body` = `bg-bg text-text-primary .drafting-grid`. No light toggle.
- Lenis smooth scroll synced to GSAP ScrollTrigger.
- **`prefers-reduced-motion`** disables line-draw, parallax, data-flow, scrub, marquee;
  show final states immediately. Centralize in a `useReducedMotion` hook + CSS media query.
- Corner registration ticks (small L-shaped marks) in page corners, drafting-sheet style.

## 5. Page Structure (`App.tsx`)

```
{isLoading && <LoadingScreen onComplete={() => setIsLoading(false)} />}
<Navbar />
<Hero />
<SelectedStructures />
<Capabilities />
<Log />
<Explorations />
<ContactFooter />
```

## 6. Components / Sections

### 6.1 LoadingScreen — "Compiling the structure"
- Full-screen `fixed inset-0 z-[9999] bg-bg .drafting-grid`.
- `requestAnimationFrame` counter 000→100 over ~2700ms.
- Top-left mono label `// COMPUTATIONAL STUDIO` (`text-xs text-muted uppercase tracking-[0.3em]`), animates `y:-20→0`, opacity 0→1.
- Center: mini isometric wireframe draws itself (stacked plates + nodes) via `stroke-dashoffset`. Below it a mono boot log cycling ~700ms: `RESOLVING GRID…`, `PLACING NODES…`, `LINKING SYSTEMS…`, `STRUCTURE STABLE`.
- Bottom-right counter: `font-display text-6xl md:text-8xl lg:text-9xl tabular-nums`, `String(count).padStart(3,"0")`.
- Bottom progress bar: `h-[3px]` track `hsl(var(--stroke))`; inner `.accent-gradient` `scaleX(count/100)`, `box-shadow: 0 0 8px rgba(99,212,194,0.4)`.
- At 100: 400ms delay → `onComplete()`; fade out, grid "snaps" into hero grid.
- Reduced motion: skip to 100 / call `onComplete` quickly, no draw animation.

### 6.2 Navbar (fixed, floats top-center)
- `fixed top-0 inset-x-0 z-50 flex justify-center pt-4 md:pt-6 px-4`.
- Inner pill: `inline-flex items-center rounded-full backdrop-blur-md border border-stroke bg-surface px-2 py-2`; gains `shadow-md shadow-black/20` when `scrollY > 100`.
- Left→right:
  1. Logo node `9×9` circle, `.accent-gradient` ring (rotation reverses on hover), inner `bg-bg` circle with `AT` (`font-display text-[13px]`), scales 110% on hover.
  2. Divider `w-px h-5 bg-stroke mx-1` (hidden on mobile).
  3. Nav links `["Index","Structures","Toolkit","Log","Contact"]` → hero top, SelectedStructures, Capabilities, Log, footer. `text-xs sm:text-sm font-mono uppercase tracking-wider rounded-full px-3 sm:px-4 py-1.5`. Active `text-text-primary bg-stroke`; inactive `text-muted hover:text-text-primary hover:bg-stroke`. (Active tracked via scroll position / IntersectionObserver.)
  4. Divider.
  5. "Say hi ↗" button — same sizing; hover shows `.accent-gradient` ring via absolute span (`inset:-2px`), inner wrapped `bg-surface rounded-full backdrop-blur-md`.
- Links smooth-scroll to anchors via Lenis.

### 6.3 Hero
Full-viewport, two-column asymmetric (text left, structure right). Stacks on mobile with structure on top.

**Left column (z-10):**
- Eyebrow `// INDUSTRIAL ENGINEERING AND ARTIFICIAL INTELLIGENCE @ NORTHWESTERN UNIVERSITY` — `font-mono text-xs text-accent uppercase tracking-[0.3em] mb-6`, class `blur-in`.
- Name `Alan Tai` — `font-display font-extrabold text-6xl md:text-8xl lg:text-9xl leading-[0.92] tracking-tight mb-5`, class `name-reveal`.
- Role line `A {role} building in Cupertino, California.` — roles cycle every 2s through `["Full-Stack Engineer","AI Systems Builder","Founder","Software Engineer"]`; role word `font-display text-accent animate-role-fade-in inline-block` with `key={roleIndex}`.
- Description `font-body text-sm md:text-base text-muted max-w-md mb-8`: "I design software the way an architect designs a building — load-bearing parts, clean joints, and a plan you can actually read."
- CTAs (`inline-flex gap-4`):
  - "See Structures" — solid `bg-text-primary text-bg`; hover `bg-bg text-text-primary` + `.accent-gradient` ring.
  - "Reach out ↗" — outlined `border-2 border-stroke bg-bg`; hover border-transparent + `.accent-gradient` ring.
  - Both `rounded-full font-mono text-sm px-7 py-3.5 hover:scale-105 transition`.

**Hero GSAP entrance:**
- `.name-reveal` opacity 0→1, `y 50→0`, 1.2s, delay 0.1s.
- `.blur-in` opacity 0→1, `filter blur(10px)→0`, `y 20→0`, 1s, stagger 0.1, delay 0.3s (eyebrow, description).

**Scroll indicator:** bottom-center `font-mono text-xs text-muted uppercase tracking-[0.2em]` "SCROLL" above `w-px h-10 bg-stroke` line with `.animate-scan` highlight.

### 6.4 StructureStage (hero right column, z-10)
Hand-authored isometric tower SVG (`viewBox ~ 0 0 540 600`, `overflow:visible`) that assembles on load and quietly "computes."

- **Plates:** ~5 isometric diamonds stacked bottom→top with gentle massing (varying width, slight x-offset). Path: `M cx,cy-ry L cx-rx,cy L cx,cy+ry L cx+rx,cy Z`.
- **Columns:** straight edges connecting corresponding corners of adjacent plates + a central spine.
- **Nodes:** `<circle>` at plate corners + apex; teal with `drop-shadow` glow.
- **Annotation leaders:** dashed teal lines from three nodes to mono labels `[ TOP ] AGENT LAYER`, `[ MID ] API · NODE`, `[ BASE ] DATA · PG`.
- **Data flow:** small teal `<circle>` traveling spine + one diagonal edge via `<animateMotion>` (loop).
- **Motion (GSAP `power3.out`):** plates+columns draw via `stroke-dashoffset` staggered bottom→top (~0.5s→2s); nodes scale/opacity pop after their plate lands; leaders+labels fade last (~2.4s). After load: nodes loop `node-pulse`, data dots loop.
- **Mouse parallax:** translate stage group by `mouseDelta * ~14px` + `scale(1.03)`. Disabled under reduced motion (also disables draw → show final state).

### 6.5 SelectedStructures (Works)
- `bg-bg py-16 md:py-24`; inner `max-w-[1200px] mx-auto px-6 md:px-10 lg:px-16`.
- Header (Framer Motion `whileInView`, opacity 0→1, y 30→0, 1s, `once`):
  - Eyebrow `w-8 h-px bg-stroke` + `Selected Structures` (`font-mono text-xs text-muted uppercase tracking-[0.3em]`).
  - Heading `Featured` + accent `structures` (`font-display text-accent`), `font-display text-4xl md:text-5xl`.
  - Subtext `font-body text-muted`: "Things I've designed and built, broken down to their load-bearing parts."
  - "View all →" button (desktop only, `.accent-gradient` hover ring) — links to GitHub profile.
- **Bento grid:** `grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6`; spans alternate `7 / 5 / 5 / 7`.
- **Each card (`ProjectCard`):** `bg-surface border border-stroke rounded-xl overflow-hidden group relative`.
  - Per-project hand-authored isometric glyph SVG (top-left), nodes `opacity-35` → `opacity-100`+glow on `group-hover`.
  - Project screenshot background (`object-cover group-hover:scale-105 transition`) **or** code placeholder when image absent.
  - Blueprint overlay: halftone `radial-gradient(circle, hsl(var(--line)) 1px, transparent 1px)` `4×4px`, `opacity-15 mix-blend-overlay`, plus drafting grid.
  - Default label: `font-mono text-xs text-muted` number + `font-display text-2xl` title.
  - Hover: `bg-bg/70 backdrop-blur-md` wash; `View — {Title}` pill with animated `.accent-gradient` border (title `font-display`), data pulse across glyph. Pill links to project URL.
  - Schedule footer: `font-mono text-[11px] text-muted` chips `STACK · {tech}` (accent the values).

**Projects (from `content.ts`):**
1. **STR. 001 — Architec** (span 7) · glyph: tall tower of stacked plates. AI energy audits for commercial buildings; OCR bill ingest, benchmark vs 5,000 federal records, report w/ upgrade recs + payback; Three.js + Mapbox solar/heat model; ElevenLabs voice walkthrough. STACK · Next.js · FastAPI · Three.js · scikit-learn · Gemini. LINK · **Devpost (placeholder `#`)**.
2. **STR. 002 — GreenChain** (span 5) · glyph: ring/globe of nodes linked by arcs. Supply-chain sustainability scoring; multi-agent swarm (Dedalus + Claude); XGBoost quantile emissions w/ uncertainty; Three.js globe + force-directed graph. STACK · Multi-agent · Claude · XGBoost · Three.js. LINK · **Devpost (placeholder `#`)**.
3. **STR. 003 — Prophis** (span 5) · glyph: branching timeline / node tree. Patient-context intelligence; React/TS patient timeline; County Health Rankings across 3,142 counties; similarity cohorts + Health Equity Context Score. STACK · React · TypeScript · Python. LINK · `https://at350-yhack2026.vercel.app/` · repo `https://github.com/at350/yhack2026`.
4. **STR. 004 — Legal LLM Benchmarking** (span 7) · glyph: grid of cells collapsing into clusters. LLM legal-reasoning benchmark (Thomson Reuters fellow); IRAC JSON, UMAP+HDBSCAN clustering, rubric LLM-as-judge ensembles; cut expert review 90%. STACK · Python · UMAP · HDBSCAN · LLM-as-judge. LINK · repo `https://github.com/at350/tr-benchmarking`.

### 6.6 Capabilities (Spec Sheet)
- `bg-bg py-16 md:py-24`. Header: eyebrow `Capabilities` + heading `The` + accent `toolkit`.
- Materials-schedule layout: labeled rows / fine-ruled grid (`font-mono`), grouped:
  - **LANGUAGES** — Python · TypeScript / JavaScript · Java · SQL · R
  - **ML & DATA** — PyTorch · scikit-learn · XGBoost · Pandas · NumPy · BeautifulSoup
  - **FRAMEWORKS** — React · Next.js · FastAPI · Three.js · Firebase · Postgres
  - **SYSTEMS** — Multi-agent / agentic engineering · model evaluation · API design · cloud deployment · Git
- Rows animate in on scroll (`whileInView`, stagger). Hairline `border-stroke` rules between rows; teal tick before each group.

### 6.7 Log (Writing — Substack)
- `bg-bg py-16 md:py-24`; inner `max-w-[1000px] mx-auto px-6 md:px-10 lg:px-16`. Same ruled-row motif as Capabilities.
- Header (`whileInView`): eyebrow `w-8 h-px bg-stroke` + `Log`; heading `Field` + accent `notes`; subtext "Working notes on building with AI agents, systems, and whatever I'm currently obsessed with."
- **Entry list** reads from `content.ts` log array. Each row `flex items-baseline justify-between gap-6 py-5 border-b border-stroke`, whole row an `<a target="_blank" rel="noopener">`:
  - Left: `font-mono text-xs text-muted` number (`N°01`) + `font-display text-xl md:text-2xl` title.
  - Right: `font-mono text-[11px] text-muted` `{date} · {readTime}` + `↗`.
  - Hover: `hover:bg-surface` tint, title → `text-accent`, teal underline/tick draws in, arrow nudges right.
  - Rows animate in `whileInView` stagger 0.08.
  - Footer link `Read more on Substack ↗`.
- **For now:** log array is empty → render quiet `Writing soon.` placeholder (and hide the footer link / show disabled). Structured so a future `posts.json` (build-time bake) populates the same array with `{ title, url, date, excerpt, readTime }`.

### 6.8 Explorations — Scroll-driven Structure
- `min-h-[300vh]` section.
- **Layer 1 (pinned, z-10):** `h-screen` block pinned via `ScrollTrigger.create({ pin: contentRef, pinSpacing:false })`. Eyebrow `Explorations`, heading `The` + accent `build`, subtext, `GitHub ↗` button.
- **Layer 2 (scrubbed, z-0):** large isometric megastructure / site-plan SVG behind text; GSAP timeline `scrub:true` advances build with scroll: foundation grid → columns rise → plates land → nodes light → data flows; reverses on scroll up. Parallax two sub-layers at different speeds.
- **Layer 3 (optional, z-20):** parallax detail tiles `aspect-square max-w-[320px]`, GSAP `y` + slight rotation, lightbox on click. *Skip initially unless detail imagery exists.*
- Reduced motion: render final assembled state, no scrub/pin scrub/parallax.

### 6.9 ContactFooter
- `bg-bg pt-16 md:pt-20 pb-8 overflow-hidden`; drafting grid stays.
- GSAP marquee `BUILDING STRUCTURES OUT OF CODE • ` ×~10, `font-display text-text-primary/10 text-[10vw]`, `xPercent:-50`, duration 40, `ease:"none"`, `repeat:-1`. (Static under reduced motion.)
- CTA: big email button → `mailto:alantai@u.northwestern.edu`, `.accent-gradient` hover ring.
- Footer bar: socials — GitHub `https://github.com/at350`, LinkedIn `https://www.linkedin.com/in/alan-tai-nu`, X/Twitter — mono links w/ hover underline; pulsing teal node + `Available for work`. Wordmark `ALAN TAI.` (teal period).

## 7. Data model (`src/data/content.ts`)

Typed single source of truth:
```ts
type Project = {
  id: string;            // "STR. 001"
  slug: string;          // "architec" → public/projects/architec.png
  title: string;
  span: 5 | 7;
  blurb: string;
  stack: string[];
  url: string;           // "#" placeholder allowed
  glyph: 'tower' | 'globe' | 'tree' | 'grid';
};
type CapabilityGroup = { label: string; items: string[] };
type LogEntry = { title: string; url: string; date: string; readTime: string; excerpt?: string };
type SocialLink = { label: string; url: string };
```
Exports: `projects`, `capabilities`, `logEntries` (empty for now), `socials`, plus hero
`roles` array.

## 8. Glyphs (`src/components/glyphs/`)
Four hand-authored isometric SVGs, distinct massing: `TowerGlyph` (stacked plates),
`GlobeGlyph` (node ring/arcs), `TreeGlyph` (branching timeline), `GridGlyph` (cells →
clusters). Each: thin teal strokes, nodes that animate `opacity-35 → 100` + glow on
parent `group-hover`.

## 9. Screenshots
Code-built placeholder per card (gradient + halftone + blueprint grid + glyph). When
`public/projects/<slug>.png` exists, the card uses it (lazy-loaded) and overlays the
blueprint treatment; otherwise the placeholder. Construct image src with
`import.meta.env.BASE_URL` so it works under the Pages base path.

## 10. Reduced motion
A `useReducedMotion()` hook gates all JS-driven motion (GSAP timelines, parallax,
marquee, data-flow, loading animation). A `@media (prefers-reduced-motion: reduce)`
block in `index.css` neutralizes CSS keyframe animations and shows final states.

## 11. Verification
- `tsc --noEmit` passes (strict).
- `vite build` succeeds with `base` set; output references resolve under the base path.
- Manual browser pass: loading→hero handoff, hero assembly + role cycle, nav active state
  + smooth scroll, bento hover states, Capabilities/Log reveals, Log placeholder, pinned
  Explorations scrub, footer marquee + mailto.
- Reduced-motion pass: final states render, no scrub/parallax/marquee/data-flow.
- Responsive pass: mobile stacking (hero structure on top), nav dividers hidden on mobile.

## 12. Out of scope (now)
- react-router-dom; Substack RSS fetching/bake; Vercel serverless + cron; real project
  screenshots; per-project AI-rendered 3D images; OG image (favicon = `AT` node glyph is
  in scope as a simple SVG). These can be layered in later without refactor.
