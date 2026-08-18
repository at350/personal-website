import { useCallback, useEffect, useState } from "react";

/** The OS setting can change while the issue is open, so this tracks it rather
    than sampling it once at mount. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/** "book": the WebGL spread, two pages at a time. "single": the same pages
    turned one at a time by touch. "reader": the whole issue as a stack, no
    page turn at all. */
export type ViewMode = "book" | "single" | "reader";

const STORAGE_KEY = "fn-view";
/** Below this the book's two pages are too narrow to read. */
export const BOOK_MIN_WIDTH = 900;
/** An explicit user preference may open the book on somewhat smaller screens. */
export const BOOK_HARD_MIN = 700;

const isViewMode = (value: unknown): value is ViewMode =>
  value === "book" || value === "single" || value === "reader";

function storedPreference(): ViewMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isViewMode(stored) ? stored : null;
  } catch {
    // Safari with site data blocked throws on access rather than returning null.
    return null;
  }
}

function writePreference(mode: ViewMode | null) {
  try {
    if (mode) localStorage.setItem(STORAGE_KEY, mode);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // A preference that cannot be persisted still applies to this session.
  }
}

/** What a visitor gets before expressing a preference. */
export function autoMode(reducedMotion: boolean, width: number): ViewMode {
  if (reducedMotion) return "reader";
  return width >= BOOK_MIN_WIDTH ? "book" : "single";
}

/** A stored preference is honored except where the screen cannot hold it:
    the book needs room, while single and reader fit anything. */
export function resolveViewMode(
  override: ViewMode | null,
  reducedMotion: boolean,
  width: number,
): ViewMode {
  if (override === "book") {
    return width >= BOOK_HARD_MIN ? "book" : autoMode(reducedMotion, width);
  }
  if (override === "single" || override === "reader") return override;
  return autoMode(reducedMotion, width);
}

function viewportWidth(): number {
  return typeof window === "undefined" ? BOOK_MIN_WIDTH : window.innerWidth;
}

export interface ViewportMode {
  mode: ViewMode;
  setPreference: (mode: ViewMode | null) => void;
  /** Whether this screen could hold the book if the reader asked for it. */
  canOpenBook: boolean;
}

/** Which experience to render, honoring viewport, reduced motion, and a
    persisted override. */
export function useViewportMode(): ViewportMode {
  const reducedMotion = usePrefersReducedMotion();
  const [override, setOverride] = useState<ViewMode | null>(storedPreference);
  const [width, setWidth] = useState(viewportWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setPreference = useCallback((mode: ViewMode | null) => {
    setOverride(mode);
    writePreference(mode);
  }, []);

  return {
    mode: resolveViewMode(override, reducedMotion, width),
    setPreference,
    canOpenBook: width >= BOOK_HARD_MIN,
  };
}
