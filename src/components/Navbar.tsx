import { useEffect, useState } from 'react'
import { scrollToId } from '../lib/smoothScroll'

const LINKS: { label: string; id: string }[] = [
  { label: 'Index', id: 'top' },
  { label: 'Structures', id: 'structures' },
  { label: 'Toolkit', id: 'toolkit' },
  { label: 'Log', id: 'log' },
  { label: 'Contact', id: 'contact' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState('top')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id) })
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    LINKS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  return (
    <nav className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 md:pt-6">
      <div className={`inline-flex max-w-[calc(100vw-1rem)] items-center overflow-x-auto rounded-full border border-stroke bg-surface px-2 py-2 backdrop-blur-md transition-shadow no-scrollbar [&>*]:shrink-0 ${scrolled ? 'shadow-md shadow-black/20' : ''}`}>
        {/* logo node */}
        <button onClick={() => scrollToId('top')} className="group relative mx-1 grid h-9 w-9 place-items-center transition-transform hover:scale-110" aria-label="Top">
          <span className="accent-gradient absolute inset-0 rounded-full transition-transform duration-500 group-hover:[transform:rotate(-180deg)]" />
          <span className="absolute inset-[2px] grid place-items-center rounded-full bg-bg font-display text-[13px]">AT</span>
        </button>

        <span className="mx-1 hidden h-5 w-px bg-stroke sm:block" />

        {LINKS.map(({ label, id }) => (
          <button
            key={id}
            onClick={() => scrollToId(id)}
            className={`rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors sm:px-4 sm:text-sm ${
              active === id ? 'bg-stroke text-text-primary' : 'text-muted hover:bg-stroke hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        ))}

        <span className="mx-1 hidden h-5 w-px bg-stroke sm:block" />

        <button aria-label="Say hi" onClick={() => scrollToId('contact')} className="group relative mx-1 rounded-full px-3 py-1.5 sm:px-4">
          <span className="gradient-ring absolute -inset-[2px] rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
          <span className="relative grid place-items-center rounded-full bg-surface px-2 py-0.5 font-mono text-xs uppercase tracking-wider backdrop-blur-md sm:text-sm">
            Say hi <span aria-hidden="true">↗</span>
          </span>
        </button>
      </div>
    </nav>
  )
}
