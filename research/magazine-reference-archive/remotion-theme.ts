/**
 * Conservative motion/theme translation of the editorial research.
 * Source imagery is intentionally excluded: those files are research-only.
 */
export const brandTheme = {
  company: "Magazine Editorial Reference Archive",
  slug: "magazine-reference-archive",
  colors: {
    paper: "#FFFFFF",
    ink: "#0E0E0C",
    accent: "#E8351A",
  },
  fonts: {
    display: "Zodiak, Georgia, serif",
    condensed: "Tanker, 'Arial Narrow', sans-serif",
    metadata: "Server Mono, ui-monospace, monospace",
  },
  assets: {
    logos: [],
    images: [],
    icons: [],
  },
  motion: {
    easing: ["cubic-bezier(0.16, 1, 0.3, 1)"],
    transitions: [
      "critically damped physical settle",
      "hard typographic cut",
      "short masked reveal",
    ],
  },
  usageNotes: [
    "One governing idea per composition.",
    "One memorable interaction per spread.",
    "Do not import or publish any source imagery from this research folder.",
    "The project palette is white, near-black, and one red; source palettes are not tokens.",
  ],
} as const;
