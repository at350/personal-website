import { motion } from 'framer-motion'
import { logEntries, SUBSTACK_URL } from '../data/content'

export default function Log() {
  const hasPosts = logEntries.length > 0
  return (
    <section id="log" className="bg-bg py-16 md:py-24">
      <div className="mx-auto max-w-[1000px] px-6 md:px-10 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 1 }} className="mb-10"
        >
          <div className="mb-4 flex items-center gap-3">
            <span className="h-px w-8 bg-stroke" />
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted">Log</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl">Field <span className="text-accent">notes</span></h2>
          <p className="mt-3 max-w-lg font-body text-muted">Working notes on building with AI agents, systems, and whatever I'm currently obsessed with.</p>
        </motion.div>

        {!hasPosts ? (
          <div className="border-y border-stroke py-12 text-center font-mono text-sm uppercase tracking-[0.2em] text-muted">
            Writing soon.
          </div>
        ) : (
          <>
            <div className="border-t border-stroke">
              {logEntries.slice(0, 5).map((entry, i) => (
                <motion.a
                  key={entry.url} href={entry.url} target="_blank" rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="group flex items-baseline justify-between gap-6 border-b border-stroke py-5 transition-colors hover:bg-surface"
                >
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-xs text-muted">N°{String(i + 1).padStart(2, '0')}</span>
                    <span className="font-display text-xl transition-colors group-hover:text-accent md:text-2xl">{entry.title}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted">
                    <span>{new Date(entry.date + 'T00:00:00').toLocaleDateString()} · {entry.readTime}</span>
                    <span className="transition-transform group-hover:translate-x-1">↗</span>
                  </div>
                </motion.a>
              ))}
            </div>
            {SUBSTACK_URL && (
              <a href={SUBSTACK_URL} target="_blank" rel="noopener noreferrer"
                className="mt-6 inline-block font-mono text-sm text-muted transition-colors hover:text-accent">
                Read more on Substack ↗
              </a>
            )}
          </>
        )}
      </div>
    </section>
  )
}
