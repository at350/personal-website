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

/** Progress distance from either endpoint inside which the foil is fully
    retired, and the distance where it reaches full mid-flight strength. The
    landed sheet keeps waving for a beat before the canonical texture swap;
    without this ramp the foil sits on the settled page as a gray wash. */
export const COVER_HOLOGRAM_LANDING_FADE_START = 0.045;
export const COVER_HOLOGRAM_LANDING_FADE_END = 0.16;

/**
 * The flip contribution exists only while the cover is moving. This exact-zero
 * envelope is the continuity contract with the neutral cover at pickup and
 * landing — and the landing fade retires the foil over the final approach, so
 * the settling sheet already shows the neutral cover while it finishes waving.
 */
export function coverHologramFlipEnvelope(progress: number): number {
  const p = clamp(progress, 0, 1);
  if (p === 0 || p === 1) return 0;
  const edgeDistance = Math.min(p, 1 - p);
  const t = clamp(
    (edgeDistance - COVER_HOLOGRAM_LANDING_FADE_START) /
      (COVER_HOLOGRAM_LANDING_FADE_END - COVER_HOLOGRAM_LANDING_FADE_START),
    0,
    1,
  );
  const landingFade = t * t * (3 - 2 * t);
  return Math.sin(Math.PI * p) * landingFade;
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
