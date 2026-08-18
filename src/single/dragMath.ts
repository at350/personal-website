/* Turning a swipe into engine events, as pure arithmetic. */

/** Travel before a drag is a page turn rather than a tap or a scroll. */
export const ENGAGE_PX = 12;
/** Horizontal must beat vertical by this much, or the finger is reading. */
export const ENGAGE_RATIO = 1.2;
/** Fraction of the page's width that spans a whole turn. Short of the full
    width so a thumb can finish the gesture without crossing the screen. */
export const DRAG_SPAN = 0.9;

/** The book uses the same test (12px, 1.2×) for the same reason: a diagonal
    swipe belongs to the browser's scroll, not to the paper. */
export function shouldEngage(dx: number, dy: number): boolean {
  return Math.abs(dx) > ENGAGE_PX && Math.abs(dx) > Math.abs(dy) * ENGAGE_RATIO;
}

/** Pulling leftward turns toward the back of the issue. */
export function edgeForDelta(dx: number): "fore" | "back" {
  return dx < 0 ? "fore" : "back";
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Pointer position → flip amount. Progress runs 0 (unflipped, lying right)
    to 1 (flipped left), so leftward travel raises it from either start. */
export function dragProgress(
  startProgress: 0 | 1,
  startX: number,
  x: number,
  pageWidth: number,
): number {
  const span = Math.max(1, pageWidth * DRAG_SPAN);
  return clamp01(startProgress + (startX - x) / span);
}

export interface PointerSample {
  x: number;
  t: number;
}

/** Signed pointer speed in px/ms, positive leftward — the unit and sign
    `engine.ts`'s VELOCITY_BIAS (0.4 px/ms) is written in. Sampled over a short
    trailing window so a flick is judged by how it ended, not how it began. */
export function flickVelocity(
  samples: readonly PointerSample[],
  windowMs = 80,
): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1]!;
  /* Oldest sample still inside the window. Searched over everything but the
     last, so a gesture whose final two samples straddle the window still has
     a pair to measure across rather than measuring `last` against itself. */
  const earlier = samples.slice(0, -1);
  const first =
    earlier.find((sample) => last.t - sample.t <= windowMs) ??
    earlier[earlier.length - 1]!;
  const elapsed = last.t - first.t;
  if (elapsed <= 0) return 0;
  return (first.x - last.x) / elapsed;
}
