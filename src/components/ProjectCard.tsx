import type { Project } from '../data/content'
import { GLYPHS } from './glyphs'

export default function ProjectCard({ project }: { project: Project }) {
  const Glyph = GLYPHS[project.glyph]
  const hasLink = project.url !== '#'
  const num = project.id.replace(/\D/g, '') // "001" from "STR. 001"

  const cls = `group relative flex flex-col overflow-hidden rounded-xl border border-stroke bg-surface transition-colors duration-300 hover:border-[hsl(var(--accent)/0.45)] ${
    project.span === 7 ? 'md:col-span-7' : 'md:col-span-5'
  }`

  const inner = (
    <>
      {/* diagram header — glyph as the hero, blueprint texture, drawing titleblock */}
      <div className="relative aspect-[16/10] overflow-hidden border-b border-stroke">
        {/* base wash */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,hsl(var(--surface)),hsl(var(--bg)))]" />
        {/* halftone dots */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay"
          style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--line)) 1px, transparent 1px)', backgroundSize: '4px 4px' }}
        />
        {/* blueprint grid */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--line)/0.06) 1px,transparent 1px),linear-gradient(90deg,hsl(var(--line)/0.06) 1px,transparent 1px)',
            backgroundSize: '30px 30px',
          }}
        />
        {/* giant faint drawing number */}
        <span
          className="pointer-events-none absolute -right-3 -top-10 select-none font-display text-[9rem] leading-none"
          style={{ color: 'hsl(var(--line)/0.05)' }}
        >
          {num}
        </span>

        {/* centered glyph */}
        <div className="absolute inset-0 grid place-items-center">
          <Glyph className="h-24 w-24 transition-transform duration-500 ease-out group-hover:scale-110" />
        </div>

        {/* titleblock */}
        <p className="absolute left-5 top-5 font-mono text-xs text-muted">{project.id}</p>
        {hasLink && (
          <span className="absolute right-5 top-5 font-mono text-xs text-accent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            Open ↗
          </span>
        )}
        <h3 className="absolute bottom-5 left-5 font-display text-2xl">{project.title}</h3>
      </div>

      {/* blurb — the substance, previously unused */}
      <p className="flex-1 p-5 font-body text-sm leading-relaxed text-muted">{project.blurb}</p>

      {/* stack footer */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-stroke px-5 py-3 font-mono text-[11px] text-muted">
        <span>STACK ·</span>
        {project.stack.map((t) => (
          <span key={t} className="text-accent">
            {t}
          </span>
        ))}
      </div>
    </>
  )

  return hasLink ? (
    <a href={project.url} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <article className={cls}>{inner}</article>
  )
}
