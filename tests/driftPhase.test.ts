import { describe, expect, it } from "vitest";
import {
  DRIFT_ANIMATION,
  NO_DRIFT,
  driftBlit,
  driftFractions,
  driftPhase,
  driftTracks,
  hasDrift,
} from "@/book3d/driftPhase";

/**
 * These fractions decide what the WebGL still is redrawn to at the moment it
 * replaces the live wall. A wrong one is not a rounding error — it is the
 * plate-sized jump this whole mechanism exists to remove — so the reversed
 * column and the wrap at the loop boundary are pinned explicitly.
 */

const track = (
  animations: { name: string; currentTime: number; duration: number; direction?: string }[],
): HTMLElement =>
  ({
    getAnimations: () =>
      animations.map(
        (spec) =>
          ({
            animationName: spec.name,
            currentTime: spec.currentTime,
            effect: {
              getTiming: () => ({
                duration: spec.duration,
                direction: spec.direction ?? "normal",
              }),
            },
          }) as unknown as Animation,
      ),
  }) as unknown as HTMLElement;

describe("driftFractions", () => {
  it("reports progress through one loop", () => {
    const el = track([
      { name: DRIFT_ANIMATION, currentTime: 7_750, duration: 31_000 },
    ]);
    expect(driftFractions([el])).toEqual([0.25]);
  });

  it("wraps past the end of the loop instead of running away", () => {
    // An infinite animation's currentTime keeps climbing forever.
    const el = track([
      { name: DRIFT_ANIMATION, currentTime: 31_000 * 4 + 15_500, duration: 31_000 },
    ]);
    expect(driftFractions([el])).toEqual([0.5]);
  });

  it("mirrors a reversed column so the number always means distance", () => {
    // The middle column runs the same keyframe backwards; a quarter of the way
    // through its cycle it has travelled three quarters of the distance.
    const el = track([
      {
        name: DRIFT_ANIMATION,
        currentTime: 9_750,
        duration: 39_000,
        direction: "reverse",
      },
    ]);
    expect(driftFractions([el])).toEqual([0.75]);
  });

  it("ignores animations that are not the drift", () => {
    const el = track([
      { name: "plate-in", currentTime: 120, duration: 240 },
    ]);
    expect(driftFractions([el])).toEqual([0]);
  });

  it("reads zero rather than throwing when there is no phase to read", () => {
    // jsdom, reduced motion, and any browser without Web Animations.
    const bare = {} as unknown as HTMLElement;
    const empty = track([]);
    expect(driftFractions([bare, empty])).toEqual([0, 0]);
  });

  it("survives a duration or time the browser cannot give a number for", () => {
    const odd = track([
      { name: DRIFT_ANIMATION, currentTime: Number.NaN, duration: 31_000 },
      { name: DRIFT_ANIMATION, currentTime: 100, duration: 0 },
    ]);
    expect(driftFractions([odd, odd])).toEqual([0, 0]);
  });
});

describe("driftTracks", () => {
  const face = (side: string, columns: number) =>
    `<div class="ov-face ov-face--${side}">${"<div class='media-col'><ul class='media-col__track'></ul></div>".repeat(columns)}</div>`;

  it("selects one face's columns, in document order", () => {
    const root = document.createElement("div");
    root.innerHTML = face("verso", 3) + face("recto", 2);
    // Order matters: it is matched positionally against the captured strips.
    expect(driftTracks(root, "verso")).toHaveLength(3);
    expect(driftTracks(root, "recto")).toHaveLength(2);
    const [first] = driftTracks(root, "verso");
    expect(first).toBe(root.querySelector(".ov-face--verso .media-col__track"));
  });

  it("returns nothing for a face that has no wall", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div class="ov-face ov-face--verso"></div>`;
    expect(driftTracks(root, "verso")).toEqual([]);
    expect(driftTracks(null, "verso")).toEqual([]);
  });
});

describe("driftPhase", () => {
  it("reads both faces, and reports nothing on a spread without a wall", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div class="ov-face ov-face--verso"></div><div class="ov-face ov-face--recto"></div>`;
    expect(driftPhase(root)).toEqual({ verso: [], recto: [] });
    expect(hasDrift(driftPhase(root))).toBe(false);
    expect(hasDrift(NO_DRIFT)).toBe(false);
  });

  it("is truthy once a face actually carries columns", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div class="ov-face ov-face--verso"><div class="media-col"><ul class="media-col__track"></ul></div></div>`;
    // jsdom has no Web Animations, so the value is 0 — but it is present, and
    // presence is what gates the recompose.
    expect(driftPhase(root)).toEqual({ verso: [0], recto: [] });
    expect(hasDrift(driftPhase(root))).toBe(true);
  });
});

describe("driftBlit", () => {
  // A real column from the measured book-face layout, at the app's capture
  // ratio: 193pt wide, 634pt tall, travelling 1231pt through a 2-copy strip.
  const column = {
    x: 40,
    y: 96,
    width: 193,
    height: 634,
    travel: 1231,
    stripHeight: Math.round((1231 * 2 + 3) * 1.485),
  };
  const RATIO = 1.485;

  it("cuts the top of the strip at the start of the loop", () => {
    expect(driftBlit(column, 0, RATIO)).toMatchObject({ sx: 0, sy: 0 });
  });

  it("cuts one full copy down at the end of the loop", () => {
    // The whole point: at fraction 1 the second copy sits exactly where the
    // first began, so the seam never lands on screen.
    expect(driftBlit(column, 1, RATIO).sy).toBe(Math.round(1231 * RATIO));
  });

  it("lands on whole device pixels, so no hairline seam appears", () => {
    for (const fraction of [0, 0.137, 0.5, 0.86, 1]) {
      const blit = driftBlit(column, fraction, RATIO);
      for (const value of Object.values(blit)) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it("never samples past the end of the strip", () => {
    // A strip that came back short must crop, not draw transparent pixels
    // over the page. Checked across the whole loop and at several strip
    // heights, including ones shorter than the column window itself.
    for (const stripHeight of [700, 941, 1400, column.stripHeight]) {
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const blit = driftBlit({ ...column, stripHeight }, fraction, RATIO);
        expect(blit.sy).toBeGreaterThanOrEqual(0);
        expect(blit.sh).toBeGreaterThanOrEqual(0);
        expect(blit.sy + blit.sh).toBeLessThanOrEqual(stripHeight);
      }
    }
  });

  it("fills the whole column whenever the strip is a real two-copy capture", () => {
    for (const fraction of [0, 0.33, 0.66, 1]) {
      expect(driftBlit(column, fraction, RATIO).sh).toBe(
        Math.round(column.height * RATIO),
      );
    }
  });

  it("treats an unreadable phase as the start of the loop", () => {
    expect(driftBlit(column, Number.NaN, RATIO).sy).toBe(0);
  });

  it("places the cut at the column's own box", () => {
    expect(driftBlit(column, 0.5, RATIO)).toMatchObject({
      dx: Math.round(40 * RATIO),
      dy: Math.round(96 * RATIO),
      sw: Math.round(193 * RATIO),
      sh: Math.round(634 * RATIO),
    });
  });
});
