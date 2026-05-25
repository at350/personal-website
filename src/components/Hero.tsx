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
