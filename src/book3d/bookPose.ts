export interface BookPoseInput {
  posed: number;
  pointerX: number;
  pointerY: number;
  airborne: number;
  breathe: number;
}

interface PointerInput {
  x: number;
  y: number;
  centerX: number;
  centerY: number;
  halfWidth: number;
  halfHeight: number;
}

const POSE_YAW = -0.3;
const POSE_PITCH = 0.16;
const POINTER_YAW = 0.22;
const POINTER_PITCH = 0.18;

const clamp = (value: number) => Math.min(1, Math.max(-1, value));

/** Pointer coordinates local to the visible book, not the whole viewport. */
export function normalizeBookPointer(input: PointerInput) {
  return {
    x: clamp((input.x - input.centerX) / input.halfWidth),
    y: clamp((input.y - input.centerY) / input.halfHeight),
  };
}

/**
 * The resting stance and flat reading state remain exact endpoints. Between
 * them, the book arcs toward the pointer so entering from any side produces a
 * distinct approach instead of the same bottom-left tilt every time.
 */
export function bookPoseAngles(input: BookPoseInput) {
  const posed = Math.min(1, Math.max(0, input.posed));
  const hoverArc = Math.sin(Math.PI * posed);
  return {
    yaw:
      POSE_YAW * posed +
      clamp(input.pointerX) * POINTER_YAW * hoverArc +
      input.breathe,
    pitch:
      POSE_PITCH * posed -
      0.055 * input.airborne -
      clamp(input.pointerY) * POINTER_PITCH * hoverArc,
  };
}
