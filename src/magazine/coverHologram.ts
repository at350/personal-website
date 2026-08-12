/** Motion-only foil inputs for the WebGL cover leaf. */

export const COVER_HOLOGRAM_PAGE_KEY = "0:recto";
export const COVER_HOLOGRAM_PATTERN_PATH =
  "/images/editorial/cover-hologram-pattern.svg";

export interface CoverHologramPointer {
  x: number;
  y: number;
}

const finiteOrZero = (value: number) => (Number.isFinite(value) ? value : 0);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, finiteOrZero(value)));

/** Pointer values are page-local and deliberately bounded at the paper edge. */
export function normalizeCoverHologramPointer(
  x: number,
  y: number,
): CoverHologramPointer {
  return {
    x: clamp(x, -1, 1),
    y: clamp(y, -1, 1),
  };
}

/**
 * The foil exists only while the cover is moving. This exact-zero envelope is
 * the continuity contract with the neutral cover at pickup and landing.
 */
export function coverHologramFlipEnvelope(progress: number): number {
  const p = clamp(progress, 0, 1);
  if (p === 0 || p === 1) return 0;
  return Math.sin(Math.PI * p);
}

/** The cover front is sheet zero in both the ordinary and fast turn paths. */
export function isMovingCoverSheet(sheet: number | null): boolean {
  return sheet === 0;
}
