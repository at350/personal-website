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
        <div className="marquee-track inline-block whitespace-nowrap">
          <span className="font-display text-[10vw] leading-none text-text-primary/10">{phrase.repeat(10)}</span>
          <span className="font-display text-[10vw] leading-none text-text-primary/10">{phrase.repeat(10)}</span>
        </div>
      </div>

      {/* CTA */}
      <div className="mx-auto max-w-[1100px] px-6 py-16 text-center md:px-10 lg:px-16">
        <a
          href={`mailto:${EMAIL}`}
          className="group relative inline-block rounded-full bg-text-primary px-10 py-5 font-display text-2xl text-bg transition hover:scale-105 md:text-4xl"
        >
          <span className="gradient-ring absolute -inset-[2px] rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
          <span className="relative">Let's build something ↗</span>
        </a>
      </div>

      {/* footer bar */}
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-4 border-t border-stroke px-6 pt-6 md:px-10 lg:px-16">
        <div className="flex items-center gap-4 font-mono text-sm">
          {socials.map((s) => (
            <a
              key={s.label}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-muted underline-offset-4 transition-colors hover:text-text-primary hover:underline ${s.url === '#' ? 'pointer-events-none opacity-40' : ''}`}
            >
              {s.label}
            </a>
          ))}
        </div>
        <div className="font-display text-xl">ALAN TAI<span className="text-accent">.</span></div>
      </div>
    </footer>
  )
}
