import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toCanvas: vi.fn(),
}));

vi.mock("html-to-image", () => ({ toCanvas: mocks.toCanvas }));

import {
  dropAllTextures,
  isSpreadTextureFresh,
  pageKey,
  refreshSpreadTextures,
  waitForSpreadTextures,
} from "@/book3d/pageTextures";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function mountSpread(spread: number) {
  for (const face of ["verso", "recto"] as const) {
    const node = document.createElement("div");
    node.dataset.captureKey = pageKey(spread, face);
    document.body.append(node);
  }
}

function canvas(): HTMLCanvasElement {
  const result = document.createElement("canvas");
  result.width = 4;
  result.height = 4;
  return result;
}

async function seedSpread(spread: number) {
  mocks.toCanvas.mockResolvedValue(canvas());
  await refreshSpreadTextures(spread);
  mocks.toCanvas.mockReset();
}

beforeEach(() => {
  dropAllTextures();
  document.body.replaceChildren();
  mocks.toCanvas.mockReset();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({}) as CanvasRenderingContext2D,
  );
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("page texture refresh barrier", () => {
  it("stays dirty until both faces finish", async () => {
    mountSpread(7);
    const first = deferred<HTMLCanvasElement>();
    const second = deferred<HTMLCanvasElement>();
    mocks.toCanvas
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const refresh = refreshSpreadTextures(7);
    const wait = waitForSpreadTextures(7);
    expect(isSpreadTextureFresh(7)).toBe(false);

    first.resolve(canvas());
    await Promise.resolve();
    expect(isSpreadTextureFresh(7)).toBe(false);

    second.resolve(canvas());
    await expect(refresh).resolves.toBe(true);
    await expect(wait).resolves.toBe(true);
    expect(isSpreadTextureFresh(7)).toBe(true);
  });

  it("runs another full pass when content changes during capture", async () => {
    mountSpread(7);
    await seedSpread(7);
    const first = deferred<HTMLCanvasElement>();
    const second = deferred<HTMLCanvasElement>();
    mocks.toCanvas
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValue(canvas());

    const refresh = refreshSpreadTextures(7);
    expect(refreshSpreadTextures(7)).toBe(refresh);

    first.resolve(canvas());
    second.resolve(canvas());
    await expect(refresh).resolves.toBe(true);

    expect(mocks.toCanvas).toHaveBeenCalledTimes(4);
    expect(isSpreadTextureFresh(7)).toBe(true);
  });

  it("keeps a failed refresh dirty and allows a later retry", async () => {
    mountSpread(7);
    await seedSpread(7);
    mocks.toCanvas.mockRejectedValue(new Error("capture failed"));

    await expect(refreshSpreadTextures(7)).resolves.toBe(false);
    expect(isSpreadTextureFresh(7)).toBe(false);
    await expect(waitForSpreadTextures(7)).resolves.toBe(false);

    mocks.toCanvas.mockReset().mockResolvedValue(canvas());
    await expect(refreshSpreadTextures(7)).resolves.toBe(true);
    expect(isSpreadTextureFresh(7)).toBe(true);
  });

  it("tracks different spreads independently", async () => {
    mountSpread(4);
    mountSpread(7);
    await seedSpread(4);
    await seedSpread(7);
    const pending = deferred<HTMLCanvasElement>();
    mocks.toCanvas
      .mockImplementationOnce(() => pending.promise)
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(canvas());

    const first = refreshSpreadTextures(4);
    const second = refreshSpreadTextures(7);
    await expect(second).resolves.toBe(true);
    expect(isSpreadTextureFresh(4)).toBe(false);
    expect(isSpreadTextureFresh(7)).toBe(true);

    pending.resolve(canvas());
    await expect(first).resolves.toBe(true);
  });
});
