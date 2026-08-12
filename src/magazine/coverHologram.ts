/** Interactive foil inputs for the WebGL cover surface. */

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
 * The flip contribution exists only while the cover is moving. This exact-zero
 * envelope is the continuity contract with the neutral cover at pickup and landing.
 */
export function coverHologramFlipEnvelope(progress: number): number {
  const p = clamp(progress, 0, 1);
  if (p === 0 || p === 1) return 0;
  return Math.sin(Math.PI * p);
}

/**
 * Pointer tilt is visible only while the book is still a 3D surface. The
 * untouched display pose and the flat DOM handoff both remain foil-free.
 */
export function coverHologramTiltEnvelope(
  pointerActive: boolean,
  pose: number,
): number {
  if (!pointerActive || !Number.isFinite(pose)) return 0;
  const displayAmount = 1 - clamp(pose, 0, 1);
  const t = clamp((displayAmount - 0.035) / (0.22 - 0.035), 0, 1);
  return t * t * (3 - 2 * t);
}

/** The cover front is sheet zero in both the ordinary and fast turn paths. */
export function isMovingCoverSheet(sheet: number | null): boolean {
  return sheet === 0;
}

/** Avoids drawing a second foil skin while the cover itself is airborne. */
export function isTiltableCoverStack(
  spread: number,
  sheet: number | null,
  riffleActive: boolean,
): boolean {
  return spread === 0 && sheet === null && !riffleActive;
}
