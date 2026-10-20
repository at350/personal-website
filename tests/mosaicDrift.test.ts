import { afterEach, describe, expect, it } from "vitest";
import {
  holdMosaicDrift,
  mosaicDriftAdvanced,
  mosaicOffset,
  registerMosaicTrack,
  releaseMosaicDrift,
  resetMosaicDrift,
} from "@/components/mosaicDrift";

/** Just enough of a CSS animation for the clock: a time, a loop, a state. */
function fakeAnimation(duration: number, currentTime = 0) {
  return {
    currentTime,
    playState: "running" as "running" | "paused",
    effect: { getComputedTiming: () => ({ duration }) },
    pause() {
      this.playState = "paused";
    },
    play() {
      this.playState = "running";
    },
  };
}

function trackWith(animation: ReturnType<typeof fakeAnimation> | null) {
  const track = document.createElement("ul");
  track.getAnimations = () => (animation ? [animation as unknown as Animation] : []);
  return track;
}

afterEach(() => resetMosaicDrift(false));

describe("mosaicOffset", () => {
  it("is the keyframes' own travel at that point in the loop", () => {
    expect(mosaicOffset(0.25, false)).toBe(
      "translateY(calc((-50% - var(--mosaic-gap) / 2) * 0.25))",
    );
  });

  it("runs a reversed column from the far end", () => {
    expect(mosaicOffset(0.25, true)).toBe(
      "translateY(calc((-50% - var(--mosaic-gap) / 2) * 0.75))",
    );
  });

  it("leaves a column at the start of its loop untransformed", () => {
    expect(mosaicOffset(0, false)).toBe("");
    expect(mosaicOffset(0, true)).toBe("");
  });
});

describe("the book's hold on the drift", () => {
  it("starts a live column paused at the printed position while held", () => {
    resetMosaicDrift(true);
    const animation = fakeAnimation(30_000, 4_000);
    registerMosaicTrack(trackWith(animation), "all:verso:0", false, false);
    expect(animation.playState).toBe("paused");
    expect(animation.currentTime).toBe(0);
    expect(mosaicDriftAdvanced()).toBe(false);
  });

  it("copies the held offset onto the capture farm's column", () => {
    resetMosaicDrift(true);
    const animation = fakeAnimation(40_000);
    registerMosaicTrack(trackWith(animation), "all:recto:1", true, false);
    const farm = trackWith(null);
    registerMosaicTrack(farm, "all:recto:1", true, true);

    releaseMosaicDrift();
    expect(animation.playState).toBe("running");
    expect(mosaicDriftAdvanced()).toBe(true);

    // Ten seconds of a forty-second loop, plus one whole lap.
    animation.currentTime = 50_000;
    holdMosaicDrift();
    expect(animation.playState).toBe("paused");
    expect(mosaicDriftAdvanced()).toBe(false);
    expect(farm.style.transform).toBe(mosaicOffset(0.25, true));
  });

  it("resumes a remounted live column from where it was held", () => {
    resetMosaicDrift(true);
    const first = fakeAnimation(20_000);
    const unregister = registerMosaicTrack(trackWith(first), "all:verso:2", false, false);
    releaseMosaicDrift();
    first.currentTime = 5_000;
    holdMosaicDrift();
    unregister();

    // The overlay remounts the wall while turning back onto the library.
    const second = fakeAnimation(20_000);
    registerMosaicTrack(trackWith(second), "all:verso:2", false, false);
    expect(second.currentTime).toBe(5_000);
    expect(second.playState).toBe("paused");
  });

  it("never holds a wall outside the book", () => {
    const animation = fakeAnimation(30_000);
    registerMosaicTrack(trackWith(animation), "all:verso:0", false, false);
    expect(animation.playState).toBe("running");
  });
});
