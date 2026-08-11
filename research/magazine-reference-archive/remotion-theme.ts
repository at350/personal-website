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
      "short masked reveal with a visible destination",
      "state-preserving archive morph",
    ],
    grammar: {
      entry: "Short, skippable, and subordinate to the first readable frame.",
      scroll: "Marks editorial chapters; never constant background parallax.",
      hover: "Previews content or exposes an alternate state.",
      cursor: "Changes an object, camera, or other legible state.",
      reducedMotion: "Use poster frames and direct state changes.",
    },
  },
  usageNotes: [
    "One governing idea per composition.",
    "One memorable interaction per spread.",
    "Name the motion verb and trigger before implementation.",
    "Preserve object identity when changing archive layouts.",
    "Do not import or publish any source imagery from this research folder.",
    "Never publish private mymind screenshots or media.",
    "The project palette is white, near-black, and one red; source palettes are not tokens.",
  ],
} as const;
