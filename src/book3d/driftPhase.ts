/* Where the library wall currently sits.

   The mosaic is the only thing on a page face that moves, and the WebGL twin
   standing in for that face while paper turns is a still. Whenever the two
   swap, they must be showing the same picture — so the still has to be redrawn
   at whatever phase the live columns had reached. These helpers report that
   phase; `composeDriftTextures` in pageTextures.tsx redraws to it.

   Phase is read off the `Animation` objects rather than computed transforms.
   `currentTime` is free, while `getComputedStyle().transform` forces a style
   flush — and this is sampled every frame the overlay is up. */

/** Matches the keyframe name in src/styles/spreads/library.css. */
export const DRIFT_ANIMATION = "mosaic-drift";

export type FaceSide = "verso" | "recto";

/** A face's columns, in document order — the order the strips are captured. */
export function driftTracks(
  root: ParentNode | null,
  face: FaceSide,
): HTMLElement[] {
  if (!root) return [];
  return [
    ...root.querySelectorAll<HTMLElement>(
      `.ov-face--${face} .media-col__track`,
    ),
  ];
}

function driftAnimation(track: HTMLElement): Animation | undefined {
  // jsdom, and any browser before Web Animations, simply has no phase to read;
  // callers treat an empty result as "nothing drifts here".
  if (typeof track.getAnimations !== "function") return undefined;
  return track
    .getAnimations()
    .find(
      (animation) =>
        (animation as CSSAnimation).animationName === DRIFT_ANIMATION,
    );
}

/**
 * How far through its loop each column is: 0 at the top of the travel, 1 one
 * full copy later. A reversed column runs the same keyframe backwards, so its
 * fraction is mirrored — the number always means "distance travelled", never
 * "time elapsed", which is what the compositor needs.
 */
export function driftFractions(tracks: readonly HTMLElement[]): number[] {
  return tracks.map((track) => {
    const animation = driftAnimation(track);
    if (!animation) return 0;
    const timing = animation.effect?.getTiming();
    const duration =
      typeof timing?.duration === "number" ? timing.duration : Number.NaN;
    const raw = animation.currentTime;
    const time = typeof raw === "number" ? raw : Number(raw ?? Number.NaN);
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    if (!Number.isFinite(time)) return 0;
    const progress = (((time % duration) + duration) % duration) / duration;
    return timing?.direction === "reverse" ? 1 - progress : progress;
  });
}

export interface DriftPhase {
  verso: number[];
  recto: number[];
}

export const NO_DRIFT: DriftPhase = { verso: [], recto: [] };

/** Both faces of the spread the overlay is currently showing. */
export function driftPhase(root: ParentNode | null): DriftPhase {
  return {
    verso: driftFractions(driftTracks(root, "verso")),
    recto: driftFractions(driftTracks(root, "recto")),
  };
}

export function hasDrift(phase: DriftPhase): boolean {
  return phase.verso.length > 0 || phase.recto.length > 0;
}

/* ————— Where a column's strip is cut ————— */

export interface DriftColumnBox {
  /** Column box in capture-space CSS pixels, relative to the face. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** One copy's travel: the distance a full loop covers, in CSS pixels. */
  travel: number;
  /** The captured strip's height, in DEVICE pixels. */
  stripHeight: number;
}

export interface DriftBlit {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
}

/**
 * The window to cut out of a column's strip, and where to lay it down, both in
 * device pixels.
 *
 * Everything is rounded to whole device pixels: a half-pixel disagreement
 * between the cut and the column it lands in shows up as a hairline seam down
 * the edge of the column. The source offset is clamped so a strip that came
 * back shorter than expected crops instead of sampling past its end, which
 * would draw transparent pixels over the page.
 */
export function driftBlit(
  column: DriftColumnBox,
  fraction: number,
  ratio: number,
): DriftBlit {
  const sw = Math.round(column.width * ratio);
  const wanted = Math.round(
    (Number.isFinite(fraction) ? fraction : 0) * column.travel * ratio,
  );
  const full = Math.round(column.height * ratio);
  const highest = Math.max(0, column.stripHeight - full);
  const sy = Math.min(Math.max(wanted, 0), highest);
  // A strip shorter than the window it is asked for can only fill part of the
  // column; the rest keeps whatever the base capture already drew there. That
  // cannot happen with a real two-copy strip, but a cropped one degrades to a
  // partly-stale column rather than to transparent pixels over the page.
  const sh = Math.max(0, Math.min(full, column.stripHeight - sy));
  return {
    sx: 0,
    sy,
    sw,
    sh,
    dx: Math.round(column.x * ratio),
    dy: Math.round(column.y * ratio),
  };
}
