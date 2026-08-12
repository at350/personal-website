/** Shared cover-foil inputs for the live DOM and the WebGL book. */

export const COVER_HOLOGRAM_PAGE_KEY = "0:recto";
export const COVER_HOLOGRAM_PATTERN_PATH =
  "/images/editorial/cover-hologram-pattern.svg";

export interface CoverHologramPointer {
  x: number;
  y: number;
}

export interface CoverHologramCssVariables {
  shiftX: string;
  shiftY: string;
  glareX: string;
  glareY: string;
  angle: string;
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
 * The moving leaf may add a stronger angular color shift, but both landed
 * endpoints must be the same state as the static cover. This exact-zero
 * envelope is the continuity contract between stack, leaf, and live DOM.
 */
export function coverHologramFlipEnvelope(progress: number): number {
  const p = clamp(progress, 0, 1);
  if (p === 0 || p === 1) return 0;
  return Math.sin(Math.PI * p);
}

/** CSS uses unit-bearing variables so it does not depend on calc() division. */
export function coverHologramCssVariables(
  x: number,
  y: number,
): CoverHologramCssVariables {
  const pointer = normalizeCoverHologramPointer(x, y);
  return {
    shiftX: `${(pointer.x * 26).toFixed(2)}%`,
    shiftY: `${(pointer.y * 22).toFixed(2)}%`,
    glareX: `${(50 + pointer.x * 34).toFixed(2)}%`,
    glareY: `${(50 + pointer.y * 34).toFixed(2)}%`,
    angle: `${(118 + pointer.x * 7 - pointer.y * 5).toFixed(2)}deg`,
  };
}

/** Imperative on purpose: pointer motion does not need a React render. */
export function applyCoverHologramPointer(
  element: HTMLElement | null,
  x: number,
  y: number,
) {
  if (!element) return;
  const variables = coverHologramCssVariables(x, y);
  element.style.setProperty("--holo-shift-x", variables.shiftX);
  element.style.setProperty("--holo-shift-y", variables.shiftY);
  element.style.setProperty("--holo-glare-x", variables.glareX);
  element.style.setProperty("--holo-glare-y", variables.glareY);
  element.style.setProperty("--holo-angle", variables.angle);
}
