import { describe, expect, it } from "vitest";
import { bookPoseAngles, normalizeBookPointer, withinBookRegion } from "../src/book3d/bookPose";

describe("pointer-driven book pose", () => {
  it("normalizes pointer position around the book instead of the viewport", () => {
    expect(
      normalizeBookPointer({
        x: 250,
        y: 100,
        centerX: 500,
        centerY: 300,
        halfWidth: 250,
        halfHeight: 200,
      }),
    ).toEqual({ x: -1, y: -1 });
    expect(
      normalizeBookPointer({
        x: 750,
        y: 500,
        centerX: 500,
        centerY: 300,
        halfWidth: 250,
        halfHeight: 200,
      }),
    ).toEqual({ x: 1, y: 1 });
  });

  it("arcs toward opposite hover positions in opposite directions", () => {
    const leftTop = bookPoseAngles({
      posed: 0.5,
      pointerX: -1,
      pointerY: -1,
      airborne: 0,
      breathe: 0,
    });
    const rightBottom = bookPoseAngles({
      posed: 0.5,
      pointerX: 1,
      pointerY: 1,
      airborne: 0,
      breathe: 0,
    });

    expect(leftTop.yaw).toBeLessThan(0);
    expect(rightBottom.yaw).toBeGreaterThan(0);
    expect(leftTop.pitch).toBeGreaterThan(0);
    expect(rightBottom.pitch).toBeLessThan(0);
  });

  it("accepts a grab anywhere on the book, not just at the fore edge", () => {
    const book = { centerX: 500, centerY: 300, halfWidth: 250, halfHeight: 200 };
    // Dead center of the spread and the middle of a page both count.
    expect(withinBookRegion({ x: 500, y: 300, ...book })).toBe(true);
    expect(withinBookRegion({ x: 620, y: 350, ...book })).toBe(true);
    // Just inside the grab margin counts; past it does not.
    expect(withinBookRegion({ x: 251, y: 300, ...book })).toBe(true);
    expect(withinBookRegion({ x: 249, y: 300, ...book })).toBe(false);
    expect(withinBookRegion({ x: 500, y: 501, ...book })).toBe(false);
  });

  it("returns to exact pixel alignment at the live DOM handoff", () => {
    const flat = bookPoseAngles({
      posed: 0,
      pointerX: 1,
      pointerY: -1,
      airborne: 0,
      breathe: 0,
    });

    expect(flat.yaw).toBe(0);
    expect(flat.pitch).toBe(0);
  });
});
