import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CAPTURE_FARM_STYLE, canvasLooksBlank } from "@/book3d/pageTextures";

describe("Safari page-texture capture", () => {
  it("keeps the farm in the visual viewport instead of translating it off-screen", () => {
    expect(CAPTURE_FARM_STYLE.left).toBe(0);
    expect(CAPTURE_FARM_STYLE.top).toBe(0);
    expect(CAPTURE_FARM_STYLE.opacity).toBeGreaterThan(0);
    expect(CAPTURE_FARM_STYLE.overflow).toBe("hidden");
    expect(JSON.stringify(CAPTURE_FARM_STYLE)).not.toContain("20000");
  });

  it("treats an all-white canvas as blank and ink as a real page", () => {
    const blank = document.createElement("canvas");
    blank.width = 8;
    blank.height = 8;
    const blankContext = {
      getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    };
    blank.getContext = (() =>
      blankContext) as unknown as typeof blank.getContext;
    expect(canvasLooksBlank(blank)).toBe(true);

    const printed = document.createElement("canvas");
    printed.width = 8;
    printed.height = 8;
    const printedContext = {
      getImageData: () => ({ data: new Uint8ClampedArray([14, 14, 12, 255]) }),
    };
    printed.getContext = (() =>
      printedContext) as unknown as typeof printed.getContext;
    expect(canvasLooksBlank(printed)).toBe(false);
  });

  it("does not inspect a canvas whose 2d context cannot be read", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    canvas.getContext = (() =>
      ({})) as unknown as typeof canvas.getContext;
    expect(canvasLooksBlank(canvas)).toBe(false);
  });
});

describe("lone-page letter geometry", () => {
  it("drops the spine hang when the letter is not in the book", async () => {
    const css = await readFile(
      resolve(process.cwd(), "src/styles/spreads/letter.css"),
      "utf8",
    );
    expect(css).toContain('[data-mode="reader"]');
    expect(css).toContain('[data-mode="single"]');
    expect(css).toContain("padding-left: 8cqw");
    expect(css).toMatch(
      /\.letter:is\(\[data-mode="reader"\],\s*\[data-mode="single"\]\)\s+\.letter__heading\s*\{[^}]*margin-left:\s*0/s,
    );
  });
});

describe("touch-reader Safari CSS", () => {
  it("prefixes the 3D leaf so WebKit keeps back faces hidden", async () => {
    const css = await readFile(
      resolve(process.cwd(), "src/styles/single.css"),
      "utf8",
    );
    expect(css).toContain("-webkit-perspective: 1600px");
    expect(css).toContain("-webkit-transform-style: preserve-3d");
    expect(css).toContain("-webkit-backface-visibility: hidden");
    expect(css).toContain("-webkit-user-select: none");
  });
});
