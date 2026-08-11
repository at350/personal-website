const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Material response is strongest in the air and exactly zero on either stack.
 * That gives the moving sheet a glossy highlight without changing a single
 * captured color on the frame where WebGL hands back to the live DOM.
 */
export function paperTurnActivity(progress: number) {
  const clamped = clamp01(progress);
  if (clamped === 0 || clamped === 1) return 0;
  return Math.sin(Math.PI * clamped);
}
