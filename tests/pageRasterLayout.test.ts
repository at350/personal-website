import { describe, expect, it } from "vitest";
import {
  CAPTURE_H,
  CAPTURE_W,
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
});
