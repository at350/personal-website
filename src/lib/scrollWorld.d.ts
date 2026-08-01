export interface ScrollWorldCta {
  primary?: { label: string; href: string }
  secondary?: { label: string; href: string }
}

export interface ScrollWorldSection {
  id: string
  label: string
  still: string
  stillMobile?: string
  /** Omit until the rendered leg exists — the engine falls back to `still`. */
  clip?: string
  clipMobile?: string
  accent?: string
  scroll?: number
  linger?: number
  eyebrow?: string
  title?: string
  body?: string
  tags?: string[]
  cta?: ScrollWorldCta
}

export interface ScrollWorldConfig {
  brand?: { name: string; href?: string }
  cta?: { label: string; href: string }
  diveScroll?: number
  connScroll?: number
  crossfade?: number
  hint?: string
  nav?: boolean
  atmosphere?: boolean
  sections: ScrollWorldSection[]
  connectors?: (string | null)[]
  connectorsMobile?: (string | null)[]
}

export function mountScrollWorld(container: HTMLElement, config: ScrollWorldConfig): void
