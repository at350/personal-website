import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { useReducedMotion } from '../lib/useReducedMotion'

/* ------------------------------------------------------------------ *
 * Isometric "data tower": a vertically-aligned stack of extruded glass
 * slabs that taper to a glowing apex, joined by slim pillars. True 2:1
 * isometric projection so every floor reads as the same clean object.
 * ------------------------------------------------------------------ */

const ISO = Math.cos(Math.PI / 6) // ≈ 0.866
const CX = 256 // structure centre x (shifted slightly left to leave room for labels)
const CY = 360 // structure centre y
const T = 15 // slab thickness (extrusion depth)
const APEX_RISE = 48 // antenna height above the top slab

type Pt = { x: number; y: number }

// project a 3-D point (x east, y up, z south) into the 2-D isometric plane
const iso = (x: number, y: number, z: number): Pt => ({
  x: CX + (x - z) * ISO,
  y: CY + (x + z) * 0.5 - y,
})

// base → top: half-extent shrinks for a clean ziggurat taper, height climbs evenly
const FLOORS = [
  { s: 110, y: 0 },
  { s: 92, y: 72 },
  { s: 74, y: 144 },
  { s: 56, y: 216 },
]
const TOP = FLOORS.length - 1

type Corners = Record<'back' | 'right' | 'front' | 'left', Pt>
const cornersAt = (s: number, y: number): Corners => ({
  back: iso(-s, y, -s),
  right: iso(s, y, -s),
  front: iso(s, y, s),
  left: iso(-s, y, s),
})

const fmt = (p: Pt) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`
const polygon = (...ps: Pt[]) => `M${ps.map(fmt).join('L')}Z`

interface FloorGeometry {
  topFace: string
  rightFace: string
  leftFace: string
  top: Corners
  accent: boolean
}

const floors: FloorGeometry[] = FLOORS.map((f, i) => {
  const top = cornersAt(f.s, f.y)
  const bot = cornersAt(f.s, f.y - T)
  return {
    topFace: polygon(top.back, top.right, top.front, top.left),
    rightFace: polygon(top.right, top.front, bot.front, bot.right),
    leftFace: polygon(top.left, top.front, bot.front, bot.left),
    top,
    accent: i === TOP,
  }
})

// slim pillars sitting in the gap between each pair of slabs
const STRUT_KEYS: (keyof Corners)[] = ['back', 'right', 'front', 'left']
const struts: { d: string; back: boolean }[] = []
for (let i = 0; i < TOP; i++) {
  const lowTop = cornersAt(FLOORS[i].s, FLOORS[i].y)
  const highBot = cornersAt(FLOORS[i + 1].s, FLOORS[i + 1].y - T)
  for (const k of STRUT_KEYS) {
    struts.push({ d: `M${fmt(lowTop[k])}L${fmt(highBot[k])}`, back: k === 'back' })
  }
}

const apex = iso(0, FLOORS[TOP].y + APEX_RISE, 0)
const topCentre = iso(0, FLOORS[TOP].y, 0)
const baseCentre = iso(0, FLOORS[0].y, 0)

// glowing nodes: the apex crown + the four corners of the top slab only
const topCorners = Object.values(floors[TOP].top)

// annotation leaders → short labels on the right, one per layer
const annotations = [
  { from: floors[TOP].top.right, label: 'AGENTS' },
  { from: floors[1].top.right, label: 'API' },
  { from: floors[0].top.right, label: 'DATA' },
].map((a) => ({ ...a, endX: a.from.x + 46 }))

// rising data path (central spine, base → apex)
const spinePath = `M${fmt(baseCentre)}L${fmt(apex)}`

export default function StructureStage() {
  const reduced = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<SVGGElement>(null)

  // assembly on load: slabs stack bottom→top, pillars draw, nodes pop, labels fade
  useEffect(() => {
    if (reduced) return
    const ctx = gsap.context(() => {
      // pillars draw via stroke-dashoffset — set dash arrays BEFORE the timeline reads them
      groupRef.current?.querySelectorAll<SVGPathElement>('.ss-strut, .ss-apex-line').forEach((el) => {
        const len = el.getTotalLength()
        el.style.strokeDasharray = String(len)
        el.style.strokeDashoffset = String(len)
      })

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.from('.ss-floor', { y: 36, opacity: 0, duration: 0.7, stagger: 0.16 }, 0.2)
        .to('.ss-strut', { strokeDashoffset: 0, duration: 0.5, stagger: 0.04 }, '-=0.9')
        .to('.ss-apex-line', { strokeDashoffset: 0, duration: 0.4 }, '-=0.2')
        .fromTo(
          '.ss-node',
          { scale: 0, opacity: 0, transformOrigin: 'center' },
          { scale: 1, opacity: 1, duration: 0.4, stagger: 0.06 },
          '-=0.3',
        )
        .fromTo('.ss-anno', { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: 0.1 }, '-=0.1')
    }, groupRef)
    return () => ctx.revert()
  }, [reduced])

  // subtle mouse parallax for depth
  useEffect(() => {
    if (reduced) return
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX / window.innerWidth - 0.5
      const dy = e.clientY / window.innerHeight - 0.5
      gsap.to(groupRef.current, { x: dx * 16, y: dy * 12, duration: 0.7, ease: 'power2.out' })
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      gsap.killTweensOf(groupRef.current)
    }
  }, [reduced])

  return (
    <div ref={rootRef} className="relative w-full">
      <svg viewBox="0 0 540 600" aria-hidden="true" className="w-full overflow-visible">
        <defs>
          <linearGradient id="ss-top" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent) / 0.22)" />
            <stop offset="100%" stopColor="hsl(var(--accent) / 0.05)" />
          </linearGradient>
          <filter id="ss-glow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g ref={groupRef}>
          {/* pillars (behind the slabs) */}
          {struts.map((s, i) => (
            <path
              key={`strut-${i}`}
              className="ss-strut"
              d={s.d}
              fill="none"
              stroke={s.back ? 'hsl(var(--line) / 0.22)' : 'hsl(var(--line) / 0.5)'}
              strokeWidth="1"
            />
          ))}

          {/* central spine + rising data dots */}
          <path className="ss-strut" d={spinePath} fill="none" stroke="hsl(var(--accent) / 0.28)" strokeWidth="1" />
          {!reduced && (
            <>
              <circle r="3" fill="hsl(var(--accent))" filter="url(#ss-glow)">
                <animateMotion dur="3.4s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" path={spinePath} />
              </circle>
              <circle r="2" fill="hsl(var(--accent))" opacity="0.7">
                <animateMotion dur="3.4s" begin="1.7s" repeatCount="indefinite" path={spinePath} />
              </circle>
            </>
          )}

          {/* slabs: shaded sides + lit top, base → top */}
          {floors.map((f, i) => (
            <g className="ss-floor" key={`floor-${i}`}>
              <path d={f.leftFace} fill="hsl(213 16% 12% / 0.85)" stroke="hsl(var(--line) / 0.45)" strokeWidth="1" />
              <path d={f.rightFace} fill="hsl(216 17% 7% / 0.9)" stroke="hsl(var(--line) / 0.3)" strokeWidth="1" />
              <path
                d={f.topFace}
                fill="url(#ss-top)"
                stroke={f.accent ? 'hsl(var(--accent) / 0.85)' : 'hsl(var(--line) / 0.7)'}
                strokeWidth={f.accent ? 1.5 : 1.25}
              />
            </g>
          ))}

          {/* apex antenna + crown node */}
          <path
            className="ss-apex-line"
            d={`M${fmt(topCentre)}L${fmt(apex)}`}
            fill="none"
            stroke="hsl(var(--accent) / 0.6)"
            strokeWidth="1.25"
          />

          {/* nodes: top-slab corners + apex crown (few, tight glow) */}
          {topCorners.map((c, i) => (
            <circle
              key={`node-${i}`}
              className="ss-node animate-node-pulse"
              cx={c.x}
              cy={c.y}
              r="3.4"
              fill="hsl(var(--accent))"
              filter="url(#ss-glow)"
            />
          ))}
          <circle className="ss-node" cx={apex.x} cy={apex.y} r="5" fill="hsl(var(--accent))" filter="url(#ss-glow)" />

          {/* annotation leaders + labels */}
          {annotations.map((a, i) => (
            <g className="ss-anno" key={`anno-${i}`}>
              <line
                x1={a.from.x}
                y1={a.from.y}
                x2={a.endX}
                y2={a.from.y}
                stroke="hsl(var(--accent) / 0.55)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <circle cx={a.from.x} cy={a.from.y} r="1.6" fill="hsl(var(--accent))" />
              <text
                x={a.endX + 6}
                y={a.from.y + 3.5}
                className="font-mono"
                fontSize="10.5"
                letterSpacing="1.5"
                fill="hsl(var(--muted))"
              >
                {a.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
