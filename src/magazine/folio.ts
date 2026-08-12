/* The issue's structure as pure data + arithmetic.
   Spread components are bound to these ids in issue-map.tsx. */

export interface SpreadDef {
  id: string;
  route: string | null;
  aliases?: string[];
  label: string;
  runningHead: string | null;
  kind: "cover" | "spread" | "back";
}

export const SPREADS: readonly SpreadDef[] = [
  { id: "cover", route: "/", label: "Cover", runningHead: null, kind: "cover" },
  { id: "contents", route: "/contents", label: "Contents", runningHead: "CONTENTS", kind: "spread" },
  { id: "letter", route: "/about", label: "The Editor's Letter", runningHead: "THE EDITOR'S LETTER", kind: "spread" },
  { id: "profile", route: "/profile", label: "The Profile", runningHead: "NEWS", kind: "spread" },
  { id: "features", route: "/projects", label: "Features: Projects", runningHead: "FEATURES", kind: "spread" },
  { id: "well", route: null, label: "The Project Well", runningHead: "FEATURES", kind: "spread" },
  { id: "resume", route: "/resume", label: "The Annotated Resume", runningHead: "SPORTS", kind: "spread" },
  { id: "library", route: "/library", label: "The Library", runningHead: "ARTS & ENT", kind: "spread" },
  { id: "dispatches", route: "/writing", label: "Dispatches", runningHead: "OPINION", kind: "spread" },
  { id: "letters", route: "/contact", aliases: ["/colophon"], label: "Letters & Colophon", runningHead: "LETTERS", kind: "spread" },
  { id: "back", route: null, label: "Back Cover", runningHead: null, kind: "back" },
] as const;

/** Physical page numbers for a spread: [verso, recto]. Cover and back are unnumbered. */
export function spreadPages(index: number, defs: readonly SpreadDef[] = SPREADS): [number, number] | null {
  const def = defs[index];
  if (!def || def.kind !== "spread") return null;
  return [index * 2, index * 2 + 1];
}

export function pageLabel(index: number, defs: readonly SpreadDef[] = SPREADS): string {
  const def = defs[index];
  if (!def) return "";
  if (def.kind === "cover") return "Cover";
  if (def.kind === "back") return "Back cover";
  const pages = spreadPages(index, defs)!;
  return `Pages ${pages[0]}–${pages[1]}`;
}

export function spreadForRoute(route: string, defs: readonly SpreadDef[] = SPREADS): number {
  const normalized = route !== "/" && route.endsWith("/") ? route.slice(0, -1) : route;
  const index = defs.findIndex(
    (d) => d.route === normalized || d.aliases?.includes(normalized),
  );
  return index === -1 ? 0 : index;
}

export function routeForSpread(index: number, defs: readonly SpreadDef[] = SPREADS): string {
  for (let i = index; i >= 0; i -= 1) {
    const route = defs[i]?.route;
    if (route) return route;
  }
  return "/";
}

export function isKnownRoute(route: string): boolean {
  const normalized = route !== "/" && route.endsWith("/") ? route.slice(0, -1) : route;
  return SPREADS.some(
    (d) => d.route === normalized || d.aliases?.includes(normalized),
  );
}

/** Spread index that holds a given page number. */
export function spreadForPage(page: number, defs: readonly SpreadDef[] = SPREADS): number {
  const index = Math.floor(page / 2);
  return Math.min(Math.max(index, 0), defs.length - 1);
}
