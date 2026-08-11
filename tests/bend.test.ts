import { describe, expect, it } from "vitest";
import {
  LEAF_ROWS,
  LEAF_SEGMENTS,
  leafSurface,
} from "../src/book3d/bend";

const vertexAt = (
  vertices: ReturnType<typeof leafSurface>,
  row: number,
  column: number,
) => vertices[row * (LEAF_SEGMENTS + 1) + column]!;

const tipAngle = (point: { x: number; z: number }) =>
  Math.atan2(point.z, point.x);

describe("2D leaf surface", () => {
  it("matches the configured sheet topology", () => {
    const vertices = leafSurface(0.4, 100, 140);
    expect(vertices).toHaveLength((LEAF_SEGMENTS + 1) * (LEAF_ROWS + 1));
    expect(vertexAt(vertices, 0, 0).y).toBeCloseTo(70);
    expect(vertexAt(vertices, LEAF_ROWS, 0).y).toBeCloseTo(-70);
  });

  it("keeps a mid-edge grab even from top to bottom", () => {
    const vertices = leafSurface(0.42, 100, 140, 0.2, 0, 1);
    const top = vertexAt(vertices, 0, LEAF_SEGMENTS);
    const middle = vertexAt(vertices, LEAF_ROWS / 2, LEAF_SEGMENTS);
    const bottom = vertexAt(vertices, LEAF_ROWS, LEAF_SEGMENTS);

    expect(top.x).toBeCloseTo(middle.x, 6);
    expect(top.z).toBeCloseTo(middle.z, 6);
    expect(bottom.x).toBeCloseTo(middle.x, 6);
    expect(bottom.z).toBeCloseTo(middle.z, 6);
  });

  it("lets the grabbed top corner lead a forward turn", () => {
    const vertices = leafSurface(0.42, 100, 140, 0.2, 1, 1);
    const top = vertexAt(vertices, 0, LEAF_SEGMENTS);
    const bottom = vertexAt(vertices, LEAF_ROWS, LEAF_SEGMENTS);

    expect(tipAngle(top)).toBeGreaterThan(tipAngle(bottom));
  });

  it("carries the far edge into a corner pull instead of leaving it rigid", () => {
    const vertices = leafSurface(0.25, 100, 140, 0, 1, 1);
    const grabbedTop = vertexAt(vertices, 0, LEAF_SEGMENTS);
    const farBottom = vertexAt(vertices, LEAF_ROWS, LEAF_SEGMENTS);

    // The corner still leads, but the opposite edge must participate in the
    // turn instead of remaining close to its flat starting angle.
    expect(tipAngle(farBottom)).toBeGreaterThan(tipAngle(grabbedTop) * 0.55);
  });

  it("reverses the corner lead on a backward turn", () => {
    const vertices = leafSurface(0.58, 100, 140, -0.2, 1, -1);
    const top = vertexAt(vertices, 0, LEAF_SEGMENTS);
    const bottom = vertexAt(vertices, LEAF_ROWS, LEAF_SEGMENTS);

    expect(tipAngle(top)).toBeLessThan(tipAngle(bottom));
  });

  it("lies flat at both stacks regardless of grab height", () => {
    for (const progress of [0, 1]) {
      const vertices = leafSurface(progress, 100, 140, 0, 1, 1);
      const top = vertexAt(vertices, 0, LEAF_SEGMENTS);
      const bottom = vertexAt(vertices, LEAF_ROWS, LEAF_SEGMENTS);
      expect(top.x).toBeCloseTo(bottom.x, 6);
      expect(top.z).toBeCloseTo(bottom.z, 6);
    }
  });
});
