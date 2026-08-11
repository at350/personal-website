import type { ComponentType } from "react";

export interface SpreadFaceProps {
  /** Which physical page of the spread is being rendered. */
  face: "verso" | "recto";
  /** "book" inside the flip engine; "reader" in the linear reading view. */
  mode: "book" | "reader";
}

export type SpreadComponent = ComponentType<SpreadFaceProps>;

export interface SpreadBinding {
  id: string;
  Component: SpreadComponent;
  /** Faces that run full-bleed art: folio + running head are suppressed there. */
  fullBleed?: { verso?: boolean; recto?: boolean };
}
