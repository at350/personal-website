import { describe, expect, it } from "vitest";
import {
  FLIP_VALUE_TOLERANCE,
  MAX_STEP_SECONDS,
  springAtRest,
  stepSpring,
  type SpringState,
} from "@/single/flipSpring";

const FRAME = 1 / 60;

/** Run the spring until it lands, returning the path it took. */
function settle(from: SpringState, target: number, maxFrames = 600) {
  const path = [from.value];
  let state = from;
  for (let frame = 0; frame < maxFrames; frame += 1) {
    state = stepSpring(state, target, FRAME);
    path.push(state.value);
    if (springAtRest(state, target)) return { state, path, frames: frame + 1 };
  }
  return { state, path, frames: Number.POSITIVE_INFINITY };
}

describe("the single-page settle", () => {
  it("commits a released page to flat from either side", () => {
    const forward = settle({ value: 0.62, velocity: 0 }, 1);
    const backward = settle({ value: 0.4, velocity: 0 }, 0);

    expect(forward.state.value).toBeCloseTo(1, 2);
    expect(backward.state.value).toBeCloseTo(0, 2);
  });

  it("never overshoots — paper that bounces past flat reads as rubber", () => {
    const { path } = settle({ value: 0, velocity: 0 }, 1);
    for (const value of path) expect(value).toBeLessThanOrEqual(1 + FLIP_VALUE_TOLERANCE);
  });

  it("carries a fling through the settle instead of restarting from rest", () => {
    const thrown = stepSpring({ value: 0.2, velocity: 4 }, 1, FRAME);
    const dropped = stepSpring({ value: 0.2, velocity: 0 }, 1, FRAME);

    expect(thrown.value).toBeGreaterThan(dropped.value);
  });

  it("lands inside the book's own leaf-flight budget, so a turn never floats", () => {
    // 25 frames at 60fps ≈ 420ms, against RIFFLE_LEAF_DURATION's 340ms.
    expect(settle({ value: 0, velocity: 0 }, 1).frames).toBeLessThanOrEqual(25);
  });

  it("sub-steps a long frame rather than flinging the page across it", () => {
    // A backgrounded tab or a slow capture can hand back a half-second frame.
    const long = stepSpring({ value: 0, velocity: 0 }, 1, 0.5);
    const capped = stepSpring({ value: 0, velocity: 0 }, 1, MAX_STEP_SECONDS);

    expect(long).toEqual(capped);
    expect(long.value).toBeLessThan(1);
  });

  it("a zero-length frame changes nothing", () => {
    const state = { value: 0.3, velocity: 2 };
    expect(stepSpring(state, 1, 0)).toBe(state);
  });

  it("is not at rest while it still carries energy through the target", () => {
    // Value matches, but the page is still travelling: releasing here would
    // freeze paper mid-swing.
    expect(springAtRest({ value: 1, velocity: 3 }, 1)).toBe(false);
    expect(springAtRest({ value: 1, velocity: 0 }, 1)).toBe(true);
  });
});
