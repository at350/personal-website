export interface DriftPointerState {
  /** Viewport-centered pointer x in CSS px (clientX - innerWidth / 2). */
  x: number;
  /** Viewport-centered pointer y, +up (innerHeight / 2 - clientY). */
  y: number;
  inside: boolean;
  pressed: boolean;
  pointerType: string;
}
