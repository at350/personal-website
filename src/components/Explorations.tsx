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
      // set draw dash arrays first, then build the scrubbed timeline
      svgRef.current?.querySelectorAll<SVGPathElement>('.ex-draw').forEach((el) => {
        const len = el.getTotalLength()
        el.style.strokeDasharray = String(len)
        el.style.strokeDashoffset = String(len)
      })

      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top top',
        end: 'bottom bottom',
        pin: contentRef.current,
        pinSpacing: false,
      })

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
        },
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
        <svg
          ref={svgRef}
          viewBox="0 0 800 600"
          aria-hidden="true"
          className="h-screen w-full max-w-[1100px] overflow-visible"
        >
          {/* foundation grid */}
          <path
            className="ex-draw ex-foundation"
            d="M150,460 L400,360 L650,460 L400,560 Z"
            fill="none"
            stroke="hsl(var(--line)/0.4)"
            strokeWidth="1"
          />
          {/* columns */}
          {([[250, 420], [400, 360], [550, 420], [400, 500]] as [number, number][]).map(([x, y], i) => (
            <path
              key={i}
              className="ex-draw ex-column"
              d={`M${x},${y} L${x},${y - 140}`}
              fill="none"
              stroke="hsl(var(--line)/0.55)"
              strokeWidth="1"
            />
          ))}
          {/* plates */}
          {([300, 200] as number[]).map((cy, i) => (
            <path
              key={i}
              className="ex-draw ex-plate"
              d={`M400,${cy - 60} L${400 - 160 + i * 30},${cy} L400,${cy + 60} L${400 + 160 - i * 30},${cy} Z`}
              fill="none"
              stroke="hsl(var(--accent)/0.7)"
              strokeWidth="1.25"
            />
          ))}
          {/* nodes — no opacity:0 baseline so they show in reduced-motion final state */}
          {([[250, 280], [550, 280], [400, 140], [400, 360]] as [number, number][]).map(([x, y], i) => (
            <circle
              key={i}
              className="ex-node"
              cx={x}
              cy={y}
              r="5"
              fill="hsl(var(--accent))"
              style={{ filter: 'drop-shadow(0 0 6px hsl(var(--accent)))' }}
            />
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
          <h2 className="font-display text-5xl md:text-7xl">
            The <span className="text-accent">build</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md font-body text-muted">
            Scroll to watch a structure assemble — foundation, columns, plates, then the nodes light up and start computing.
          </p>
          <a
            href={GITHUB_PROFILE}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative mt-8 inline-block rounded-full border border-stroke px-6 py-3 font-mono text-sm"
          >
            <span className="gradient-ring absolute -inset-[2px] rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
            <span className="relative">GitHub ↗</span>
          </a>
        </div>
      </div>
    </section>
  )
}
