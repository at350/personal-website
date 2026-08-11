/* Live DOM pages → crisp WebGL textures.
   A hidden "farm" renders every page face at a fixed size; html-to-image
   rasterizes them on demand (2×), and the store hands three.js textures to
   the book. The visible spread is always real DOM — textures only ever show
   while paper is moving. */

import { useEffect } from "react";
import * as THREE from "three";
import { toCanvas } from "html-to-image";
import { SPREADS, spreadPages } from "@/magazine/folio";
import { ISSUE } from "@/magazine/issue-map";
import { Folio } from "@/components/furniture/Folio";
import { RunningHead } from "@/components/furniture/RunningHead";

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

const cache = new Map<string, THREE.CanvasTexture>();
const inFlight = new Map<string, Promise<boolean>>();
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

function isRenderableFace(spread: number, face: "verso" | "recto") {
  const kind = SPREADS[spread]?.kind;
  return !(
    (kind === "cover" && face === "verso") ||
    (kind === "back" && face === "recto")
  );
}

export const ALL_PAGE_KEYS = SPREADS.flatMap((_, spread) =>
  (["verso", "recto"] as const)
    .filter((face) => isRenderableFace(spread, face))
    .map((face) => pageKey(spread, face)),
);

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

function capture(key: string): Promise<boolean> {
  if (cache.has(key)) return Promise.resolve(true);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const task = (async () => {
    const el = document.querySelector<HTMLElement>(
      `[data-capture-key="${CSS.escape(key)}"]`,
    );
    if (!el) return false;

    await document.fonts.ready;
    const options = {
      pixelRatio: 2,
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
    cache.set(key, texture);
    listeners.forEach((fn) => fn());
    return true;
  })().catch(() => {
    // Last-resort paper still counts as a texture. The entry screen must never
    // trap a reader because one page contains an uncooperative remote asset.
    const canvas = document.createElement("canvas");
    canvas.width = CAPTURE_W * 2;
    canvas.height = CAPTURE_H * 2;
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
  cache.forEach((t) => t.dispose());
  cache.clear();
  preloadPromise = null;
  completedCaptures = 0;
  listeners.forEach((fn) => fn());
  emitProgress();
}

function FarmFace({ spread, face }: { spread: number; face: "verso" | "recto" }) {
  const def = SPREADS[spread]!;
  const binding = ISSUE[spread]!;
  const pages = spreadPages(spread);
  const page = pages ? (face === "verso" ? pages[0] : pages[1]) : null;
  const fullBleed = binding.fullBleed?.[face] ?? false;
  const { Component } = binding;
  if ((def.kind === "cover" && face === "verso") || (def.kind === "back" && face === "recto")) {
    return null;
  }
  return (
    <div
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
      <Component face={face} mode="book" />
      {!fullBleed && def.runningHead ? <RunningHead text={def.runningHead} side={face} /> : null}
      {!fullBleed && page !== null ? <Folio page={page} side={face} /> : null}
    </div>
  );
}

/** Offscreen live copies of every page, kept out of the a11y tree. */
export function CaptureFarm({
  onProgress,
  onReady,
}: {
  onProgress?: (progress: TextureProgress) => void;
  onReady?: (progress: TextureProgress) => void;
}) {
  useEffect(() => {
    let active = true;
    void preloadAllPageTextures((progress) => {
      if (active) onProgress?.(progress);
    }).then((progress) => {
      if (active) onReady?.(progress);
    });
    return () => {
      active = false;
    };
  }, [onProgress, onReady]);
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
