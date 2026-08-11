import { useCallback, useEffect, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return reduced;
}

export type ViewMode = "book" | "reader";
const STORAGE_KEY = "fn-view";
const BOOK_MIN_WIDTH = 900;
/** An explicit user preference may open the book on somewhat smaller screens. */
const BOOK_HARD_MIN = 700;

function autoMode(reducedMotion: boolean): ViewMode {
  if (typeof window === "undefined") return "book";
  if (reducedMotion) return "reader";
  return window.innerWidth >= BOOK_MIN_WIDTH ? "book" : "reader";
}

/** Which experience to render, honoring viewport, reduced motion, and user override. */
export function useViewportMode(): [ViewMode, (m: ViewMode | null) => void] {
  const reducedMotion = usePrefersReducedMotion();
  const [override, setOverride] = useState<ViewMode | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "book" || stored === "reader" ? stored : null;
  });
  const [auto, setAuto] = useState<ViewMode>(() => autoMode(reducedMotion));

  useEffect(() => {
    const onResize = () => setAuto(autoMode(reducedMotion));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reducedMotion]);

  const setPreference = useCallback((m: ViewMode | null) => {
    setOverride(m);
    if (m) localStorage.setItem(STORAGE_KEY, m);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  // A book override can't beat a small screen; reader is always safe.
  const mode: ViewMode =
    override === "reader"
      ? "reader"
      : override === "book" && window.innerWidth >= BOOK_HARD_MIN
        ? "book"
        : auto;

  return [mode, setPreference];
}
