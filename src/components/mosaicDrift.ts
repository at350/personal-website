/* ————— The mosaic's shared clock —————

   The library wall drifts as real DOM, but the book turns paper with a still
   texture rasterized from the capture farm's copy of each face, and that copy
   stands still (a column mid-flight rasterizes badly). Left alone the two
   disagree the moment the canvas takes the stage — the page tilts or flips
   and every column snaps back to where it started.

   So the book holds the drift. Before the canvas replaces the live page it
   calls `holdMosaicDrift`: each live column pauses where it is, its place in
   the loop is written onto the farm's copy as a fixed offset, and the spread
   is recaptured — the texture now shows exactly what the reader was looking
   at. When the live page returns, `releaseMosaicDrift` lets the columns move
   on from that same place, so the hand-back is seamless too.

   Pages outside the book (the reader, the phone view) never hold, so their
   walls simply drift. */

interface TrackEntry {
  track: HTMLElement;
  /** Filter, face and column: a column's place in its own loop. */
  key: string;
  /** The middle column runs its loop backwards. */
  reverse: boolean;
}

let held = false;
/** True while a live column has moved since the farm's copy was last set. */
let advanced = false;
/** Loop position, 0–1, of every column the book has held. */
const phases = new Map<string, number>();
const liveTracks = new Set<TrackEntry>();
const farmTracks = new Set<TrackEntry>();

function driftAnimation(track: HTMLElement): Animation | null {
  if (typeof track.getAnimations !== "function") return null;
  return track.getAnimations()[0] ?? null;
}

function loopDuration(animation: Animation): number | null {
  const duration = animation.effect?.getComputedTiming().duration;
  return typeof duration === "number" && duration > 0 ? duration : null;
}

/** Where in its loop a live column stands, 0 up to (not including) 1. */
function loopPhase(animation: Animation): number | null {
  const time = animation.currentTime;
  const duration = loopDuration(animation);
  if (typeof time !== "number" || duration === null) return null;
  return (((time % duration) + duration) % duration) / duration;
}

/** The farm's copy, set to the frame the keyframes would show at `phase`. */
export function mosaicOffset(phase: number, reverse: boolean): string {
  const travelled = reverse ? (1 - phase) % 1 : phase;
  if (travelled === 0) return "";
  return `translateY(calc((-50% - var(--mosaic-gap) / 2) * ${travelled}))`;
}

function placeFarmTrack(entry: TrackEntry) {
  entry.track.style.transform = mosaicOffset(
    phases.get(entry.key) ?? 0,
    entry.reverse,
  );
}

function placeLiveTrack(entry: TrackEntry) {
  const animation = driftAnimation(entry.track);
  if (!animation) return;
  const duration = loopDuration(animation);
  if (duration !== null) {
    animation.currentTime = (phases.get(entry.key) ?? 0) * duration;
  }
  if (held) animation.pause();
  else {
    animation.play();
    advanced = true;
  }
}

/** A column joins the clock while it loops; the returned call leaves it. */
export function registerMosaicTrack(
  track: HTMLElement,
  key: string,
  reverse: boolean,
  farm: boolean,
): () => void {
  const entry: TrackEntry = { track, key, reverse };
  if (farm) {
    farmTracks.add(entry);
    placeFarmTrack(entry);
    return () => {
      farmTracks.delete(entry);
      track.style.transform = "";
    };
  }
  liveTracks.add(entry);
  placeLiveTrack(entry);
  return () => {
    liveTracks.delete(entry);
  };
}

/** Pauses the live wall and moves the farm's copy to match it. The caller
    recaptures the spread before the canvas shows it. */
export function holdMosaicDrift(): void {
  held = true;
  for (const entry of liveTracks) {
    const animation = driftAnimation(entry.track);
    if (!animation) continue;
    animation.pause();
    const phase = loopPhase(animation);
    if (phase !== null) phases.set(entry.key, phase);
  }
  advanced = false;
  for (const entry of farmTracks) placeFarmTrack(entry);
}

/** Lets the live wall move on from wherever it was held. */
export function releaseMosaicDrift(): void {
  if (!held) return;
  held = false;
  for (const entry of liveTracks) placeLiveTrack(entry);
}

/** Whether the live wall has moved past what the textures show. */
export function mosaicDriftAdvanced(): boolean {
  return advanced;
}

/** Back to the printed wall: every column at the start of its loop. The book
    takes the clock with `hold`; leaving the book hands it back. */
export function resetMosaicDrift(hold: boolean): void {
  phases.clear();
  held = hold;
  advanced = false;
  for (const entry of farmTracks) placeFarmTrack(entry);
  for (const entry of liveTracks) placeLiveTrack(entry);
}
