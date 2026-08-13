export interface CursorFlameMotion {
  x: number;
  y: number;
  speed: number;
}

export interface CursorFlameBodyState {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

export interface CursorFlameBottomResponse {
  pressure: number;
  bodyBiasY: number;
}

const MAX_POINTER_SPEED = 2_400;
const DIRECTION_RESPONSE_SPEED = 430;
const ENERGY_RESPONSE_SPEED = 380;
// Fast enough to feel attached to the hand, but still leaves a short gaseous
// wake instead of welding the whole plume to the exact pointer pixel.
const BODY_NATURAL_FREQUENCY = 34;
const MAX_FRAME_DELTA = 0.05;
const BOTTOM_RESPONSE_DISTANCE = 90;
const MAX_BOTTOM_BODY_BIAS = 70;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Maps pointer velocity into a perceptual flame response. The tanh curve makes
 * ordinary mouse movement legible while still absorbing trackpad and gaming
 * mouse outliers without a hard visual speed step.
 */
export function cursorFlameMotion(
  velocityX: number,
  velocityY: number,
): CursorFlameMotion {
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
 * Bends the gaseous body upward as the exact pointer contact approaches the
 * physical bottom framebuffer edge. Positive bodyBiasY is shader-local up.
 */
export function cursorFlameBottomResponse(
  pointerY: number,
  viewportHeight: number,
): CursorFlameBottomResponse {
  const distanceToBottom = Math.max(0, viewportHeight - pointerY);
  const linearPressure = clamp(
    1 - distanceToBottom / BOTTOM_RESPONSE_DISTANCE,
    0,
    1,
  );
  const pressure = linearPressure * linearPressure *
    (3 - 2 * linearPressure);

  return {
    pressure,
    bodyBiasY: pressure * MAX_BOTTOM_BODY_BIAS,
  };
}

/**
 * Advances the gaseous plume independently of its exact pointer contact using
 * the closed-form critically damped spring solution. It reaches roughly 85%
 * of a step in 100 ms without rubber-band overshoot, then settles to within 1%
 * in about 200 ms. The analytic update is deterministic across frame rates.
 */
export function stepCursorFlameBody(
  state: CursorFlameBodyState,
  targetX: number,
  targetY: number,
  deltaSeconds: number,
): CursorFlameBodyState {
  const safeDelta = clamp(deltaSeconds, 0, MAX_FRAME_DELTA);
  if (safeDelta === 0) return { ...state };

  const decay = Math.exp(-BODY_NATURAL_FREQUENCY * safeDelta);
  const offsetX = state.x - targetX;
  const offsetY = state.y - targetY;
  const responseX = state.velocityX +
    BODY_NATURAL_FREQUENCY * offsetX;
  const responseY = state.velocityY +
    BODY_NATURAL_FREQUENCY * offsetY;

  return {
    x: targetX +
      (offsetX + responseX * safeDelta) * decay,
    y: targetY +
      (offsetY + responseY * safeDelta) * decay,
    velocityX: (
      state.velocityX -
      BODY_NATURAL_FREQUENCY * responseX * safeDelta
    ) * decay,
    velocityY: (
      state.velocityY -
      BODY_NATURAL_FREQUENCY * responseY * safeDelta
    ) * decay,
  };
}
