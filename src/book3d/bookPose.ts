export interface BookPoseInput {
  posed: number;
  pointerX: number;
  pointerY: number;
  /** False only before a mouse has interacted with the stage. */
  pointerActive: boolean;
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

export interface BookPointerFrameInput {
  viewportCenterX: number;
  viewportCenterY: number;
  /** Current world-space shift of the book's spine. */
  shift: number;
  pageWidth: number;
  pageHeight: number;
  /** Which paper is currently visible: a full spread or one closed cover. */
  visible: "spread" | "left" | "right";
}

const POSE_YAW = -0.3;
const POSE_PITCH = 0.16;
const POINTER_YAW = 0.3;
const POINTER_PITCH = 0.2;

const clamp = (value: number) => Math.min(1, Math.max(-1, value));
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Closed covers occupy only one side of the spine, so their resting book
 * center is half a page away from the center of an open spread. */
export function bookRestingShift(
  spread: number,
  totalSpreads: number,
  pageWidth: number,
): number {
  if (spread === 0) return -pageWidth / 2;
  if (spread === totalSpreads - 1) return pageWidth / 2;
  return 0;
}

/**
 * Couple the book center to a boundary cover's physical flip progress.
 *
 * Sheet progress has the same meaning in either direction (0 = on the right,
 * 1 = on the left), so this also follows reverse drags and canceled turns
 * without starting a second animation. Interior sheets return null because a
 * full spread is already centered on both sides of their turn.
 */
export function bookCoverTurnShift(
  sheet: number,
  progress: number,
  totalSpreads: number,
  pageWidth: number,
): number | null {
  const clampedProgress = clamp01(progress);
  if (sheet === 0) {
    return -pageWidth / 2 + (pageWidth / 2) * clampedProgress;
  }
  if (sheet === totalSpreads - 2) {
    return (pageWidth / 2) * clampedProgress;
  }
  return null;
}

/** Long jumps share the same centering choreography as a hand-driven cover.
 * Smoothstep softens the otherwise-linear riffle clock at both endpoints. */
export function bookRiffleShift(
  from: number,
  to: number,
  progress: number,
  totalSpreads: number,
  pageWidth: number,
): number {
  const linear = clamp01(progress);
  const eased = linear * linear * (3 - 2 * linear);
  const start = bookRestingShift(from, totalSpreads, pageWidth);
  const end = bookRestingShift(to, totalSpreads, pageWidth);
  return start + (end - start) * eased;
}

/** The visible paper's screen-space frame. Closed covers occupy one side of
    the spine, so treating the spine as their center biases pointer input to a
    single direction. Keep the grab padding separate from this frame so the
    actual paper edges still reach the full -1..1 tilt range. */
export function bookPointerFrame(input: BookPointerFrameInput) {
  const singlePage = input.visible !== "spread";
  const pageOffset =
    input.visible === "right"
      ? input.pageWidth / 2
      : input.visible === "left"
        ? -input.pageWidth / 2
        : 0;
  return {
    centerX: input.viewportCenterX + input.shift + pageOffset,
    centerY: input.viewportCenterY,
    halfWidth: singlePage ? input.pageWidth / 2 : input.pageWidth,
    halfHeight: input.pageHeight / 2,
  };
}

/** Pointer coordinates local to the visible book, not the whole viewport. */
export function normalizeBookPointer(input: PointerInput) {
  return {
    x: clamp((input.x - input.centerX) / input.halfWidth),
    y: clamp((input.y - input.centerY) / input.halfHeight),
  };
}

/** True when a viewport point sits on the book (or its grab margin). The same
    rect that flattens the pose on hover also accepts a page pull, so anywhere
    the book responds to the pointer is also a place it can be grabbed. */
export function withinBookRegion(input: PointerInput): boolean {
  return (
    Math.abs(input.x - input.centerX) < input.halfWidth &&
    Math.abs(input.y - input.centerY) < input.halfHeight
  );
}

/**
 * The flat reading state stays an exact endpoint so the DOM handoff lands on
 * zero rotation. After the first pointer input, everywhere short of flat —
 * including the full display stance — the book turns toward the pointer on
 * both axes instead of freezing in one three-quarter view.
 */
export function bookPoseAngles(input: BookPoseInput) {
  const posed = Math.min(1, Math.max(0, input.posed));
  const pointerX = clamp(input.pointerX);
  const pointerY = clamp(input.pointerY);
  const pointerGain = input.pointerActive
    ? Math.max(posed, Math.sin(Math.PI * posed))
    : 0;
  // The three-quarter stance is an arrival pose, not a permanent offset. Once
  // a pointer interacts, the centered cursor pose replaces it completely so
  // even small horizontal/vertical movements remain independent and balanced.
  const stanceGain = input.pointerActive ? 0 : posed;
  return {
    yaw:
      POSE_YAW * stanceGain +
      pointerX * POINTER_YAW * pointerGain +
      input.breathe,
    pitch:
      POSE_PITCH * stanceGain -
      0.055 * input.airborne -
      pointerY * POINTER_PITCH * pointerGain,
  };
}
