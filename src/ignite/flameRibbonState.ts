const MINIMUM_LIVE_TARGET = 0.58;
const ROOT_RESPONSE = 0.62;
const ROOT_FADE_RETENTION = 0.925;

/**
 * Advances the visual envelope of one attached flame at the atmosphere's
 * fixed 30 Hz cadence. A selected hot-front root becomes readable in one
 * frame, while a lost root remains as a shrinking afterburn for roughly
 * 0.8–1.8 seconds instead of popping out with the source sample.
 */
export function advanceFlameEnvelope(current: number, incoming: number) {
  const safeCurrent = Math.min(1, Math.max(0, current));
  const safeIncoming = Math.min(1, Math.max(0, incoming));
  if (safeIncoming <= 0) return safeCurrent * ROOT_FADE_RETENTION;
  const visibleTarget = Math.max(MINIMUM_LIVE_TARGET, safeIncoming);
  return safeCurrent + (visibleTarget - safeCurrent) * ROOT_RESPONSE;
}

export interface FlameClusterProfile {
  /** Tangential span of the attached source arc in world pixels. */
  arcWidth: number;
  /** Maximum buoyant rise in world pixels. */
  rise: number;
  /** Stable temporal offset; every cluster evolves out of phase. */
  phase: number;
  /** Signed branch preference used to keep cluster topology asymmetric. */
  branchBias: number;
}

function fract(value: number) {
  return value - Math.floor(value);
}

/**
 * Produces deliberately non-identical gas-cluster parameters. The renderer
 * soft-unions several branches from each profile into one field; it never
 * draws a fixed flame silhouette or repeats a sprite frame.
 */
export function flameClusterProfile(index: number): FlameClusterProfile {
  const safeIndex = Math.max(0, Math.floor(index));
  const first = fract((safeIndex + 1) * 0.61803398875 + 0.173);
  const second = fract((safeIndex + 1) * 0.41421356237 + 0.391);
  const third = fract((safeIndex + 1) * 0.73205080757 + 0.217);
  return {
    arcWidth: 38 + first * 12,
    rise: 112 + second * 24,
    phase: third * Math.PI * 2,
    branchBias: (first - 0.5) * 0.72,
  };
}
