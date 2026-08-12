import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { leafSurface } from "../src/book3d/bend";
import {
  bookPaperFootprint,
  isBoundaryCoverSheet,
  projectedPaperCenterX,
  solveProjectedPaperShift,
} from "../src/book3d/bookProjection";
import { PaperSheet } from "../src/book3d/paperPhysics";

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;
const PAGE_WIDTH = 480;
const PAGE_HEIGHT = 620;
const TOTAL_SPREADS = 11;
const SEGMENTS = 12;
const ROWS = 8;

function makeScene() {
  const camera = new THREE.PerspectiveCamera(
    22,
    VIEWPORT_WIDTH / VIEWPORT_HEIGHT,
    1,
    10_000,
  );
  const distance =
    VIEWPORT_HEIGHT /
    2 /
    Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(0, 0, distance);
  camera.updateProjectionMatrix();

  const group = new THREE.Group();
  group.position.y = 4;
  group.rotation.set(0.14, 0.24, 0);
  group.scale.setScalar(0.996);
  return { camera, group };
}

const centerErrorPx = (
  group: THREE.Group,
  camera: THREE.Camera,
  footprint: ReturnType<typeof bookPaperFootprint>,
) =>
  Math.abs(projectedPaperCenterX(group, camera, footprint)) *
  (VIEWPORT_WIDTH / 2);

function stepSheet(
  sheet: PaperSheet,
  progress: number,
  direction: 1 | -1,
  dragging: boolean,
) {
  const velocity = dragging ? direction * 2.4 : 0;
  return sheet.step(
    leafSurface(
      progress,
      PAGE_WIDTH,
      PAGE_HEIGHT,
      velocity,
      direction === 1 ? 0.76 : -0.68,
      direction,
      SEGMENTS,
      ROWS,
    ),
    {
      dt: 1 / 60,
      dragging,
      grabY: direction === 1 ? 0.76 : -0.68,
      handleOffsetY: dragging ? -18 * direction : 0,
      velocity,
    },
  );
}

describe("projected magazine centering", { timeout: 30_000 }, () => {
  it("identifies both covers without treating an interior sheet as a boundary", () => {
    expect(isBoundaryCoverSheet(0, TOTAL_SPREADS)).toBe(true);
    expect(isBoundaryCoverSheet(TOTAL_SPREADS - 2, TOTAL_SPREADS)).toBe(true);
    expect(isBoundaryCoverSheet(4, TOTAL_SPREADS)).toBe(false);
    expect(isBoundaryCoverSheet(null, TOTAL_SPREADS)).toBe(false);
  });

  it.each([
    {
      name: "front cover",
      sheetIndex: 0,
      startSpread: 0,
      landedSpread: 1,
      startProgress: 0,
      landedProgress: 1,
      direction: 1 as const,
      samples: [0, 0.2, 0.55, 0.82, 0.55, 0.2, 0],
    },
    {
      name: "back cover",
      sheetIndex: TOTAL_SPREADS - 2,
      startSpread: TOTAL_SPREADS - 1,
      landedSpread: TOTAL_SPREADS - 2,
      startProgress: 1,
      landedProgress: 0,
      direction: -1 as const,
      samples: [1, 0.75, 0.4, 0.15, 0.4, 0.75, 1],
    },
  ])(
    "keeps the $name centered through forward motion, reversal, and both endpoints",
    ({
      sheetIndex,
      startSpread,
      landedSpread,
      startProgress,
      landedProgress,
      direction,
      samples,
    }) => {
      const { camera, group } = makeScene();
      const restingFootprint = bookPaperFootprint({
        currentSpread: startSpread,
        activeCoverSheet: null,
        activeVertices: null,
        totalSpreads: TOTAL_SPREADS,
        pageWidth: PAGE_WIDTH,
        pageHeight: PAGE_HEIGHT,
      });
      const restingShift = solveProjectedPaperShift(
        group,
        camera,
        restingFootprint,
        0,
      );

      const sheet = new PaperSheet(
        PAGE_WIDTH,
        PAGE_HEIGHT,
        SEGMENTS,
        ROWS,
      );
      sheet.reset(
        leafSurface(
          startProgress,
          PAGE_WIDTH,
          PAGE_HEIGHT,
          0,
          direction === 1 ? 0.76 : -0.68,
          direction,
          SEGMENTS,
          ROWS,
        ),
      );

      let shift = restingShift;
      for (const progress of samples) {
        const vertices = stepSheet(sheet, progress, direction, true);
        const footprint = bookPaperFootprint({
          currentSpread: startSpread,
          activeCoverSheet: sheetIndex,
          activeVertices: vertices,
          totalSpreads: TOTAL_SPREADS,
          pageWidth: PAGE_WIDTH,
          pageHeight: PAGE_HEIGHT,
        });
        shift = solveProjectedPaperShift(group, camera, footprint, shift);
        expect(centerErrorPx(group, camera, footprint)).toBeLessThanOrEqual(2);
      }

      // A canceled drag must hand back to the same static cover without a
      // landing-frame recenter.
      let canceledVertices = stepSheet(sheet, startProgress, direction, false);
      for (let frame = 1; frame < 180; frame += 1) {
        canceledVertices = stepSheet(sheet, startProgress, direction, false);
      }
      const canceledFootprint = bookPaperFootprint({
        currentSpread: startSpread,
        activeCoverSheet: sheetIndex,
        activeVertices: canceledVertices,
        totalSpreads: TOTAL_SPREADS,
        pageWidth: PAGE_WIDTH,
        pageHeight: PAGE_HEIGHT,
      });
      shift = solveProjectedPaperShift(
        group,
        camera,
        canceledFootprint,
        shift,
      );
      const canceledLandedShift = solveProjectedPaperShift(
        group,
        camera,
        restingFootprint,
        shift,
      );
      expect(Math.abs(shift - canceledLandedShift)).toBeLessThanOrEqual(2);

      // The committed endpoint uses the same projected footprint after the
      // moving leaf unmounts, preventing the old final 25-45px snap.
      const committedSheet = new PaperSheet(
        PAGE_WIDTH,
        PAGE_HEIGHT,
        SEGMENTS,
        ROWS,
      );
      committedSheet.reset(
        leafSurface(
          startProgress,
          PAGE_WIDTH,
          PAGE_HEIGHT,
          0,
          direction === 1 ? 0.76 : -0.68,
          direction,
          SEGMENTS,
          ROWS,
        ),
      );
      let landedVertices = stepSheet(
        committedSheet,
        landedProgress,
        direction,
        false,
      );
      for (let frame = 1; frame < 180; frame += 1) {
        landedVertices = stepSheet(
          committedSheet,
          landedProgress,
          direction,
          false,
        );
      }
      const movingLandedFootprint = bookPaperFootprint({
        currentSpread: startSpread,
        activeCoverSheet: sheetIndex,
        activeVertices: landedVertices,
        totalSpreads: TOTAL_SPREADS,
        pageWidth: PAGE_WIDTH,
        pageHeight: PAGE_HEIGHT,
      });
      shift = solveProjectedPaperShift(
        group,
        camera,
        movingLandedFootprint,
        shift,
      );
      const staticLandedFootprint = bookPaperFootprint({
        currentSpread: landedSpread,
        activeCoverSheet: null,
        activeVertices: null,
        totalSpreads: TOTAL_SPREADS,
        pageWidth: PAGE_WIDTH,
        pageHeight: PAGE_HEIGHT,
      });
      const committedLandedShift = solveProjectedPaperShift(
        group,
        camera,
        staticLandedFootprint,
        shift,
      );
      expect(Math.abs(shift - committedLandedShift)).toBeLessThanOrEqual(2);
    },
  );
});
