import { describe, expect, it } from "vitest";
import { handoffOpacity } from "../src/book3d/handoff";

describe("WebGL to DOM handoff", () => {
  it("keeps the DOM hidden while perspective error is still visible", () => {
    expect(
      handoffOpacity({
        turning: false,
        rotationError: 0.004,
        scaleError: 0.001,
        shiftError: 0,
      }),
    ).toBe(0);
  });

  it("reveals the DOM only when the rendered page is subpixel-aligned", () => {
    expect(
      handoffOpacity({
        turning: false,
        rotationError: 0.0002,
        scaleError: 0.00008,
        shiftError: 0.08,
      }),
    ).toBeGreaterThan(0.95);
  });

  it("never reveals the DOM while a leaf is moving", () => {
    expect(
      handoffOpacity({
        turning: true,
        rotationError: 0,
        scaleError: 0,
        shiftError: 0,
      }),
    ).toBe(0);
  });

  it("never blends two independently rendered page layers", () => {
    expect([
      0,
      1,
    ]).toContain(
      handoffOpacity({
        turning: false,
        rotationError: 0.0004,
        scaleError: 0.00012,
        shiftError: 0.15,
      }),
    );
  });
});
