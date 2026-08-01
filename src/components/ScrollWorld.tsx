import { useEffect, useRef } from 'react'
import { mountScrollWorld } from '../lib/scrollWorld'
import { EMAIL, GITHUB_PROFILE, projects, socials } from '../data/content'

const BASE = import.meta.env.BASE_URL
const world = (file: string) => `${BASE}world/${file}`

const linkedin = socials.find(s => s.label === 'LinkedIn')?.url ?? GITHUB_PROFILE
const byId = (slug: string) => projects.find(p => p.slug === slug)

export default function ScrollWorld() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    mountScrollWorld(ref.current, {
      brand: { name: 'Alan Tai', href: BASE },
      cta: { label: 'LinkedIn', href: linkedin },
      hint: 'scroll to fly through',
      diveScroll: 1.3,
      crossfade: 0.1,
      sections: [
        {
          id: 'studio',
          label: 'Studio',
          still: world('still1.webp'),
          // clip: world('leg1.mp4'), // TODO: enable once the leg renders
          accent: '#7A5C3E',
          scroll: 1.5,
          linger: 0.35,
          eyebrow: 'Alan Tai — Portfolio',
          title: 'Software, built like architecture.',
          body: 'Full-stack engineer and AI-systems builder at Northwestern — turning messy real-world problems into structures you can walk through.',
          tags: ['Full-Stack', 'AI Systems', 'Founder'],
        },
        {
          id: 'architec',
          label: 'Architec',
          still: world('still2.webp'),
          // clip: world('leg2.mp4'), // TODO: enable once the leg renders
          accent: '#C08E3B',
          linger: 0.3,
          eyebrow: 'STR. 001 — Architec',
          title: 'Energy audits in ten minutes.',
          body: 'OCR reads a building’s utility bills, benchmarks it against 5,000 federal records, and returns upgrade recommendations with payback estimates — a months-long, $15K process compressed into ten free minutes.',
          tags: ['Next.js', 'FastAPI', 'Three.js'],
          cta: { secondary: { label: 'View Architec ↗', href: byId('architec')?.url ?? '#' } },
        },
        {
          id: 'greenchain',
          label: 'GreenChain',
          still: world('still3.webp'),
          // clip: world('leg3.mp4'), // TODO: enable once the leg renders
          accent: '#6E9A68',
          linger: 0.3,
          eyebrow: 'STR. 002 — GreenChain',
          title: 'Supply chains, scored green.',
          body: 'A multi-agent research swarm crawls manufacturer sustainability signals while XGBoost estimates emissions with uncertainty bands — landing on a live globe of shipping routes.',
          tags: ['Multi-agent', 'Claude', 'XGBoost'],
          cta: { secondary: { label: 'View GreenChain ↗', href: byId('greenchain')?.url ?? '#' } },
        },
        {
          id: 'prophis',
          label: 'Prophis',
          still: world('still4.webp'),
          // clip: world('leg4.mp4'), // TODO: enable once the leg renders
          accent: '#C56A5B',
          linger: 0.3,
          eyebrow: 'STR. 003 — Prophis',
          title: 'Patient context, made visible.',
          body: 'Fragmented medical records become an interactive timeline, linked to county health data across 3,142 U.S. counties to surface preventability signals in chronic disease.',
          tags: ['React', 'TypeScript', 'Python'],
          cta: { secondary: { label: 'View Prophis ↗', href: byId('prophis')?.url ?? '#' } },
        },
        {
          id: 'legal',
          label: 'Legal LLM',
          still: world('still5.webp'),
          // clip: world('leg5.mp4'), // TODO: enable once the leg renders
          accent: '#7C6CA8',
          linger: 0.3,
          eyebrow: 'STR. 004 — Legal LLM Benchmarking',
          title: 'How models reason about law.',
          body: 'Built as a Thomson Reuters research fellow: IRAC-structured outputs, clustered with UMAP + HDBSCAN, scored by LLM-as-judge ensembles — cutting expert review time by 90%.',
          tags: ['Python', 'UMAP', 'LLM-as-judge'],
          cta: { secondary: { label: 'View the pipeline ↗', href: byId('legal-llm')?.url ?? '#' } },
        },
        {
          id: 'contact',
          label: 'Contact',
          still: world('still6.webp'),
          // clip: world('leg6.mp4'), // TODO: enable once the leg renders
          accent: '#5E93A6',
          scroll: 1.7,
          linger: 0.45,
          eyebrow: 'The Next Structure',
          title: 'Let’s build something together.',
          body: 'Open to internships, research collaborations, and ambitious ideas — the beacon is on.',
          cta: {
            primary: { label: 'Email me', href: `mailto:${EMAIL}` },
            secondary: { label: 'GitHub ↗', href: GITHUB_PROFILE },
          },
        },
      ],
      connectors: [],
    })
  }, [])

  return <div ref={ref} />
}
