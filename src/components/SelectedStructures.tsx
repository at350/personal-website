import { motion } from 'framer-motion'
import { projects, GITHUB_PROFILE } from '../data/content'
import ProjectCard from './ProjectCard'

export default function SelectedStructures() {
  return (
    <section id="structures" className="bg-bg py-16 md:py-24">
      <div className="mx-auto max-w-[1200px] px-6 md:px-10 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 1 }}
          className="mb-10 flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="h-px w-8 bg-stroke" />
              <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted">Selected Structures</span>
            </div>
            <h2 className="font-display text-4xl md:text-5xl">Featured <span className="text-accent">structures</span></h2>
            <p className="mt-3 max-w-lg font-body text-muted">Things I've designed and built, broken down to their load-bearing parts.</p>
          </div>
          <a href={GITHUB_PROFILE} target="_blank" rel="noopener noreferrer"
            className="group relative hidden rounded-full border border-stroke px-5 py-2.5 font-mono text-sm md:inline-block">
            <span className="gradient-ring absolute -inset-[2px] rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
            <span className="relative">View all →</span>
          </a>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-12 md:gap-6">
          {projects.map((p) => (<ProjectCard key={p.id} project={p} />))}
        </div>
      </div>
    </section>
  )
}
