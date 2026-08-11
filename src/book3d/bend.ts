/* Pure page-curl math. A turning leaf is a chain of segments hinged at the
   spine; the sheet bows outward while lifting (paper carries a curve, it does
   not rotate as a rigid door). World: spine at x=0, page lies in +x at rest,
   +z toward the viewer. */

export interface LeafColumn {
  x: number;
  z: number;
}

export const LEAF_SEGMENTS = 28;

/** Peak outward bow, radians. Real paper bows more when driven faster. */
export const BOW_BASE = 0.16;
export const BOW_VELOCITY_GAIN = 0.35;

/**
 * Column positions for a leaf at turn progress p (0 = lying right, 1 = lying
 * left). `velocity` (signed, progress/s) deepens the bow while the page moves.
 */
export function leafColumns(
  progress: number,
  pageWidth: number,
  velocity = 0,
  segments = LEAF_SEGMENTS,
): LeafColumn[] {
  const p = Math.min(1, Math.max(0, progress));
  const theta = p * Math.PI;
  // Bow peaks mid-turn and vanishes when the page rests flat on either side.
  const bow =
    Math.sin(theta) *
    (BOW_BASE + Math.min(Math.abs(velocity) * BOW_VELOCITY_GAIN, 0.22));
  const L = pageWidth / segments;
  const out: LeafColumn[] = [{ x: 0, z: 0 }];
  let x = 0;
  let z = 0;
  for (let k = 0; k < segments; k += 1) {
    const u = (k + 0.5) / segments;
    // Segment direction: base rotation plus the bow, which is strongest in
    // the middle of the sheet (a sine arch), pulling the sheet convex toward
    // the side it is leaving.
    const angle = theta + bow * Math.sin(Math.PI * u);
    x += L * Math.cos(-angle);
    z += L * Math.sin(-angle) * -1; // lift toward +z
    out.push({ x, z });
  }
  return out;
}

/** True while any part of the leaf is meaningfully off the stacks. */
export const leafAirborne = (p: number) => p > 0.002 && p < 0.998;
