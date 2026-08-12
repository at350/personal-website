import { describe, expect, it } from "vitest";
import {
  SETTLE_HOLD_MAX,
  SETTLE_PROGRESS_TOLERANCE,
  SETTLE_VELOCITY_TOLERANCE,
  SHEET_REST_ENERGY,
  settleComplete,
} from "../src/book3d/settle";

describe("turn settle gate", () => {
  it("never completes while the spring is still travelling", () => {
    expect(
      settleComplete({
        progressError: 0.2,
        velocity: 0.5,
        sheetEnergy: 0,
        heldFor: 10,
      }),
    ).toBe(false);
  });

  it("waits for the sheet to physically rest, not just the nominal spring", () => {
    // This is the frame the old code swapped to the DOM: progress settled but
    // the paper still waving — gleam and wobble truncated mid-motion.
    expect(
      settleComplete({
        progressError: SETTLE_PROGRESS_TOLERANCE / 2,
        velocity: SETTLE_VELOCITY_TOLERANCE / 2,
        sheetEnergy: SHEET_REST_ENERGY * 6,
        heldFor: 0,
      }),
    ).toBe(false);
  });

  it("completes once both the spring and the sheet are at rest", () => {
    expect(
      settleComplete({
        progressError: 0,
        velocity: 0,
        sheetEnergy: SHEET_REST_ENERGY / 4,
        heldFor: 0,
      }),
    ).toBe(true);
  });

  it("cannot wedge navigation: a restless sheet still lands after the hold cap", () => {
    expect(
      settleComplete({
        progressError: 0,
        velocity: 0,
        sheetEnergy: 1,
        heldFor: SETTLE_HOLD_MAX,
      }),
    ).toBe(true);
  });
});
