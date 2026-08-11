export interface HandoffState {
  turning: boolean;
  rotationError: number;
  scaleError: number;
  shiftError: number;
}

/**
 * The DOM can replace the canvas only after the rendered page differs by less
 * than a pixel. The swap is atomic: cross-fading two separate text renderers
 * produces a visible double image even when their transforms are aligned.
 */
export function handoffOpacity(state: HandoffState): number {
  if (state.turning) return 0;
  const aligned =
    Math.abs(state.rotationError) <= 0.00025 &&
    Math.abs(state.scaleError) <= 0.0001 &&
    Math.abs(state.shiftError) <= 0.1;
  return aligned ? 1 : 0;
}
