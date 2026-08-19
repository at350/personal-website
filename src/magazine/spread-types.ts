import type { ComponentType } from "react";

/** "book" inside the WebGL flip engine and its capture farm; "single" in the
    touch reader that turns one face at a time; "reader" in the linear stack. */
export type SpreadMode = "book" | "single" | "reader";

export interface SpreadFaceProps {
  /** Which physical page of the spread is being rendered. */
  face: "verso" | "recto";
  mode: SpreadMode;
}

/* Three separate properties used to be inferred from the mode string at each
   call site, which conflated them. Naming them keeps a new mode from having to
   guess which of the two existing ones it resembles. */

/** The face is a fixed page box, so content that overruns scrolls inside it
    rather than lengthening the paper. True of the book and the single page. */
export const isPagedMode = (mode: SpreadMode) => mode !== "reader";

/** Nothing rasterizes this face, so it may run its own entrance choreography.
    The book must not: a live face has to match the texture baked from it. */
export const isLiveMode = (mode: SpreadMode) => mode !== "book";

/** Both faces are shown at once across a gutter. Only the book has a spine —
    a lone page must not print half of a word that spans one. */
export const hasSpine = (mode: SpreadMode) => mode === "book";

export type SpreadComponent = ComponentType<SpreadFaceProps>;

export interface SpreadBinding {
  id: string;
  Component: SpreadComponent;
  /** Faces that run full-bleed art: folio + running head are suppressed there. */
  fullBleed?: { verso?: boolean; recto?: boolean };
}
