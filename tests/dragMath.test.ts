import { describe, expect, it } from "vitest";
import { VELOCITY_BIAS } from "@/magazine/engine";
import {
  DRAG_SPAN,
  ENGAGE_PX,
  dragProgress,
  edgeForDelta,
  flickVelocity,
  shouldEngage,
} from "@/single/dragMath";

describe("turning a swipe into a page turn", () => {
  it("ignores a tap and a scroll, engages on a horizontal pull", () => {
    expect(shouldEngage(4, 1)).toBe(false); // a tap that wobbled
    expect(shouldEngage(40, 60)).toBe(false); // reading down the page
    expect(shouldEngage(-40, 4)).toBe(true); // a thumb going back
    expect(shouldEngage(ENGAGE_PX, 0)).toBe(false); // threshold is exclusive
  });

  it("a diagonal swipe belongs to the browser, not the paper", () => {
    // Equal parts across and down: ambiguous, so the scroll wins.
    expect(shouldEngage(50, 50)).toBe(false);
    expect(shouldEngage(50, 30)).toBe(true);
  });

  it("pulling left turns toward the back of the issue", () => {
    expect(edgeForDelta(-30)).toBe("fore");
    expect(edgeForDelta(30)).toBe("back");
  });

  it("maps a full-span pull to a whole turn, from either resting side", () => {
    const width = 366;
    const span = width * DRAG_SPAN;

    // Forward: a sheet lying right, dragged left.
    expect(dragProgress(0, 300, 300 - span, width)).toBeCloseTo(1, 5);
    expect(dragProgress(0, 300, 300 - span / 2, width)).toBeCloseTo(0.5, 5);
    // Backward: a sheet already flipped left, dragged right.
    expect(dragProgress(1, 60, 60 + span, width)).toBeCloseTo(0, 5);
  });

  it("clamps rather than letting an overshooting thumb tear the page off", () => {
    const width = 366;
    expect(dragProgress(0, 300, -900, width)).toBe(1);
    expect(dragProgress(0, 300, 900, width)).toBe(0);
  });

  it("survives a zero-width page instead of dividing by it", () => {
    expect(Number.isFinite(dragProgress(0, 10, 0, 0))).toBe(true);
  });

  it("reports flick speed in the px/ms the engine's commit bias is written in", () => {
    // 100px leftward in 100ms = 1 px/ms, comfortably past VELOCITY_BIAS (0.4).
    const flick = flickVelocity([
      { x: 300, t: 0 },
      { x: 200, t: 100 },
    ]);
    expect(flick).toBeCloseTo(1, 5);
    expect(flick).toBeGreaterThan(VELOCITY_BIAS);

    // Rightward is negative, so the engine reads it as a backward fling.
    expect(
      flickVelocity([
        { x: 200, t: 0 },
        { x: 300, t: 100 },
      ]),
    ).toBeCloseTo(-1, 5);
  });

  it("judges a flick by how it ended, not how it began", () => {
    // A slow drag that stops dead should not commit on its early speed.
    const stalled = flickVelocity([
      { x: 300, t: 0 },
      { x: 120, t: 60 },
      { x: 118, t: 200 },
      { x: 118, t: 260 },
    ]);
    expect(Math.abs(stalled)).toBeLessThan(VELOCITY_BIAS);
  });

  it("reads no speed from a gesture with no travel or no time", () => {
    expect(flickVelocity([{ x: 10, t: 5 }])).toBe(0);
    expect(flickVelocity([])).toBe(0);
    expect(
      flickVelocity([
        { x: 10, t: 5 },
        { x: 90, t: 5 },
      ]),
    ).toBe(0);
  });
});
