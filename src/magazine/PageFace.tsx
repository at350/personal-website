/* One printed face's contents: the spread's component plus its furniture.
   Four renderers compose a face — the book's DOM overlay, the capture farm
   that rasterizes it into a WebGL texture, the reader stack, and the
   single-page reader — and the first two are diffed against each other by
   tests/pageCaptureParity.test.tsx. They compose it from here so they cannot
   drift apart. Each caller still owns its own wrapper element, which is the
   only part that legitimately differs between them. */

import type { ReactNode } from "react";
import {
  SPREADS,
  isRenderableFace,
  spreadPages,
  type PageSide,
} from "./folio";
import { ISSUE } from "./issue-map";
import type { SpreadMode } from "./spread-types";
import { Folio } from "@/components/furniture/Folio";
import { RunningHead } from "@/components/furniture/RunningHead";

interface PageFaceProps {
  spread: number;
  side: PageSide;
  mode: SpreadMode;
  /** Extra furniture the caller layers over the page (the book's grid overlay). */
  children?: ReactNode;
}

/** Whether this spread/side pair is paper someone can read. Callers render
    their own placeholder for the two faces that are not. */
export function hasPageFace(spread: number, side: PageSide): boolean {
  return Boolean(SPREADS[spread] && ISSUE[spread] && isRenderableFace(spread, side));
}

export function PageFace({ spread, side, mode, children }: PageFaceProps) {
  const def = SPREADS[spread];
  const binding = ISSUE[spread];
  if (!def || !binding || !isRenderableFace(spread, side)) return null;

  const pages = spreadPages(spread);
  const page = pages ? (side === "verso" ? pages[0] : pages[1]) : null;
  const fullBleed = binding.fullBleed?.[side] ?? false;
  const { Component } = binding;

  return (
    <>
      <Component face={side} mode={mode} />
      {!fullBleed && def.runningHead ? (
        <RunningHead text={def.runningHead} side={side} />
      ) : null}
      {!fullBleed && page !== null ? <Folio page={page} side={side} /> : null}
      {children}
    </>
  );
}
