/* Pure page-curl math. The leaf is a 2D sheet, not a row of hinges: each
   horizontal strip gets its own turn phase and the strips meet along a
   travelling diagonal crease that is anchored to the recorded grab height.

   World: spine at x=0, page lies in +x at rest, +z toward the viewer, and
   normalized grabY runs from -1 at the bottom edge to +1 at the top edge. */

export interface LeafVertex {
  x: number;
  y: number;
  z: number;
}

export interface LeafColumn {
  x: number;
  z: number;
}

export const LEAF_SEGMENTS = 28;
export const LEAF_ROWS = 16;

/** Peak outward bow, radians. Thin stock carries a broad, shallow arch. */
export const BOW_BASE = 0.36;
export const BOW_VELOCITY_GAIN = 0.56;
/** Tighter curvature toward the free edge supplies the paper-like tip roll. */
export const CURL_BASE = 0.68;

/** The grab point may lead the opposite edge by this much turn progress. */
export const GRAB_PHASE = 0.18;
/** A corner pull still carries this fraction of its turn into the far edge. */
export const GRAB_INFLUENCE_FLOOR = 0.16;
export const GRAB_INFLUENCE_WIDTH = 1.6;
/** Diagonal travel of the crease across the sheet, normalized to page width. */
export const CREASE_SLOPE = 0.12;
/** Small ridge at the crease. This is relief, not a decorative wave. */
export const CREASE_LIFT = 0.026;
export const GRAB_CURL_GAIN = 0.68;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Column positions for one horizontal strip of the leaf. This remains
 * exported because it is a useful neutral (mid-edge) curl primitive.
 */
export function leafColumns(
  progress: number,
  pageWidth: number,
  velocity = 0,
  segments = LEAF_SEGMENTS,
  curlScale = 1,
): LeafColumn[] {
  const p = clamp01(progress);
  const theta = p * Math.PI;
  const drive = Math.min(Math.abs(velocity) * BOW_VELOCITY_GAIN, 0.28);
  const bow = Math.sin(theta) * (BOW_BASE + drive);
  const curl = Math.sin(theta) * CURL_BASE * curlScale;
  const length = pageWidth / segments;
  const out: LeafColumn[] = [{ x: 0, z: 0 }];
  let x = 0;
  let z = 0;

  for (let column = 0; column < segments; column += 1) {
    const u = (column + 0.5) / segments;
    const angle = theta + bow * Math.sin(Math.PI * u) + curl * u * u;
    x += length * Math.cos(-angle);
    z += length * Math.sin(-angle) * -1;
    out.push({ x, z });
  }

  return out;
}

/**
 * Vertex positions in Three.js PlaneGeometry order: rows top-to-bottom,
 * columns spine-to-fore-edge. `direction` is +1 for right-to-left turns and
 * -1 for left-to-right turns, so the grabbed row leads in both directions.
 */
export function leafSurface(
  progress: number,
  pageWidth: number,
  pageHeight: number,
  velocity = 0,
  grabY = 0,
  direction: 1 | -1 = 1,
  segments = LEAF_SEGMENTS,
  rows = LEAF_ROWS,
): LeafVertex[] {
  const p = clamp01(progress);
  const grab = Math.min(1, Math.max(-1, grabY));
  const grabMagnitude = Math.abs(grab);
  const activity = Math.sin(Math.PI * p);
  const vertices: LeafVertex[] = [];

  for (let row = 0; row <= rows; row += 1) {
    const v = 1 - (row / rows) * 2;
    const distanceFromGrab = v - grab;
    const grabWeight = Math.exp(
      -(distanceFromGrab * distanceFromGrab) / GRAB_INFLUENCE_WIDTH,
    );
    const grabInfluence =
      GRAB_INFLUENCE_FLOOR + (1 - GRAB_INFLUENCE_FLOOR) * grabWeight;

    // The grabbed row leads, but influence never falls to zero at the far
    // edge. Thin paper transmits a pull through the whole sheet instead of
    // leaving the ungrabbed half parked on the stack.
    const phase =
      direction * activity * GRAB_PHASE * grabMagnitude * grabInfluence;
    const rowProgress = clamp01(p + phase);
    const curlScale =
      1 +
      GRAB_CURL_GAIN *
        grabMagnitude *
        (0.35 + 0.65 * grabInfluence);
    const columns = leafColumns(
      rowProgress,
      pageWidth,
      velocity,
      segments,
      curlScale,
    );

    // The crease travels from fore-edge to spine on a forward turn. Its
    // diagonal reverses on a backward turn while still passing the grab row.
    const creaseCenter = clamp01(
      1 - p - direction * grab * distanceFromGrab * CREASE_SLOPE,
    );
    const rowLift =
      (1 - grabMagnitude) +
      grabMagnitude * (0.62 + 0.38 * grabInfluence);
    const y = (v * pageHeight) / 2;

    for (let column = 0; column <= segments; column += 1) {
      const u = column / segments;
      const creaseDistance = (u - creaseCenter) / 0.075;
      const crease =
        Math.exp(-(creaseDistance * creaseDistance)) *
        activity *
        pageWidth *
        CREASE_LIFT *
        rowLift;
      const point = columns[column]!;
      vertices.push({ x: point.x, y, z: point.z + crease });
    }
  }

  return vertices;
}

/** True while any part of the leaf is meaningfully off the stacks. */
export const leafAirborne = (p: number) => p > 0.002 && p < 0.998;
