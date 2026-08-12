import { describe, expect, it } from "vitest";
import {
  bookPointerFrame,
  bookPoseAngles,
  normalizeBookPointer,
  withinBookRegion,
} from "../src/book3d/bookPose";

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
      pointerActive: true,
      airborne: 0,
      breathe: 0,
    });
    const rightBottom = bookPoseAngles({
      posed: 0.5,
      pointerX: 1,
      pointerY: 1,
      pointerActive: true,
      airborne: 0,
      breathe: 0,
    });

    expect(leftTop.yaw).toBeLessThan(0);
    expect(rightBottom.yaw).toBeGreaterThan(0);
    expect(leftTop.pitch).toBeGreaterThan(0);
    expect(rightBottom.pitch).toBeLessThan(0);
  });

  it("tilts equally in every direction from the full display pose", () => {
    const input = { posed: 1, pointerActive: true, airborne: 0, breathe: 0 };
    const left = bookPoseAngles({ ...input, pointerX: -1, pointerY: 0 });
    const right = bookPoseAngles({ ...input, pointerX: 1, pointerY: 0 });
    const top = bookPoseAngles({ ...input, pointerX: 0, pointerY: -1 });
    const bottom = bookPoseAngles({ ...input, pointerX: 0, pointerY: 1 });

    expect(left.yaw).toBeLessThan(0);
    expect(right.yaw).toBeGreaterThan(0);
    expect(left.yaw).toBeCloseTo(-right.yaw, 6);
    expect(top.pitch).toBeGreaterThan(0);
    expect(bottom.pitch).toBeLessThan(0);
    expect(top.pitch).toBeCloseTo(-bottom.pitch, 6);
  });

  it("reaches right and down without requiring an extreme cursor position", () => {
    const rightDown = bookPoseAngles({
      posed: 1,
      pointerX: 0.25,
      pointerY: 0.25,
      pointerActive: true,
      airborne: 0,
      breathe: 0,
    });

    expect(rightDown.yaw).toBeGreaterThan(0);
    expect(rightDown.pitch).toBeLessThan(0);
  });

  it("keeps small horizontal and vertical movements independent", () => {
    const common = { posed: 1, pointerActive: true, airborne: 0, breathe: 0 };
    const right = bookPoseAngles({ ...common, pointerX: 0.05, pointerY: 0 });
    const down = bookPoseAngles({ ...common, pointerX: 0, pointerY: 0.05 });

    expect(right.yaw).toBeGreaterThan(0);
    expect(right.pitch).toBe(0);
    expect(down.yaw).toBe(0);
    expect(down.pitch).toBeLessThan(0);
  });

  it("keeps the three-quarter stance only before pointer interaction", () => {
    const idle = bookPoseAngles({
      posed: 1,
      pointerX: 0,
      pointerY: 0,
      pointerActive: false,
      airborne: 0,
      breathe: 0,
    });
    const interactive = bookPoseAngles({
      posed: 1,
      pointerX: 0,
      pointerY: 0,
      pointerActive: true,
      airborne: 0,
      breathe: 0,
    });

    expect(idle.yaw).toBeLessThan(0);
    expect(idle.pitch).toBeGreaterThan(0);
    expect(interactive).toEqual({ yaw: 0, pitch: 0 });
  });

  it("centers pointer input on the visible paper for closed covers", () => {
    const common = {
      viewportCenterX: 500,
      viewportCenterY: 300,
      pageWidth: 200,
      pageHeight: 300,
    };
    const cover = bookPointerFrame({ ...common, shift: -100, visible: "right" });
    const spread = bookPointerFrame({ ...common, shift: 0, visible: "spread" });
    const back = bookPointerFrame({ ...common, shift: 100, visible: "left" });

    expect(cover).toEqual({
      centerX: 500,
      centerY: 300,
      halfWidth: 100,
      halfHeight: 150,
    });
    expect(spread).toEqual({
      centerX: 500,
      centerY: 300,
      halfWidth: 200,
      halfHeight: 150,
    });
    expect(back).toEqual(cover);
    expect(normalizeBookPointer({ x: 400, y: 300, ...cover })).toEqual({
      x: -1,
      y: 0,
    });
    expect(normalizeBookPointer({ x: 600, y: 300, ...cover })).toEqual({
      x: 1,
      y: 0,
    });
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
      pointerActive: true,
      airborne: 0,
      breathe: 0,
    });

    expect(flat.yaw).toBe(0);
    expect(flat.pitch).toBe(0);
  });
});
