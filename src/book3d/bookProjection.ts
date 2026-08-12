import * as THREE from "three";
import type { LeafVertex } from "./bend";

export interface PaperFootprint {
  /** Post-physics geometry for a cover currently in flight. */
  activeVertices?: readonly LeafVertex[] | null;
  /** Flat paper that remains on the desk while the cover moves. */
  staticMinX: number;
  staticMaxX: number;
  pageHeight: number;
  activeZOffset?: number;
}

interface BookPaperFootprintInput {
  currentSpread: number;
  activeCoverSheet: number | null;
  activeVertices: readonly LeafVertex[] | null;
  totalSpreads: number;
  pageWidth: number;
  pageHeight: number;
}

const projectedPoint = new THREE.Vector3();

export function isBoundaryCoverSheet(
  sheet: number | null,
  totalSpreads: number,
): boolean {
  return sheet === 0 || sheet === totalSpreads - 2;
}

/**
 * Describe the paper that determines the magazine's visible horizontal span.
 * A moving front/back cover is paired with the static stack on the other side;
 * otherwise the resting cover or full spread supplies the footprint.
 */
export function bookPaperFootprint({
  currentSpread,
  activeCoverSheet,
  activeVertices,
  totalSpreads,
  pageWidth,
  pageHeight,
}: BookPaperFootprintInput): PaperFootprint {
  if (activeVertices && activeCoverSheet === 0) {
    return {
      activeVertices,
      staticMinX: 0,
      staticMaxX: pageWidth,
      pageHeight,
      activeZOffset: 0.4,
    };
  }
  if (activeVertices && activeCoverSheet === totalSpreads - 2) {
    return {
      activeVertices,
      staticMinX: -pageWidth,
      staticMaxX: 0,
      pageHeight,
      activeZOffset: 0.4,
    };
  }

  return {
    staticMinX: currentSpread === 0 ? 0 : -pageWidth,
    staticMaxX: currentSpread === totalSpreads - 1 ? 0 : pageWidth,
    pageHeight,
  };
}

/** Center of the rendered paper silhouette in normalized screen coordinates. */
export function projectedPaperCenterX(
  group: THREE.Group,
  camera: THREE.Camera,
  footprint: PaperFootprint,
): number {
  // Updating only ancestors and this object avoids walking the entire rendered
  // book several times per frame.
  group.updateWorldMatrix(true, false);
  camera.updateWorldMatrix(true, false);

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  const include = (x: number, y: number, z: number) => {
    projectedPoint
      .set(x, y, z)
      .applyMatrix4(group.matrixWorld)
      .project(camera);
    minX = Math.min(minX, projectedPoint.x);
    maxX = Math.max(maxX, projectedPoint.x);
  };

  const activeZOffset = footprint.activeZOffset ?? 0;
  for (const vertex of footprint.activeVertices ?? []) {
    include(vertex.x, vertex.y, vertex.z + activeZOffset);
  }

  const halfHeight = footprint.pageHeight / 2;
  include(footprint.staticMinX, -halfHeight, 0);
  include(footprint.staticMinX, halfHeight, 0);
  include(footprint.staticMaxX, -halfHeight, 0);
  include(footprint.staticMaxX, halfHeight, 0);
  return (minX + maxX) / 2;
}

/**
 * Solve the group x position whose actual projected paper silhouette is
 * centered. Two Newton steps cover perspective and changes in the extremal
 * curl vertex while remaining directly coupled to the user's gesture.
 */
export function solveProjectedPaperShift(
  group: THREE.Group,
  camera: THREE.Camera,
  footprint: PaperFootprint,
  initialShift: number,
): number {
  let shift = initialShift;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    group.position.x = shift;
    const center = projectedPaperCenterX(group, camera, footprint);
    if (Math.abs(center) < 1e-6) break;

    group.position.x = shift + 1;
    const shiftedCenter = projectedPaperCenterX(group, camera, footprint);
    const slope = shiftedCenter - center;
    if (Math.abs(slope) < 1e-8) break;
    shift -= center / slope;
  }

  group.position.x = shift;
  group.updateWorldMatrix(true, false);
  return shift;
}
