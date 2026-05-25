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
