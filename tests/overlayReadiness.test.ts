import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OVERLAY_SETTLE_TIMEOUT,
  finiteAnimations,
  settleOverlay,
} from "@/book3d/overlayReadiness";

function overlayImage({
  complete = false,
  lazy = false,
  decode,
}: {
  complete?: boolean;
  lazy?: boolean;
  decode?: () => Promise<void>;
} = {}): HTMLImageElement {
  const image = document.createElement("img");
  image.src = "/plate.png";
  Object.defineProperty(image, "complete", { value: complete });
  // jsdom does not reflect the `loading` IDL attribute; model it directly so
  // the promotion path is observable.
  Object.defineProperty(image, "loading", {
    value: lazy ? "lazy" : "eager",
    writable: true,
  });
  if (decode) {
    Object.defineProperty(image, "decode", { value: decode });
  }
  return image;
}

function overlayWith(...images: HTMLImageElement[]): HTMLElement {
  const root = document.createElement("div");
  for (const image of images) root.appendChild(image);
  return root;
}

/** A zero-delay macrotask drains the whole microtask chain without ever
    reaching settleOverlay's bounded internal timeout. */
const settled = async (promise: Promise<void>) => {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return done;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("settleOverlay", () => {
  it("resolves immediately without a root or images", async () => {
    await settleOverlay(null);
    await settleOverlay(overlayWith());
  });

  it("waits for a pending image's load event", async () => {
    const image = overlayImage();
    const promise = settleOverlay(overlayWith(image));
    expect(await settled(promise)).toBe(false);

    image.dispatchEvent(new Event("load"));
    expect(await settled(promise)).toBe(true);
  });

  it("resolves when an image errors instead of loading", async () => {
    const image = overlayImage();
    const promise = settleOverlay(overlayWith(image));
    image.dispatchEvent(new Event("error"));
    expect(await settled(promise)).toBe(true);
  });

  it("decodes already-complete images before resolving", async () => {
    let decoded = false;
    const image = overlayImage({
      complete: true,
      decode: () => {
        decoded = true;
        return Promise.resolve();
      },
    });
    await settleOverlay(overlayWith(image));
    expect(decoded).toBe(true);
  });

  it("survives a rejecting decode", async () => {
    const image = overlayImage({
      complete: true,
      decode: () => Promise.reject(new Error("no pixels")),
    });
    await settleOverlay(overlayWith(image));
  });

  it("promotes lazy images to eager so their fetch starts now", () => {
    const image = overlayImage({ lazy: true });
    void settleOverlay(overlayWith(image));
    expect(image.loading).toBe("eager");
  });

  it("gives up after the bounded timeout so a broken asset cannot wedge the swap", async () => {
    vi.useFakeTimers();
    const image = overlayImage();
    const promise = settleOverlay(overlayWith(image));

    let done = false;
    void promise.then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(OVERLAY_SETTLE_TIMEOUT - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});

describe("finiteAnimations", () => {
  const animation = (endTime: number) =>
    ({
      effect: { getComputedTiming: () => ({ endTime }) },
    }) as unknown as Animation;

  it("keeps animations that end and drops unbounded loops", () => {
    const rise = animation(510);
    const pulse = animation(Number.POSITIVE_INFINITY);
    const bare = { effect: null } as unknown as Animation;
    expect(finiteAnimations([rise, pulse, bare])).toEqual([rise]);
  });
});
