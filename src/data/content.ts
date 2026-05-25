export type GlyphKind = 'tower' | 'globe' | 'tree' | 'grid'

export interface Project {
  id: string          // "STR. 001"
  slug: string        // matches public/projects/<slug>.png
  title: string
  span: 5 | 7
  blurb: string
  stack: string[]
  url: string         // "#" = placeholder, render as not-yet-linked
  glyph: GlyphKind
}

export interface CapabilityGroup {
  label: string
  items: string[]
}

export interface LogEntry {
  title: string
  url: string
  date: string        // ISO
  readTime: string    // "5 min"
  excerpt?: string
}

export interface SocialLink {
  label: string
  url: string         // "#" = not set yet
}

export const HERO_ROLES = [
  'Full-Stack Engineer',
  'AI Systems Builder',
  'Founder',
  'Software Engineer',
] as const

export const EMAIL = 'alantai@u.northwestern.edu'
export const GITHUB_PROFILE = 'https://github.com/at350'

export const projects: Project[] = [
  {
    id: 'STR. 001',
    slug: 'architec',
    title: 'Architec',
    span: 7,
    glyph: 'tower',
    blurb:
      'AI energy audits for commercial buildings. OCR ingests utility bills, benchmarks the building against 5,000 federal records, and returns a report with upgrade recommendations and payback estimates — alongside a Three.js + Mapbox model that simulates solar gain and heat loss, plus an ElevenLabs voice walkthrough. Compresses a $15K–$50K, months-long process into ten free minutes.',
    stack: ['Next.js', 'FastAPI', 'Three.js', 'scikit-learn', 'Gemini'],
    url: '#', // TODO: paste Devpost URL
  },
  {
    id: 'STR. 002',
    slug: 'greenchain',
    title: 'GreenChain',
    span: 5,
    glyph: 'globe',
    blurb:
      'Supply-chain sustainability scoring. A multi-agent research swarm (Dedalus + Claude) crawls manufacturer sustainability pages in parallel for certification signals, an XGBoost quantile model estimates emissions with uncertainty bands, and results land on a Three.js globe with animated shipping routes and a force-directed supply graph. Replaces ~$50K/yr ESG software with a free, minutes-long workflow.',
    stack: ['Multi-agent', 'Claude', 'XGBoost', 'Three.js'],
    url: '#', // TODO: paste Devpost URL
  },
  {
    id: 'STR. 003',
    slug: 'prophis',
    title: 'Prophis',
    span: 5,
    glyph: 'tree',
    blurb:
      'Patient-context intelligence for public health. A React/TypeScript interface turns fragmented medical records into an interactive patient timeline, then links each case to County Health Rankings data across 3,142 U.S. counties to compute similarity cohorts and a Health Equity Context Score — surfacing preventability signals in chronic disease. Built at YHack.',
    stack: ['React', 'TypeScript', 'Python'],
    url: 'https://at350-yhack2026.vercel.app/',
  },
  {
    id: 'STR. 004',
    slug: 'legal-llm',
    title: 'Legal LLM Benchmarking',
    span: 7,
    glyph: 'grid',
    blurb:
      'An automated pipeline benchmarking how large language models reason on structured legal tasks, built as a Thomson Reuters research fellow. Forces IRAC-structured JSON outputs, embeds and clusters them with UMAP + HDBSCAN to measure reasoning consistency, and scores with rubric-based LLM-as-a-judge ensembles. Cut expert review time by 90%.',
    stack: ['Python', 'UMAP', 'HDBSCAN', 'LLM-as-judge'],
    url: 'https://github.com/at350/tr-benchmarking',
  },
]

export const capabilities: CapabilityGroup[] = [
  { label: 'LANGUAGES', items: ['Python', 'TypeScript / JavaScript', 'Java', 'SQL', 'R'] },
  { label: 'ML & DATA', items: ['PyTorch', 'scikit-learn', 'XGBoost', 'Pandas', 'NumPy', 'BeautifulSoup'] },
  { label: 'FRAMEWORKS', items: ['React', 'Next.js', 'FastAPI', 'Three.js', 'Firebase', 'Postgres'] },
  { label: 'SYSTEMS', items: ['Multi-agent / agentic engineering', 'model evaluation', 'API design', 'cloud deployment', 'Git'] },
]

// Empty for now → Log renders "Writing soon." A future build-time bake fills this.
export const logEntries: LogEntry[] = []
export const SUBSTACK_URL = '' // e.g. 'https://alantai.substack.com'

export const socials: SocialLink[] = [
  { label: 'GitHub', url: 'https://github.com/at350' },
  { label: 'LinkedIn', url: 'https://www.linkedin.com/in/alan-tai-nu' },
  { label: 'X / Twitter', url: '#' }, // TODO: paste X URL
]
