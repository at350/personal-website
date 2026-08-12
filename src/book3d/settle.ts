/* When is a turn actually over? The nominal spring settling is not enough:
   the paper sheet is under-damped and keeps waving (and gleaming) for a
   moment after progress reaches its target. Swapping to the DOM at that
   instant truncates visible motion — the "gleam just disappears" pop. The
   gate below waits for the sheet itself to rest, with a hard hold cap so
   physics can never wedge navigation. */

export const SETTLE_PROGRESS_TOLERANCE = 0.0012;
export const SETTLE_VELOCITY_TOLERANCE = 0.012;
/** Normalized sheet energy (mean vertex speed / page width) below which the
    paper reads as still. */
export const SHEET_REST_ENERGY = 0.02;
/** Seconds the gate may hold a nominally settled turn while the sheet calms. */
export const SETTLE_HOLD_MAX = 0.35;

export interface SettleSample {
  /** progress − target of the settle spring. */
  progressError: number;
  /** Spring velocity in progress units per second. */
  velocity: number;
  /** PaperSheet.motionEnergy() from the frame before. */
  sheetEnergy: number;
  /** Seconds spent inside the nominal tolerance waiting for the sheet. */
  heldFor: number;
}

export function settleComplete(sample: SettleSample): boolean {
  const nominal =
    Math.abs(sample.progressError) < SETTLE_PROGRESS_TOLERANCE &&
    Math.abs(sample.velocity) < SETTLE_VELOCITY_TOLERANCE;
  if (!nominal) return false;
  return (
    sample.sheetEnergy < SHEET_REST_ENERGY || sample.heldFor >= SETTLE_HOLD_MAX
  );
}
