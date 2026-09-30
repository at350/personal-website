import { afterEach, describe, expect, it } from "vitest";
import { canvasLooksBlank } from "@/book3d/pageTextures";

/* canvasLooksBlank samples through an OffscreenCanvas probe when it exists. */

interface Copy { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }

function installProbe(pixel: (copy: Copy) => number[]) {
  const copies: Copy[] = [];
  const state = { smoothing: undefined as boolean | undefined, size: [0, 0] };
  class FakeOffscreenCanvas {
    constructor(w: number, h: number) {
      state.size = [w, h];
    }
    getContext() {
      const ctx = {
        set imageSmoothingEnabled(v: boolean) {
          state.smoothing = v;
        },
        drawImage(_s: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
          copies.push({ sx, sy, sw, sh, dx, dy, dw, dh });
        },
        getImageData(_x: number, _y: number, w: number, h: number) {
          const data = new Uint8ClampedArray(w * h * 4);
          for (const c of copies) data.set(pixel(c), (c.dy * w + c.dx) * 4);
          return { data };
        },
      };
      return ctx;
    }
  }
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = FakeOffscreenCanvas;
  return { copies, state };
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  // The direct-read fallback must never run when the probe works.
  c.getContext = (() => {
    throw new Error("page canvas read directly");
  }) as unknown as typeof c.getContext;
  return c;
}

afterEach(() => {
  delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
});

describe("canvasLooksBlank via OffscreenCanvas probe", () => {
  it("copies the 8×8 grid as 1×1 blits with smoothing off", () => {
    const { copies, state } = installProbe(() => [255, 255, 255, 255]);
    expect(canvasLooksBlank(canvas(80, 160))).toBe(true);
    expect(state.smoothing).toBe(false);
    expect(state.size).toEqual([8, 8]);
    expect(copies).toHaveLength(64);
    expect(copies[0]).toEqual({ sx: 0, sy: 0, sw: 1, sh: 1, dx: 0, dy: 0, dw: 1, dh: 1 });
    expect(copies[9]).toEqual({ sx: 10, sy: 20, sw: 1, sh: 1, dx: 1, dy: 1, dw: 1, dh: 1 });
    expect(copies[63]).toMatchObject({ sx: 70, sy: 140, dx: 7, dy: 7 });
  });

  it("uses a floored step and ceil'd grid for sizes not divisible by 8", () => {
    const { copies, state } = installProbe(() => [255, 255, 255, 255]);
    canvasLooksBlank(canvas(100, 20));
    // step 12 x 2 → ceil(100/12)=9 columns, 10 rows
    expect(state.size).toEqual([9, 10]);
    expect(copies).toHaveLength(90);
    expect(copies.at(-1)).toMatchObject({ sx: 96, sy: 18 });
  });

  it("reports ink in any sample, or a translucent sample, as a real page", () => {
    installProbe((c) => (c.sx === 30 && c.sy === 40 ? [14, 14, 12, 255] : [255, 255, 255, 255]));
    expect(canvasLooksBlank(canvas(80, 80))).toBe(false);
    installProbe((c) => (c.dx === 7 && c.dy === 7 ? [255, 255, 255, 0] : [255, 255, 255, 255]));
    expect(canvasLooksBlank(canvas(80, 80))).toBe(false);
  });
});
