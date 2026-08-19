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
import { driftBlit, type DriftPhase, type FaceSide } from "./driftPhase";

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
    await settleImages(el);
    const options = {
      pixelRatio: capturePixelRatio(),
      width: CAPTURE_W,
      height: CAPTURE_H,
      backgroundColor: "#ffffff",
      imagePlaceholder: IMAGE_PLACEHOLDER,
    } as const;

    let canvas: HTMLCanvasElement;
    try {
      canvas = await toCanvas(el, options);
    } catch {
      // Remote thumbnails must never hold the book hostage. A second pass
      // preserves all typography and layout while omitting only failed images.
      canvas = await toCanvas(el, {
        ...options,
        filter: (node) => !(node instanceof HTMLImageElement),
      });
    }

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
    // Keep the pristine phase-0 canvas: every recompose draws from it, so
    // repeated recomposes never accumulate on top of one another.
    baseCanvases.set(key, canvas);
    listeners.forEach((fn) => fn());
    // Deliberately not awaited. Strips are an enhancement — until they exist
    // the book behaves exactly as it did before, showing a phase-0 still.
    void captureDriftStrips(key);
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
        // The wall's contents changed, so its strips are stale too. Dropping
        // them here is what stops a filter chip leaving the old plates
        // drifting inside the new capture.
        driftStrips.delete(key);
        stripCaptures.delete(key);
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
  baseCanvases.clear();
  driftStrips.clear();
  stripCaptures.clear();
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
      style={{
        position: "fixed",
        left: -20000,
        top: 0,
        width: CAPTURE_W,
        pointerEvents: "none",
      }}
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

/* ————— The drifting wall —————

   The library's columns never settle, so its page texture cannot be a single
   still: the moment the DOM overlay hands over, a frozen still disagrees with
   whatever phase the live columns had reached, and the plates visibly jump.

   Rather than re-rasterizing the face at handoff time — which costs hundreds of
   milliseconds and would stall the very gesture that triggered it — each column
   is captured ONCE, un-clipped, as a tall strip. Redrawing the face at an
   arbitrary phase is then a base blit plus one windowed blit per column, which
   is a few milliseconds and can run synchronously inside the frame that swaps
   the renderers. */

interface DriftStrip {
  canvas: HTMLCanvasElement;
  /** Column box in capture-space CSS pixels, relative to the face. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** One copy's travel: the distance a full loop covers. */
  travel: number;
}

const baseCanvases = new Map<string, HTMLCanvasElement>();
const driftStrips = new Map<string, DriftStrip[]>();
const stripCaptures = new Map<string, Promise<void>>();

/** Mirrors `--mosaic-gap` in src/styles/spreads/library.css. */
const MOSAIC_GAP = 3;

/**
 * Capture each drifting column of a face as one un-clipped strip, two copies
 * tall. The clone is posed static and untransformed so the strip always lands
 * at phase zero regardless of what the farm's own animation was doing.
 */
function captureDriftStrips(key: string): Promise<void> {
  if (driftStrips.has(key)) return Promise.resolve();
  const existing = stripCaptures.get(key);
  if (existing) return existing;

  const epoch = textureEpoch;
  const task = (async () => {
    const root = document.querySelector<HTMLElement>(
      `[data-capture-key="${CSS.escape(key)}"]`,
    );
    if (!root) return;
    const columns = [...root.querySelectorAll<HTMLElement>(".media-col")];
    if (columns.length === 0) return;

    const rootBox = root.getBoundingClientRect();
    const ratio = capturePixelRatio();
    const strips: DriftStrip[] = [];

    for (const column of columns) {
      const track = column.querySelector<HTMLElement>(".media-col__track");
      if (!track) return;
      const box = column.getBoundingClientRect();
      const trackHeight = track.offsetHeight;
      // The keyframe travels `-50% - gap/2` of a two-copy track.
      const travel = trackHeight / 2 + MOSAIC_GAP / 2;
      if (!(travel > 0) || !(box.width > 0) || !(box.height > 0)) return;
      const width = Math.round(box.width);
      const canvas = await toCanvas(track, {
        pixelRatio: ratio,
        width,
        height: trackHeight,
        backgroundColor: "#ffffff",
        // Applied to the clone only — the live farm DOM is never touched.
        style: {
          position: "static",
          inset: "auto",
          margin: "0",
          transform: "none",
          animation: "none",
        },
      });
      strips.push({
        canvas,
        x: Math.round(box.left - rootBox.left),
        y: Math.round(box.top - rootBox.top),
        width,
        height: Math.round(box.height),
        travel,
      });
    }

    if (epoch !== textureEpoch) return;
    driftStrips.set(key, strips);
  })()
    .catch(() => {
      // A face whose strips will not capture simply keeps the phase-0 still,
      // which is exactly the behaviour that shipped before this existed.
      if (import.meta.env.DEV && !import.meta.env.TEST) {
        console.warn(`Drift strip capture failed: ${key}`);
      }
    })
    .finally(() => {
      stripCaptures.delete(key);
    });

  stripCaptures.set(key, task);
  return task;
}

/** Whether a spread can be redrawn at an arbitrary drift phase yet. */
export function canComposeDrift(spread: number): boolean {
  return (["verso", "recto"] as const).some((face) => {
    const key = pageKey(spread, face);
    return (driftStrips.get(key)?.length ?? 0) > 0 && baseCanvases.has(key);
  });
}

/**
 * Redraw a spread's page textures so their wall sits at `phase`. Synchronous
 * on purpose: the caller runs inside the frame that swaps DOM for WebGL, and
 * `onTexturesChanged` applies the new map to the material directly rather than
 * through a React render, so the mesh shows it in that same frame.
 */
export function composeDriftTextures(spread: number, phase: DriftPhase): void {
  for (const face of ["verso", "recto"] as const) {
    const key = pageKey(spread, face);
    const base = baseCanvases.get(key);
    const strips = driftStrips.get(key);
    const fractions = phase[face as FaceSide];
    if (!base || !strips || strips.length === 0) continue;
    if (fractions.length !== strips.length) continue;

    const ratio = base.width / CAPTURE_W;
    const canvas = document.createElement("canvas");
    canvas.width = base.width;
    canvas.height = base.height;
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.drawImage(base, 0, 0);

    strips.forEach((strip, index) => {
      const blit = driftBlit(
        { ...strip, stripHeight: strip.canvas.height },
        fractions[index] ?? 0,
        ratio,
      );
      context.drawImage(
        strip.canvas,
        blit.sx,
        blit.sy,
        blit.sw,
        blit.sh,
        blit.dx,
        blit.dy,
        blit.sw,
        blit.sh,
      );
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const previous = cache.get(key);
    cache.set(key, texture);
    if (previous) previous.dispose();
  }
  listeners.forEach((fn) => fn());
}
