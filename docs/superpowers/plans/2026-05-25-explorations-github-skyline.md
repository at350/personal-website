# Explorations → Live GitHub Contribution Skyline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the decorative `Explorations` section with a lazy-loaded react-three-fiber 3D "skyline" of real GitHub contribution data (built at deploy time, refreshed daily), backed by a stats overlay and a 2D SVG fallback so it is never empty.

**Architecture:** A build-time Node script fetches the contribution calendar via GitHub GraphQL and writes `src/data/contributions.json`. Pure helpers in `src/lib/contributions.ts` (unit-tested) turn that JSON into a grid layout, per-day tower heights/colors, and headline stats. `Explorations.tsx` renders the section shell + stats, detects WebGL, and on scroll-into-view lazy-imports the Three.js scene (`Skyline.tsx` → `TowerField.tsx`); on reduced-motion it renders the scene without the rise animation/auto-rotate, and on no-WebGL / load failure it renders the 2D `ContributionHeatmap.tsx`.

**Tech Stack:** React 19 + Vite 8 + TypeScript, TailwindCSS 3.4, `three` + `@react-three/fiber` + `@react-three/drei`, Vitest (new, for helper tests), GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-05-25-explorations-github-skyline-design.md](../specs/2026-05-25-explorations-github-skyline-design.md)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/contributions.ts` | Types + pure helpers: `gridLayout`, `towerHeight`, `colorForCount`, `computeStats`. No React, no DOM. |
| `src/lib/contributions.test.ts` | Vitest unit tests for the helpers. |
| `src/lib/webgl.ts` | `supportsWebGL()` one-shot detector. |
| `src/data/contributions.json` | Baked contribution data (committed seed; overwritten in CI). |
| `scripts/fetch-github.mjs` | Build-time fetch (or synthetic seed) → writes `contributions.json`. |
| `src/components/skyline/ContributionHeatmap.tsx` | 2D SVG fallback heatmap. |
| `src/components/skyline/TowerField.tsx` | `InstancedMesh` of day-towers; assemble animation; hover pick. |
| `src/components/skyline/Skyline.tsx` | r3f `Canvas` + lights + `OrbitControls` + hover label; default export (lazy target). |
| `src/components/Explorations.tsx` | Rewritten section: header/copy, stats overlay, WebGL gate, IntersectionObserver, Suspense + error boundary, fallback wiring. |
| `.github/workflows/deploy.yml` | Add daily `schedule` cron + a fetch step using the `GH_READ_TOKEN` secret. |
| `package.json` | New deps + `test` and `fetch:github` scripts. |

---

## Task 1: Dependencies and scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime 3D deps**

Run:
```bash
npm install three @react-three/fiber @react-three/drei
```
Expected: added to `dependencies`. (As of writing: `three@^0.171`, `@react-three/fiber@^9`, `@react-three/drei@^10` — accept whatever npm resolves for React 19.)

- [ ] **Step 2: Install dev deps (types + test runner)**

Run:
```bash
npm install -D @types/three vitest
```
Expected: added to `devDependencies`.

- [ ] **Step 3: Add npm scripts**

In `package.json` `"scripts"`, add `test` and `fetch:github`:
```json
    "preview": "vite preview",
    "test": "vitest run",
    "fetch:github": "node scripts/fetch-github.mjs"
```

- [ ] **Step 4: Verify install**

Run: `npm run typecheck`
Expected: PASS (no usage yet; just confirms deps installed cleanly).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add three/r3f/drei + vitest for skyline section"
```

---

## Task 2: Contribution data types + pure helpers (TDD)

**Files:**
- Create: `src/lib/contributions.ts`
- Test: `src/lib/contributions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/contributions.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  gridLayout,
  towerHeight,
  colorForCount,
  computeStats,
  type ContributionDay,
} from './contributions'

// Helper: build N chronological days starting on a known Sunday (2024-01-07 is a Sunday).
function days(counts: number[]): ContributionDay[] {
  const start = new Date('2024-01-07T00:00:00Z') // Sunday
  return counts.map((count, i) => {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    return { date: d.toISOString().slice(0, 10), count }
  })
}

describe('gridLayout', () => {
  it('places the first day at its UTC weekday row, column 0', () => {
    const out = gridLayout(days([1])) // 2024-01-07 = Sunday = row 0
    expect(out[0]).toMatchObject({ row: 0, col: 0 })
  })

  it('wraps to the next column after 7 days', () => {
    const out = gridLayout(days([1, 1, 1, 1, 1, 1, 1, 1])) // 8 days
    expect(out[6]).toMatchObject({ row: 6, col: 0 }) // Saturday
    expect(out[7]).toMatchObject({ row: 0, col: 1 }) // next Sunday
  })

  it('offsets a mid-week start into the correct row', () => {
    // 2024-01-10 is a Wednesday (weekday 3)
    const mid = [{ date: '2024-01-10', count: 2 }]
    expect(gridLayout(mid)[0]).toMatchObject({ row: 3, col: 0 })
  })
})

describe('towerHeight', () => {
  it('returns the minimum for zero contributions', () => {
    expect(towerHeight(0, 10)).toBeCloseTo(0.15)
  })
  it('returns the max for the busiest day', () => {
    expect(towerHeight(10, 10)).toBeCloseTo(6)
  })
  it('is monotonic in count', () => {
    expect(towerHeight(2, 10)).toBeLessThan(towerHeight(8, 10))
  })
  it('handles maxCount of 0 without NaN', () => {
    expect(Number.isFinite(towerHeight(0, 0))).toBe(true)
  })
})

describe('colorForCount', () => {
  it('returns a hex string', () => {
    expect(colorForCount(5, 10)).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it('brightens with count', () => {
    expect(colorForCount(0, 10)).not.toBe(colorForCount(10, 10))
  })
})

describe('computeStats', () => {
  it('sums total, finds busiest day, and max count', () => {
    const s = computeStats(days([1, 0, 5, 2]), 8)
    expect(s.total).toBe(8)
    expect(s.maxCount).toBe(5)
    expect(s.busiestDay.count).toBe(5)
  })
  it('counts the current streak from the end, tolerating an empty final day', () => {
    // ...,3,4,0  → today (0) skipped, streak = 2 (the 3 and 4)
    expect(computeStats(days([0, 3, 4, 0]), 7).currentStreak).toBe(2)
  })
  it('counts a streak that includes a non-empty final day', () => {
    expect(computeStats(days([0, 3, 4, 5]), 12).currentStreak).toBe(3)
  })
  it('returns zeroed stats for an empty calendar', () => {
    const s = computeStats([], 0)
    expect(s).toMatchObject({ total: 0, maxCount: 0, currentStreak: 0 })
    expect(s.busiestDay.count).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — `Cannot find module './contributions'` / exports undefined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/contributions.ts`:
```ts
export interface ContributionDay {
  date: string // YYYY-MM-DD
  count: number
}

export interface ContributionData {
  generatedAt: string
  login: string
  totalContributions: number
  days: ContributionDay[] // chronological
}

export interface LaidOutDay extends ContributionDay {
  col: number // week index (x)
  row: number // weekday 0=Sun..6=Sat (z)
}

export interface Stats {
  total: number
  maxCount: number
  currentStreak: number
  busiestDay: ContributionDay
}

const MIN_H = 0.15
const MAX_H = 6

/** Assign each chronological day a (col=week, row=weekday) cell, GitHub-style. */
export function gridLayout(days: ContributionDay[]): LaidOutDay[] {
  if (days.length === 0) return []
  const firstWeekday = new Date(days[0].date + 'T00:00:00Z').getUTCDay()
  return days.map((d, i) => {
    const idx = i + firstWeekday
    return { ...d, col: Math.floor(idx / 7), row: idx % 7 }
  })
}

/** Compressed (sqrt) height in world units; 0 → MIN_H, maxCount → MAX_H. */
export function towerHeight(count: number, maxCount: number): number {
  if (maxCount <= 0 || count <= 0) return MIN_H
  const t = Math.sqrt(count / maxCount)
  return MIN_H + t * (MAX_H - MIN_H)
}

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t)
}
function hex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

// Dim teal → bright accent (#63d4c2). Empty days stay near the floor color.
const LOW: [number, number, number] = [27, 59, 56]
const HIGH: [number, number, number] = [99, 212, 194]

/** Interpolate the teal ramp by perceptual sqrt of intensity. */
export function colorForCount(count: number, maxCount: number): string {
  const t = maxCount > 0 ? Math.sqrt(Math.min(count, maxCount) / maxCount) : 0
  return hex(lerp(LOW[0], HIGH[0], t), lerp(LOW[1], HIGH[1], t), lerp(LOW[2], HIGH[2], t))
}

/** Headline stats. `total` defaults to the API total when provided, else the sum. */
export function computeStats(days: ContributionDay[], total?: number): Stats {
  if (days.length === 0) {
    return { total: total ?? 0, maxCount: 0, currentStreak: 0, busiestDay: { date: '', count: 0 } }
  }
  let maxCount = 0
  let busiestDay = days[0]
  let sum = 0
  for (const d of days) {
    sum += d.count
    if (d.count > maxCount) {
      maxCount = d.count
      busiestDay = d
    }
  }
  // Current streak: count consecutive >0 from the end, allowing today (last) to be empty.
  let streak = 0
  let i = days.length - 1
  if (days[i].count === 0) i--
  for (; i >= 0 && days[i].count > 0; i--) streak++

  return { total: total ?? sum, maxCount, currentStreak: streak, busiestDay }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contributions.ts src/lib/contributions.test.ts
git commit -m "feat: contribution data helpers (layout, height, color, stats) + tests"
```

---

## Task 3: Build-time fetch / seed script + seed data

**Files:**
- Create: `scripts/fetch-github.mjs`
- Create: `src/data/contributions.json` (generated by the script)
- Verify: `tsconfig.app.json` has `resolveJsonModule`

- [ ] **Step 1: Write the fetch/seed script**

Create `scripts/fetch-github.mjs`:
```js
// Fetches the GitHub contribution calendar via GraphQL and writes src/data/contributions.json.
// - With GH_READ_TOKEN: fetch real data; on failure, leave any existing file untouched.
// - Without a token: keep an existing file, or generate a synthetic year so dev/build works.
import { writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const LOGIN = 'at350'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'contributions.json')
const token = process.env.GH_READ_TOKEN

const QUERY = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date contributionCount } }
      }
    }
  }
}`

async function fetchReal() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  })
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}: ${await res.text()}`)
  const json = await res.json()
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`)
  const cal = json.data.user.contributionsCollection.contributionCalendar
  const daysList = cal.weeks.flatMap((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })),
  )
  return { totalContributions: cal.totalContributions, days: daysList }
}

function synthetic() {
  const days = []
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - 370)
  let total = 0
  for (let i = 0; i < 371; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const wd = d.getUTCDay()
    // weekdays busier than weekends; frequent zeros
    const base = wd === 0 || wd === 6 ? 0.5 : 1.6
    const count = Math.random() < 0.32 ? 0 : Math.max(0, Math.round((Math.random() ** 1.7) * 12 * base))
    total += count
    days.push({ date: d.toISOString().slice(0, 10), count })
  }
  return { totalContributions: total, days }
}

async function fileExists(p) {
  try { await readFile(p); return true } catch { return false }
}

async function main() {
  let payload
  if (token) {
    try {
      payload = await fetchReal()
      console.log(`[fetch-github] fetched ${payload.days.length} days (${payload.totalContributions} contributions)`)
    } catch (err) {
      console.warn(`[fetch-github] fetch failed, keeping existing file: ${err.message}`)
      if (await fileExists(OUT)) return
      payload = synthetic()
      console.warn('[fetch-github] no existing file; wrote synthetic seed')
    }
  } else if (await fileExists(OUT)) {
    console.log('[fetch-github] no token; keeping existing contributions.json')
    return
  } else {
    payload = synthetic()
    console.log('[fetch-github] no token; wrote synthetic seed')
  }

  const out = { generatedAt: new Date().toISOString(), login: LOGIN, ...payload }
  await writeFile(OUT, JSON.stringify(out) + '\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Generate the committed seed**

Run: `npm run fetch:github`
Expected: prints "wrote synthetic seed" and creates `src/data/contributions.json` (~371 days).
(Optional: if you export a real token first — `GH_READ_TOKEN=ghp_… npm run fetch:github` — it writes real data instead. Either is fine to commit.)

- [ ] **Step 3: Ensure JSON imports typecheck**

Run: `grep -n "resolveJsonModule" tsconfig.app.json tsconfig.json 2>/dev/null`
Expected: a line `"resolveJsonModule": true`. If absent, add it under `compilerOptions` in `tsconfig.app.json`:
```json
    "resolveJsonModule": true,
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-github.mjs src/data/contributions.json tsconfig.app.json
git commit -m "feat: build-time GitHub contribution fetch + seed data"
```

---

## Task 4: 2D SVG fallback heatmap

**Files:**
- Create: `src/components/skyline/ContributionHeatmap.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/skyline/ContributionHeatmap.tsx`:
```tsx
import { gridLayout, colorForCount, type ContributionData } from '../../lib/contributions'

const CELL = 11
const GAP = 3

export default function ContributionHeatmap({ data }: { data: ContributionData }) {
  const laid = gridLayout(data.days)
  const maxCount = laid.reduce((m, d) => Math.max(m, d.count), 0)
  const cols = laid.reduce((m, d) => Math.max(m, d.col), 0) + 1
  const width = cols * (CELL + GAP)
  const height = 7 * (CELL + GAP)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      role="img"
      aria-label={`GitHub contribution graph: ${data.totalContributions} contributions in the last year`}
    >
      {laid.map((d) => (
        <rect
          key={d.date}
          x={d.col * (CELL + GAP)}
          y={d.row * (CELL + GAP)}
          width={CELL}
          height={CELL}
          rx={2}
          fill={d.count === 0 ? 'hsl(var(--surface))' : colorForCount(d.count, maxCount)}
        >
          <title>{`${d.date}: ${d.count} contribution${d.count === 1 ? '' : 's'}`}</title>
        </rect>
      ))}
    </svg>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/skyline/ContributionHeatmap.tsx
git commit -m "feat: 2D SVG contribution heatmap fallback"
```

---

## Task 5: WebGL detector

**Files:**
- Create: `src/lib/webgl.ts`

- [ ] **Step 1: Implement**

Create `src/lib/webgl.ts`:
```ts
let cached: boolean | null = null

/** True if the browser can create a WebGL context. Memoized. */
export function supportsWebGL(): boolean {
  if (cached !== null) return cached
  if (typeof window === 'undefined') return (cached = false)
  try {
    const canvas = document.createElement('canvas')
    cached = !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    )
  } catch {
    cached = false
  }
  return cached
}
```

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck` (Expected: PASS)
```bash
git add src/lib/webgl.ts
git commit -m "feat: WebGL support detector"
```

---

## Task 6: 3D tower field

**Files:**
- Create: `src/components/skyline/TowerField.tsx`

- [ ] **Step 1: Implement the instanced tower field**

Create `src/components/skyline/TowerField.tsx`:
```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  gridLayout,
  towerHeight,
  colorForCount,
  type ContributionData,
  type LaidOutDay,
} from '../../lib/contributions'

const SPACING = 1.15
const RISE_PER_COL = 0.012 // stagger: later weeks rise slightly later

export interface HoverInfo {
  date: string
  count: number
}

interface Props {
  data: ContributionData
  animate: boolean
  onHover: (info: HoverInfo | null) => void
}

export default function TowerField({ data, animate, onHover }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const [hovered, setHovered] = useState<number | null>(null)

  const laid: LaidOutDay[] = useMemo(() => gridLayout(data.days), [data.days])
  const maxCount = useMemo(() => laid.reduce((m, d) => Math.max(m, d.count), 0), [laid])
  const cols = useMemo(() => laid.reduce((m, d) => Math.max(m, d.col), 0) + 1, [laid])

  const targets = useMemo(
    () => laid.map((d) => towerHeight(d.count, maxCount)),
    [laid, maxCount],
  )
  const colors = useMemo(
    () => laid.map((d) => new THREE.Color(d.count === 0 ? '#21303a' : colorForCount(d.count, maxCount))),
    [laid, maxCount],
  )

  // progress 0→1 drives the assemble sweep; jump to 1 when not animating
  const progress = useRef(animate ? 0 : 1)
  useEffect(() => {
    progress.current = animate ? 0 : 1
  }, [animate])

  // set instance colors once
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    colors.forEach((c, i) => mesh.setColorAt(i, c))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [colors])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    if (progress.current < 1) progress.current = Math.min(1, progress.current + delta * 0.6)
    const p = progress.current
    const offsetX = (cols * SPACING) / 2
    for (let i = 0; i < laid.length; i++) {
      const d = laid[i]
      const local = Math.min(1, Math.max(0, (p - d.col * RISE_PER_COL) / (1 - d.col * RISE_PER_COL || 1)))
      const eased = 1 - Math.pow(1 - local, 3)
      const h = Math.max(0.001, targets[i] * eased) + (hovered === i ? 0.6 : 0)
      dummy.position.set(d.col * SPACING - offsetX, h / 2, (d.row - 3) * SPACING)
      dummy.scale.set(0.85, h, 0.85)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, laid.length]}
      onPointerMove={(e) => {
        e.stopPropagation()
        const id = e.instanceId ?? null
        if (id !== hovered) {
          setHovered(id)
          onHover(id === null ? null : { date: laid[id].date, count: laid[id].count })
        }
      }}
      onPointerOut={() => {
        setHovered(null)
        onHover(null)
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.45} metalness={0.1} />
    </instancedMesh>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/skyline/TowerField.tsx
git commit -m "feat: instanced 3D tower field with assemble + hover"
```

---

## Task 7: Skyline scene (Canvas)

**Files:**
- Create: `src/components/skyline/Skyline.tsx`

- [ ] **Step 1: Implement the scene**

Create `src/components/skyline/Skyline.tsx`:
```tsx
import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import TowerField, { type HoverInfo } from './TowerField'
import type { ContributionData } from '../../lib/contributions'

interface Props {
  data: ContributionData
  reduced: boolean
}

// Default export so it can be lazy-imported.
export default function Skyline({ data, reduced }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null)

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [14, 11, 18], fov: 38 }}
        gl={{ alpha: true, antialias: true }}
        aria-hidden="true"
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 16, 10]} intensity={1.1} />
        <directionalLight position={[-10, 6, -8]} intensity={0.3} color="#63d4c2" />
        <fog attach="fog" args={['#13181d', 28, 60]} />
        <group position={[0, -0.5, 0]}>
          <TowerField data={data} animate={!reduced} onHover={setHover} />
        </group>
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate={!reduced}
          autoRotateSpeed={0.45}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.2}
          target={[0, 0, 0]}
        />
      </Canvas>

      {/* hover readout (DOM, not in the 3D scene) */}
      <div
        className="pointer-events-none absolute left-4 top-4 font-mono text-xs text-muted transition-opacity"
        style={{ opacity: hover ? 1 : 0 }}
      >
        {hover && (
          <span className="rounded-md border border-stroke bg-surface/80 px-2 py-1 backdrop-blur">
            <span className="text-text-primary">{hover.count}</span> contribution
            {hover.count === 1 ? '' : 's'} · {hover.date}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/skyline/Skyline.tsx
git commit -m "feat: r3f skyline scene (canvas, lights, orbit, hover readout)"
```

---

## Task 8: Rewrite the Explorations section

**Files:**
- Modify (full rewrite): `src/components/Explorations.tsx`

This replaces the GSAP/SVG implementation entirely. It: reads the baked JSON, computes stats, renders the header + copy + stats overlay, gates the 3D import behind an IntersectionObserver, falls back to the 2D heatmap when WebGL is unavailable or the 3D chunk fails to load (error boundary), and respects reduced-motion (passes `reduced` into the scene to disable rise + auto-rotate).

- [ ] **Step 1: Write the component**

Replace the entire contents of `src/components/Explorations.tsx` with:
```tsx
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import contributionsJson from '../data/contributions.json'
import { computeStats, type ContributionData } from '../lib/contributions'
import { supportsWebGL } from '../lib/webgl'
import { useReducedMotion } from '../lib/useReducedMotion'
import ContributionHeatmap from './skyline/ContributionHeatmap'
import { GITHUB_PROFILE } from '../data/content'

const data = contributionsJson as ContributionData
const Skyline = lazy(() => import('./skyline/Skyline'))

// Error boundary: if the 3D chunk fails to load/render, show the 2D heatmap.
class SkylineBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl text-text-primary md:text-3xl">{value}</div>
      <div className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">{label}</div>
    </div>
  )
}

export default function Explorations() {
  const reduced = useReducedMotion()
  const gateRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const webgl = supportsWebGL()

  const stats = computeStats(data.days, data.totalContributions)

  useEffect(() => {
    if (!webgl || inView) return
    const el = gateRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [webgl, inView])

  const heatmap = (
    <div className="mx-auto h-full max-h-[260px] w-full max-w-[760px] place-self-center">
      <ContributionHeatmap data={data} />
    </div>
  )

  return (
    <section id="explorations" className="bg-bg py-16 md:py-24">
      <div className="mx-auto max-w-[1100px] px-6 md:px-10 lg:px-16">
        <div className="mb-4 flex items-center gap-3">
          <span className="h-px w-8 bg-stroke" />
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted">Explorations</span>
        </div>
        <h2 className="font-display text-4xl md:text-5xl">
          The <span className="text-accent">build</span>
        </h2>
        <p className="mt-4 max-w-md font-body text-muted">
          Every tower is a day I shipped — {stats.total.toLocaleString()} contributions over the last year.
          {webgl ? ' Drag to orbit.' : ''}
        </p>

        {/* visualization */}
        <div
          ref={gateRef}
          className="relative mt-10 grid h-[58vh] min-h-[360px] w-full place-items-stretch overflow-hidden rounded-xl border border-stroke"
        >
          {!webgl ? (
            heatmap
          ) : inView ? (
            <SkylineBoundary fallback={heatmap}>
              <Suspense fallback={null}>
                <Skyline data={data} reduced={reduced} />
              </Suspense>
            </SkylineBoundary>
          ) : null}
        </div>

        {/* stats overlay + CTA */}
        <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-wrap gap-8">
            <Stat value={stats.total.toLocaleString()} label="Contributions / yr" />
            <Stat value={`${stats.currentStreak} d`} label="Current streak" />
            <Stat
              value={`${stats.busiestDay.count}`}
              label={`Busiest day${stats.busiestDay.date ? ` · ${stats.busiestDay.date}` : ''}`}
            />
          </div>
          <a
            href={GITHUB_PROFILE}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-block rounded-full border border-stroke px-6 py-3 font-mono text-sm"
          >
            <span className="gradient-ring absolute -inset-[2px] rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
            <span className="relative">GitHub ↗</span>
          </a>
        </div>

        {/* screen-reader summary (canvas is aria-hidden) */}
        <p className="sr-only">
          GitHub contributions in the last year: {stats.total} total, current streak {stats.currentStreak} days,
          busiest day {stats.busiestDay.date} with {stats.busiestDay.count} contributions.
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add the `sr-only` utility if missing**

Run: `grep -rn "sr-only" src/index.css tailwind.config.ts`
Expected: a match (Tailwind ships `sr-only` by default with the base/utilities, so this should resolve). If `sr-only` is somehow purged/unavailable, add to `src/index.css`:
```css
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
```

- [ ] **Step 3: Verify build + types**

Run: `npm run typecheck && npm run build`
Expected: PASS. In the build output, confirm a **separate chunk** for the Skyline/three code (e.g. a `Skyline-*.js` chunk distinct from the main entry), proving the lazy split works.

- [ ] **Step 4: Commit**

```bash
git add src/components/Explorations.tsx src/index.css
git commit -m "feat: rewrite Explorations as lazy 3D contribution skyline + stats + fallback"
```

---

## Task 9: CI — daily refresh + fetch step

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add the daily schedule trigger**

In `.github/workflows/deploy.yml`, change the `on:` block to add a cron (06:00 UTC daily):
```yaml
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
```

- [ ] **Step 2: Add the fetch step before build**

In the `build` job `steps:`, insert the fetch step between `npm ci` and `npm run build`:
```yaml
      - run: npm ci
      - run: node scripts/fetch-github.mjs
        env:
          GH_READ_TOKEN: ${{ secrets.GH_READ_TOKEN }}
      - run: npm run build
```

- [ ] **Step 3: Verify YAML locally**

Run: `node -e "require('node:fs').readFileSync('.github/workflows/deploy.yml','utf8')" && echo "readable"`
Expected: prints `readable`. (Visual check: the fetch step sits before `npm run build`; the `schedule` block is under `on:`.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: daily contribution refresh + GraphQL fetch step (GH_READ_TOKEN)"
```

---

## Task 10: Live verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server / preview** and load the page. Scroll to the Explorations section.

- [ ] **Step 2: Confirm console + network are clean** — no Three.js/runtime errors; the Skyline chunk only loads when the section nears the viewport.

- [ ] **Step 3: Confirm behavior:**
  - Towers rise in a sweep on first scroll-into-view.
  - Drag orbits; the field auto-rotates when idle and stops on interaction.
  - Hovering a tower shows the date + count readout and lifts the tower.
  - Stats row shows total / streak / busiest day.

- [ ] **Step 4: Responsive + reduced-motion:**
  - Resize to mobile width — canvas still renders, stats wrap, no overflow.
  - Emulate `prefers-reduced-motion: reduce` — no rise/auto-rotate; scene renders at final state (still orbitable). Verify the `sr-only` summary text is present.

- [ ] **Step 5: Fallback path:** temporarily force `supportsWebGL()` to return `false` (or test in a no-WebGL context) and confirm the 2D heatmap renders in place with the same data. Revert.

- [ ] **Step 6: Capture a screenshot** of the working skyline to share as proof.

- [ ] **Step 7: Final tidy commit** (only if Step 1–6 surfaced fixes).

---

## Self-Review (completed during planning)

- **Spec coverage:** concept (Tasks 6–8), data + daily freshness + failure safety (Tasks 3, 9), lazy r3f rendering + instancing + orbit/no-zoom + hover (Tasks 6–8), stats overlay (Task 8), layout change / drop 300vh (Task 8), reduced-motion + no-WebGL + load-failure fallbacks (Tasks 4, 5, 8), accessibility `aria-hidden`/`sr-only` (Task 8), file structure (all). ✓
- **Placeholder scan:** every code step contains complete code; no TBD/TODO in requirements. ✓
- **Type consistency:** `ContributionData`/`ContributionDay`/`LaidOutDay`/`Stats`/`HoverInfo` and `gridLayout`/`towerHeight`/`colorForCount`/`computeStats`/`supportsWebGL` names are used identically across Tasks 2–8. `computeStats(days, total)` signature matches all call sites. ✓
- **Note vs spec:** spec left pinch-zoom as a maybe; this plan disables all zoom (`enableZoom={false}`) to guarantee no scroll-hijack — orbit-only. Reduced-motion keeps the spec's "final state, still orbitable" behavior.
```
