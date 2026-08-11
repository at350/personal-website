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
export const CAPTURE_H = 853; // 3:4

const cache = new Map<string, THREE.CanvasTexture>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

export const pageKey = (spread: number, face: "verso" | "recto") =>
  `${spread}:${face}`;

export function getPageTexture(key: string): THREE.CanvasTexture | null {
  return cache.get(key) ?? null;
}

export function onTexturesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function capture(key: string) {
  if (cache.has(key) || inFlight.has(key)) return;
  const el = document.querySelector<HTMLElement>(
    `[data-capture-key="${CSS.escape(key)}"]`,
  );
  if (!el) return;
  inFlight.add(key);
  try {
    await document.fonts.ready;
    const canvas = await toCanvas(el, {
      pixelRatio: 2,
      width: CAPTURE_W,
      height: CAPTURE_H,
      backgroundColor: "#ffffff",
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    cache.set(key, texture);
    listeners.forEach((fn) => fn());
  } catch {
    // A failed capture just means the leaf shows blank paper for that turn.
  } finally {
    inFlight.delete(key);
  }
}

/** Rasterize the faces around `spread` so the next turn is always ready. */
export function prefetchAround(spread: number) {
  const wanted: string[] = [];
  for (let s = spread - 1; s <= spread + 2; s += 1) {
    if (s < 0 || s >= SPREADS.length) continue;
    wanted.push(pageKey(s, "verso"), pageKey(s, "recto"));
  }
  wanted.forEach((key, i) => {
    window.setTimeout(() => void capture(key), i * 40);
  });
}

/** Invalidate everything (fonts loaded late, content changed). */
export function dropAllTextures() {
  cache.forEach((t) => t.dispose());
  cache.clear();
  listeners.forEach((fn) => fn());
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
export function CaptureFarm() {
  useEffect(() => () => dropAllTextures(), []);
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
