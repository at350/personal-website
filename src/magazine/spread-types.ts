import type { ComponentType } from "react";

/** "book" inside the WebGL flip engine and its capture farm; "single" in the
    touch reader that turns one face at a time; "reader" in the linear stack. */
export type SpreadMode = "book" | "single" | "reader";

export interface SpreadFaceProps {
  /** Which physical page of the spread is being rendered. */
  face: "verso" | "recto";
  mode: SpreadMode;
}

export type SpreadComponent = ComponentType<SpreadFaceProps>;

export interface SpreadBinding {
  id: string;
  Component: SpreadComponent;
  /** Faces that run full-bleed art: folio + running head are suppressed there. */
  fullBleed?: { verso?: boolean; recto?: boolean };
}
