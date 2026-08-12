import { describe, expect, it } from "vitest";
import {
  RIFFLE_LEAF_DURATION,
  crossedSheets,
  createRiffleTransition,
  riffleDuration,
  riffleLeafCompletion,
  riffleLeafProgress,
  riffleStackCounts,
  sampleRiffleSheets,
} from "@/magazine/riffle";

describe("fast riffle planning", () => {
  it("maps forward and backward spreads to exact physical sheet boundaries", () => {
    expect(crossedSheets(1, 6)).toEqual([1, 2, 3, 4, 5]);
    expect(crossedSheets(6, 1)).toEqual([5, 4, 3, 2, 1]);
    expect(crossedSheets(3, 3)).toEqual([]);
  });

  it("samples long jumps without losing order or either endpoint", () => {
    const forward = sampleRiffleSheets([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const backward = sampleRiffleSheets([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(forward).toEqual([0, 2, 5, 7, 9]);
    expect(backward).toEqual([9, 7, 4, 2, 0]);
    expect(new Set(forward).size).toBe(forward.length);
    expect(new Set(backward).size).toBe(backward.length);
  });

  it("uses a burst only when two or more sheets are crossed", () => {
    expect(createRiffleTransition(1, 1)).toBeNull();
    expect(createRiffleTransition(1, 2)).toBeNull();
    expect(createRiffleTransition(1, 3)).toMatchObject({
      from: 1,
      to: 3,
      sheets: [1, 2],
    });
  });

  it("stays bounded and mirrors forward timing for backward pages", () => {
    const total = riffleDuration(5);
    expect(riffleLeafCompletion(0, 0)).toBe(0);
    expect(riffleLeafCompletion(total, 4)).toBe(1);
    expect(riffleLeafProgress(0, 0, 1)).toBe(0);
    expect(riffleLeafProgress(0, 0, -1)).toBe(1);
    expect(riffleLeafProgress(total, 4, 1)).toBe(1);
    expect(riffleLeafProgress(total, 4, -1)).toBe(0);

    for (let ordinal = 0; ordinal < 5; ordinal += 1) {
      let previous = 0;
      for (let step = 0; step <= 20; step += 1) {
        const completion = riffleLeafCompletion((total * step) / 20, ordinal);
        expect(completion).toBeGreaterThanOrEqual(previous);
        expect(completion).toBeGreaterThanOrEqual(0);
        expect(completion).toBeLessThanOrEqual(1);
        previous = completion;
      }
    }

    expect(riffleDuration(1)).toBe(RIFFLE_LEAF_DURATION);
  });

  it("conserves every leaf between static stacks and the flying packet", () => {
    const totalLeaves = 10;
    for (let from = 0; from <= totalLeaves; from += 1) {
      for (let to = 0; to <= totalLeaves; to += 1) {
        if (from === to) continue;
        const counts = riffleStackCounts(totalLeaves, { from, to });
        expect(counts.left).toBeGreaterThanOrEqual(0);
        expect(counts.right).toBeGreaterThanOrEqual(0);
        expect(counts.left + counts.right + counts.flying).toBe(totalLeaves);
      }
    }
  });
});
