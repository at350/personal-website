/* Live DOM pages → crisp WebGL textures.
   A hidden "farm" renders every page face at a fixed size; html-to-image
   rasterizes them on demand (2×), and the store hands three.js textures to
   the book. The visible spread is always real DOM — textures only ever show
   while paper is moving. */

import { useEffect } from "react";
import * as THREE from "three";
import { toCanvas } from "html-to-image";
import { FACES, SPREADS } from "@/magazine/folio";
import { PageFace, hasPageFace } from "@/magazine/PageFace";

export const CAPTURE_W = 640;
export const CAPTURE_H = (CAPTURE_W * 4) / 3;

export function pageRasterLayout(visiblePageWidth: number) {
  return {
    pageWidth: CAPTURE_W,
    pageHeight: CAPTURE_H,
    spreadWidth: CAPTURE_W * 2,
    scale: visiblePageWidth / CAPTURE_W,
  };
}

/** The farm lays pages out at CAPTURE_W CSS pixels, but the texture must hold
    exactly the DEVICE pixels the page occupies on screen. A fixed capture
    ratio leaves the texture minified at rest (GPU trilinear softens the type,
    so a settled WebGL page reads gray and fuzzy next to its DOM twin — the
    handoff pops like a refresh). Matching the display footprint makes the
    resting texture map 1:1 and the swap pixel-invisible. */
let captureDisplayWidth = CAPTURE_W;

export function setCaptureDisplayWidth(visiblePageWidth: number) {
  if (Number.isFinite(visiblePageWidth) && visiblePageWidth > 0) {
    captureDisplayWidth = visiblePageWidth;
  }
}

export function capturePixelRatio(
  displayWidth = captureDisplayWidth,
  devicePixelRatio = typeof window !== "undefined"
    ? window.devicePixelRatio || 1
    : 1,
): number {
  const ratio = (displayWidth * Math.min(devicePixelRatio, 2)) / CAPTURE_W;
  return Math.min(3, Math.max(0.5, ratio));
}

const cache = new Map<string, THREE.CanvasTexture>();
const inFlight = new Map<string, Promise<boolean>>();
const spreadRefreshes = new Map<number, Promise<boolean>>();
const requestedSpreadRevisions = new Map<number, number>();
const capturedSpreadRevisions = new Map<number, number>();
let textureEpoch = 0;
const listeners = new Set<() => void>();
const progressListeners = new Set<(progress: TextureProgress) => void>();
let preloadPromise: Promise<TextureProgress> | null = null;
let completedCaptures = 0;

const IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

export interface TextureProgress {
  completed: number;
  loaded: number;
  total: number;
}

export const pageKey = (spread: number, face: "verso" | "recto") =>
  `${spread}:${face}`;

export function getPageTexture(key: string): THREE.CanvasTexture | null {
  return cache.get(key) ?? null;
}

export function onTexturesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* The readable-face sequence lives in folio.ts so the book, the capture farm,
   and the single-page reader all rasterize and turn the same twenty faces. */
export const ALL_PAGE_KEYS = FACES.map((face) => pageKey(face.spread, face.side));

export function getTextureProgress(): TextureProgress {
  return {
    completed: completedCaptures,
    loaded: ALL_PAGE_KEYS.filter((key) => cache.has(key)).length,
    total: ALL_PAGE_KEYS.length,
  };
}

function emitProgress() {
  const progress = getTextureProgress();
  progressListeners.forEach((fn) => fn(progress));
}

/** The farm lives far off-screen, where `loading="lazy"` sources never start
    loading — captured pages would keep their skeleton state forever. Promote
    them to eager and wait (bounded) for the pixels before rasterizing. */
const IMAGE_SETTLE_TIMEOUT = 4000;
async function settleImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map((image) => {
      if (image.loading === "lazy") image.loading = "eager";
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => {
          window.clearTimeout(timer);
          image.removeEventListener("load", done);
          image.removeEventListener("error", done);
          resolve();
        };
        const timer = window.setTimeout(done, IMAGE_SETTLE_TIMEOUT);
        image.addEventListener("load", done);
        image.addEventListener("error", done);
      });
    }),
  );
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== "function") {
      resolve();
      return;
    }
    raf(() => raf(() => resolve()));
  });
}

/** Safari often returns an all-white canvas from an off-viewport foreignObject
    clone. Sample a coarse grid; any ink or photo means the page is real. */
export function canvasLooksBlank(canvas: HTMLCanvasElement): boolean {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) return true;
  try {
    const context = canvas.getContext("2d");
    if (!context || typeof context.getImageData !== "function") return false;
    const stepX = Math.max(1, Math.floor(width / 8));
    const stepY = Math.max(1, Math.floor(height / 8));
    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const pixel = context.getImageData(x, y, 1, 1).data;
        if (pixel[0]! < 250 || pixel[1]! < 250 || pixel[2]! < 250) return false;
        if (pixel[3]! < 250) return false;
      }
    }
    return true;
  } catch {
    // A tainted canvas still holds pixels; we just cannot inspect them.
    return false;
  }
}

function capture(key: string, refresh = false): Promise<boolean> {
  if (!refresh && cache.has(key)) return Promise.resolve(true);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const epoch = textureEpoch;
  const task = (async () => {
    const el = document.querySelector<HTMLElement>(
      `[data-capture-key="${CSS.escape(key)}"]`,
    );
    if (!el) return false;

    await document.fonts.ready;
    await nextPaint();
    await settleImages(el);
    const options = {
      pixelRatio: capturePixelRatio(),
      width: CAPTURE_W,
      height: CAPTURE_H,
      backgroundColor: "#ffffff",
      imagePlaceholder: IMAGE_PLACEHOLDER,
    } as const;

    const rasterize = async () => {
      try {
        return await toCanvas(el, options);
      } catch {
        // Remote thumbnails must never hold the book hostage. A second pass
        // preserves all typography and layout while omitting only failed images.
        return await toCanvas(el, {
          ...options,
          filter: (node) => !(node instanceof HTMLImageElement),
        });
      }
    };

    let canvas = await rasterize();
    if (canvasLooksBlank(canvas)) {
      await nextPaint();
      canvas = await rasterize();
    }
    if (canvasLooksBlank(canvas) && refresh) return false;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    if (epoch !== textureEpoch) {
      texture.dispose();
      return false;
    }
    cache.set(key, texture);
    listeners.forEach((fn) => fn());
    return true;
  })().catch(() => {
    if (import.meta.env.DEV && !import.meta.env.TEST) {
      console.warn(`Page texture capture failed: ${key}`);
    }
    if (epoch !== textureEpoch) return false;
    // A refresh that fails keeps the previous (real) texture on the mesh.
    if (refresh) return false;
    // Last-resort paper still counts as a texture. The entry screen must never
    // trap a reader because one page contains an uncooperative remote asset.
    const ratio = capturePixelRatio();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(CAPTURE_W * ratio);
    canvas.height = Math.round(CAPTURE_H * ratio);
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    cache.set(key, texture);
    listeners.forEach((fn) => fn());
    return true;
  }).finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, task);
  return task;
}

/** Capture every printable face with two workers to limit main-thread spikes. */
export function preloadAllPageTextures(
  onProgress?: (progress: TextureProgress) => void,
): Promise<TextureProgress> {
  if (onProgress) {
    progressListeners.add(onProgress);
    onProgress(getTextureProgress());
  }

  if (!preloadPromise) {
    const pendingKeys = ALL_PAGE_KEYS.filter((key) => !cache.has(key));
    completedCaptures = ALL_PAGE_KEYS.length - pendingKeys.length;
    let cursor = 0;
    const worker = async () => {
      while (cursor < pendingKeys.length) {
        const index = cursor;
        cursor += 1;
        await capture(pendingKeys[index]!);
        completedCaptures += 1;
        emitProgress();
      }
    };
    preloadPromise = Promise.all([worker(), worker()]).then(() => getTextureProgress());
  }

  return preloadPromise.finally(() => {
    if (onProgress) progressListeners.delete(onProgress);
  });
}

/** Re-rasterize both faces of a spread whose DOM content changed while the
    book is open (e.g. a library filter chip). Callers can await the returned
    promise before launching paper so the moving face never uses stale DOM. */
export function refreshSpreadTextures(spread: number): Promise<boolean> {
  const nextRevision = (requestedSpreadRevisions.get(spread) ?? 0) + 1;
  requestedSpreadRevisions.set(spread, nextRevision);
  const existing = spreadRefreshes.get(spread);
  if (existing) return existing;

  const refresh = (async () => {
    while (true) {
      const revision = requestedSpreadRevisions.get(spread) ?? 0;
      const tasks: Promise<boolean>[] = [];
      for (const face of ["verso", "recto"] as const) {
        const key = pageKey(spread, face);
        if (!ALL_PAGE_KEYS.includes(key)) continue;
        const old = cache.get(key) ?? null;
        const pending = inFlight.get(key);
        const task = pending
          ? pending.then(() => capture(key, true))
          : capture(key, true);
        tasks.push(
          task.then((captured) => {
            const next = cache.get(key);
            if (old && next && next !== old) old.dispose();
            return captured;
          }),
        );
      }

      const fresh = (await Promise.all(tasks)).every(Boolean);
      if (!fresh) return false;
      capturedSpreadRevisions.set(spread, revision);
      if ((requestedSpreadRevisions.get(spread) ?? 0) === revision) return true;
    }
  })()
    .finally(() => {
      if (spreadRefreshes.get(spread) === refresh) spreadRefreshes.delete(spread);
    });
  spreadRefreshes.set(spread, refresh);
  return refresh;
}

/** A page turn can await this without starting a duplicate capture. */
export function waitForSpreadTextures(spread: number): Promise<boolean> {
  const refresh = spreadRefreshes.get(spread);
  if (refresh) return refresh;
  return Promise.resolve(isSpreadTextureFresh(spread));
}

export function isSpreadTextureFresh(spread: number): boolean {
  return (
    (capturedSpreadRevisions.get(spread) ?? 0) ===
    (requestedSpreadRevisions.get(spread) ?? 0)
  );
}

/** Rasterize the faces around `spread` so the next turn is always ready. */
export function prefetchAround(spread: number) {
  const wanted: string[] = [];
  for (let s = spread - 1; s <= spread + 2; s += 1) {
    if (s < 0 || s >= SPREADS.length) continue;
    wanted.push(pageKey(s, "verso"), pageKey(s, "recto"));
  }
  wanted.forEach((key, i) => {
    if (!ALL_PAGE_KEYS.includes(key)) return;
    window.setTimeout(() => void capture(key), i * 40);
  });
}

/** Invalidate everything (fonts loaded late, content changed). */
export function dropAllTextures() {
  textureEpoch += 1;
  cache.forEach((t) => t.dispose());
  cache.clear();
  preloadPromise = null;
  completedCaptures = 0;
  spreadRefreshes.clear();
  requestedSpreadRevisions.clear();
  capturedSpreadRevisions.clear();
  listeners.forEach((fn) => fn());
  emitProgress();
}

/** Exported for the DOM parity regression suite. Production rendering still
 * reaches this component only through CaptureFarm. */
export function FarmFace({
  spread,
  face,
}: {
  spread: number;
  face: "verso" | "recto";
}) {
  if (!hasPageFace(spread, face)) return null;
  return (
    <div
      className={`page-face page-face--${face}`}
      data-capture-key={pageKey(spread, face)}
      style={{
        width: CAPTURE_W,
        height: CAPTURE_H,
        position: "relative",
        overflow: "hidden",
        background: "#ffffff",
        containerType: "size",
      }}
    >
      <PageFace spread={spread} side={face} mode="book" />
    </div>
  );
}

/** Clipped to a 1px strip at the origin so Safari still decodes images and
    paints the clone html-to-image reads, without covering the live issue. */
export const CAPTURE_FARM_STYLE = {
  position: "fixed",
  left: 0,
  top: 0,
  width: CAPTURE_W,
  height: 1,
  overflow: "hidden",
  opacity: 0.01,
  pointerEvents: "none",
  zIndex: 0,
} as const;

/** Offscreen live copies of every page, kept out of the a11y tree. */
export function CaptureFarm({
  displayWidth,
  onProgress,
  onReady,
}: {
  /** Visible page width in CSS px, so captures match the on-screen device
      pixels exactly (see setCaptureDisplayWidth). */
  displayWidth?: number;
  onProgress?: (progress: TextureProgress) => void;
  onReady?: (progress: TextureProgress) => void;
}) {
  useEffect(() => {
    if (displayWidth !== undefined) setCaptureDisplayWidth(displayWidth);
    let active = true;
    void preloadAllPageTextures((progress) => {
      if (active) onProgress?.(progress);
    }).then((progress) => {
      if (active) onReady?.(progress);
    });
    return () => {
      active = false;
    };
  }, [displayWidth, onProgress, onReady]);
  return (
    <div
      aria-hidden
      inert
      data-capture-farm=""
      style={CAPTURE_FARM_STYLE}
    >
      {SPREADS.map((def, spread) => (
        <div key={def.id}>
          <FarmFace spread={spread} face="verso" />
          <FarmFace spread={spread} face="recto" />
        </div>
      ))}
    </div>
  );
}
