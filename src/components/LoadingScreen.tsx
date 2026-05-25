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
