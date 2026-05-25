import { motion } from 'framer-motion'
import { capabilities } from '../data/content'

export default function Capabilities() {
  return (
    <section id="toolkit" className="bg-bg py-16 md:py-24">
      <div className="mx-auto max-w-[1100px] px-6 md:px-10 lg:px-16">
        <motion.div
          className="mb-10"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
        >
          <div className="mb-4 flex items-center gap-3">
            <span className="h-px w-8 bg-stroke" />
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted">Capabilities</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl">The <span className="text-accent">toolkit</span></h2>
        </motion.div>

        <div className="border-t border-stroke">
          {capabilities.map((group, i) => (
            <motion.div
              key={group.label}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.08 }}
              className="grid grid-cols-1 gap-2 border-b border-stroke py-6 md:grid-cols-[200px_1fr] md:gap-8"
            >
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                {group.label}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-sm">
                {group.items.map((item, k) => (
                  <span key={item} className="text-text-primary">
                    {item}{k < group.items.length - 1 && <span className="ml-3 text-muted">·</span>}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
