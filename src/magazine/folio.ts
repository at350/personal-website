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

export interface BookLocation {
  pathname: string;
  state: { bookSpread: number } | null;
}

const normalizeRoute = (route: string) =>
  route !== "/" && route.endsWith("/") ? route.slice(0, -1) : route;

/** Physical page numbers for a spread: [verso, recto]. Cover and back are unnumbered. */
export function spreadPages(index: number, defs: readonly SpreadDef[] = SPREADS): [number, number] | null {
  const def = defs[index];
  if (!def || def.kind !== "spread") return null;
  return [index * 2, index * 2 + 1];
}

export type PageSide = "verso" | "recto";

export interface FaceDef {
  /** Spread this face belongs to. */
  spread: number;
  side: PageSide;
  /** Printed page number, or null on the unnumbered cover and back. */
  page: number | null;
}

/** The cover has no verso and the back cover no recto: those are the outside
    of the issue, not paper anyone reads. */
export function isRenderableFace(
  spread: number,
  side: PageSide,
  defs: readonly SpreadDef[] = SPREADS,
): boolean {
  const kind = defs[spread]?.kind;
  return !(
    (kind === "cover" && side === "verso") ||
    (kind === "back" && side === "recto")
  );
}

/** Every readable face in physical order — the sequence a single-page reader
    turns through, and the set the capture farm rasterizes. Twenty faces: the
    cover, two per spread, the back. */
export const FACES: readonly FaceDef[] = SPREADS.flatMap((_, spread) =>
  (["verso", "recto"] as const)
    .filter((side) => isRenderableFace(spread, side))
    .map((side) => {
      const pages = spreadPages(spread);
      return {
        spread,
        side,
        page: pages ? (side === "verso" ? pages[0] : pages[1]) : null,
      };
    }),
);

/** A spread's first face — where a route lands when pages turn one at a time. */
export function faceForSpread(spread: number, faces: readonly FaceDef[] = FACES): number {
  const index = faces.findIndex((face) => face.spread === spread);
  return index === -1 ? 0 : index;
}

export function spreadForFace(face: number, faces: readonly FaceDef[] = FACES): number {
  const clamped = Math.min(Math.max(face, 0), faces.length - 1);
  return faces[clamped]?.spread ?? 0;
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
  const normalized = normalizeRoute(route);
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

/**
 * Routeless spreads share the URL of the nearest routed spread before them.
 * Preserve their physical index in history state so that syncing the URL does
 * not send the book back to that earlier spread.
 */
export function bookLocationForSpread(
  index: number,
  defs: readonly SpreadDef[] = SPREADS,
): BookLocation {
  const pathname = routeForSpread(index, defs);
  const roundTrips = spreadForRoute(pathname, defs) === index;
  return {
    pathname,
    state: roundTrips ? null : { bookSpread: index },
  };
}

/** Resolve a URL to a physical spread, honoring trusted routeless-spread state. */
export function spreadForBookLocation(
  route: string,
  state: unknown,
  defs: readonly SpreadDef[] = SPREADS,
): number {
  const normalized = normalizeRoute(route);
  const candidate =
    typeof state === "object" && state !== null && "bookSpread" in state
      ? (state as { bookSpread?: unknown }).bookSpread
      : null;

  if (
    typeof candidate === "number" &&
    Number.isInteger(candidate) &&
    candidate >= 0 &&
    candidate < defs.length &&
    defs[candidate]?.route === null &&
    routeForSpread(candidate, defs) === normalized
  ) {
    return candidate;
  }

  return spreadForRoute(normalized, defs);
}

export function isKnownRoute(route: string): boolean {
  const normalized = normalizeRoute(route);
  return SPREADS.some(
    (d) => d.route === normalized || d.aliases?.includes(normalized),
  );
}

/** Spread index that holds a given page number. */
export function spreadForPage(page: number, defs: readonly SpreadDef[] = SPREADS): number {
  const index = Math.floor(page / 2);
  return Math.min(Math.max(index, 0), defs.length - 1);
}
