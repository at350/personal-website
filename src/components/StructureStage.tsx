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
        { strokeDashoffset: (_i, el) => (el as SVGPathElement).getTotalLength() },
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
