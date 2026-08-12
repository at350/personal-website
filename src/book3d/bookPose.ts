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
const POINTER_YAW = 0.3;
const POINTER_PITCH = 0.2;

const clamp = (value: number) => Math.min(1, Math.max(-1, value));

/** Pointer coordinates local to the visible book, not the whole viewport. */
export function normalizeBookPointer(input: PointerInput) {
  return {
    x: clamp((input.x - input.centerX) / input.halfWidth),
    y: clamp((input.y - input.centerY) / input.halfHeight),
  };
}

/**
 * The flat reading state stays an exact endpoint so the DOM handoff lands on
 * zero rotation. Everywhere short of flat — including the full display
 * stance — the book turns toward the pointer on both axes, so the object
 * tracks the cursor from any side instead of freezing in one three-quarter
 * view whenever the pointer leaves it.
 */
export function bookPoseAngles(input: BookPoseInput) {
  const posed = Math.min(1, Math.max(0, input.posed));
  const pointerGain = Math.max(posed, Math.sin(Math.PI * posed));
  return {
    yaw:
      POSE_YAW * posed +
      clamp(input.pointerX) * POINTER_YAW * pointerGain +
      input.breathe,
    pitch:
      POSE_PITCH * posed -
      0.055 * input.airborne -
      clamp(input.pointerY) * POINTER_PITCH * pointerGain,
  };
}
