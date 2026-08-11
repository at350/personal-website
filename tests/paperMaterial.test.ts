import { describe, expect, it } from "vitest";
import { paperTurnActivity } from "../src/book3d/paperMaterial";

describe("moving paper material", () => {
  it("removes lighting response at both landing frames", () => {
    expect(paperTurnActivity(0)).toBe(0);
    expect(paperTurnActivity(1)).toBe(0);
  });

  it("reaches full glossy response while the leaf is airborne", () => {
    expect(paperTurnActivity(0.5)).toBeCloseTo(1, 6);
  });
});
