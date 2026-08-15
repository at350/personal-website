/* Pure motion mapping for the Drift wind-orb cursor, mirroring the ignite
   cursor's contract: perceptual velocity normalization, a closed-form
   inertial body the swirl trails behind, and the click-gust ring envelope.
   Everything is deterministic and frame-rate independent. */

export interface DriftCursorGust {
  x: number;
  y: number;
  speed: number;
}

export interface DriftOrbBodyState {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

export interface DriftGustBurst {
  radius: number;
  strength: number;
}

const MAX_POINTER_SPEED = 2_400;
/** Air is broader-shouldered than flame: direction saturates later, so slow
    strokes read as a breeze before a fast one reads as a gust. */
const DIRECTION_RESPONSE_SPEED = 520;
const ENERGY_RESPONSE_SPEED = 460;
/** Lazier than the flame body (34): the orb is a parcel of air, and its
    swirl visibly sloshes behind the hand before catching up. */
const BODY_NATURAL_FREQUENCY = 22;
const MAX_FRAME_DELTA = 0.05;

export const DRIFT_BURST_START_RADIUS = 30;
export const DRIFT_BURST_GROWTH = 430;
const BURST_DECAY = 3.4;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Maps pointer velocity into a perceptual wind response. The tanh curve keeps
 * ordinary mouse movement legible while absorbing trackpad flicks and gaming
 * mice without a hard visual step.
 */
export function driftCursorGust(
  velocityX: number,
  velocityY: number,
): DriftCursorGust {
  const safeX = clamp(velocityX, -MAX_POINTER_SPEED, MAX_POINTER_SPEED);
  const safeY = clamp(velocityY, -MAX_POINTER_SPEED, MAX_POINTER_SPEED);
  const magnitude = Math.hypot(safeX, safeY);

  return {
    x: Math.tanh(safeX / DIRECTION_RESPONSE_SPEED),
    y: Math.tanh(safeY / DIRECTION_RESPONSE_SPEED),
    speed: 1 - Math.exp(-magnitude / ENERGY_RESPONSE_SPEED),
  };
}

/**
 * Advances the orb's air parcel independently of the exact pointer position
 * using the closed-form critically damped spring solution — deterministic
 * across frame rates, no overshoot, and slow enough that the swirl visibly
 * trails the hand.
 */
export function stepDriftOrbBody(
  state: DriftOrbBodyState,
  targetX: number,
  targetY: number,
  deltaSeconds: number,
): DriftOrbBodyState {
  const safeDelta = clamp(deltaSeconds, 0, MAX_FRAME_DELTA);
  if (safeDelta === 0) return { ...state };

  const decay = Math.exp(-BODY_NATURAL_FREQUENCY * safeDelta);
  const offsetX = state.x - targetX;
  const offsetY = state.y - targetY;
  const responseX = state.velocityX + BODY_NATURAL_FREQUENCY * offsetX;
  const responseY = state.velocityY + BODY_NATURAL_FREQUENCY * offsetY;

  return {
    x: targetX + (offsetX + responseX * safeDelta) * decay,
    y: targetY + (offsetY + responseY * safeDelta) * decay,
    velocityX:
      (state.velocityX - BODY_NATURAL_FREQUENCY * responseX * safeDelta) *
      decay,
    velocityY:
      (state.velocityY - BODY_NATURAL_FREQUENCY * responseY * safeDelta) *
      decay,
  };
}

/**
 * The click-gust ring: an expanding circle whose strength dies as it grows,
 * matching the radial shove the click gives the floating leaves. A negative
 * or unstarted age yields no ring at all.
 */
export function driftGustBurst(ageSeconds: number): DriftGustBurst {
  if (ageSeconds < 0) return { radius: DRIFT_BURST_START_RADIUS, strength: 0 };
  return {
    radius: DRIFT_BURST_START_RADIUS + ageSeconds * DRIFT_BURST_GROWTH,
    strength: Math.exp(-ageSeconds * BURST_DECAY),
  };
}
