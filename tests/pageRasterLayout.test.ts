import { describe, expect, it } from "vitest";
import {
  CAPTURE_H,
  CAPTURE_W,
  capturePixelRatio,
  pageRasterLayout,
} from "../src/book3d/pageTextures";

describe("live page and texture geometry", () => {
  it("renders live HTML at capture size and scales it to the visible page", () => {
    const visibleWidth = 475.2;
    const layout = pageRasterLayout(visibleWidth);

    expect(layout.pageWidth).toBe(CAPTURE_W);
    expect(layout.pageHeight).toBe(CAPTURE_H);
    expect(layout.spreadWidth).toBe(CAPTURE_W * 2);
    expect(layout.scale).toBeCloseTo(visibleWidth / CAPTURE_W, 8);
    expect(layout.pageWidth * layout.scale).toBeCloseTo(visibleWidth, 8);
    expect(layout.pageHeight * layout.scale).toBeCloseTo(633.6, 8);
  });

  it("captures at the exact on-screen device-pixel footprint", () => {
    // A texture that holds more pixels than the page occupies on screen gets
    // GPU-minified at rest — the settled WebGL page reads softer and grayer
    // than its DOM twin, so the handoff pops like a refresh. The capture
    // ratio must map the texture 1:1 onto the displayed page.
    const visibleWidth = 475.2;
    expect(capturePixelRatio(visibleWidth, 2)).toBeCloseTo(
      (visibleWidth * 2) / CAPTURE_W,
      8,
    );
    expect(capturePixelRatio(visibleWidth, 1)).toBeCloseTo(
      visibleWidth / CAPTURE_W,
      8,
    );
  });

  it("bounds the capture ratio to the canvas's own pixel budget", () => {
    // The WebGL canvas renders at dpr ≤ 2, so sharper captures are waste.
    expect(capturePixelRatio(CAPTURE_W, 3)).toBe(2);
    // Degenerate viewports still capture something legible…
    expect(capturePixelRatio(100, 1)).toBe(0.5);
    // …and enormous ones cannot balloon texture memory.
    expect(capturePixelRatio(4000, 2)).toBe(3);
  });
});
