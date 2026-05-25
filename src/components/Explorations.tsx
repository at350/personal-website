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
