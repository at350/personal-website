import { describe, expect, it } from "vitest";
import { LEAF_ROWS, LEAF_SEGMENTS, type LeafVertex } from "@/book3d/bend";
import { PaperSheet } from "@/book3d/paperPhysics";
import {
  DRIFT_SHEET_MAX_DEVIATION,
  createDriftField,
  driftLeafFlex,
  recordDriftDeviation,
  stepDriftField,
  writeDriftLeafGuide,
  type DriftLeafState,
  type DriftPointerInput,
} from "@/drift/driftField";

/* Drift is meant to read as weather. It is easy to buy the no-clipping
   guarantee by quietly taking the motion away — pages pressed flat and stiff
   never pass through one another either — and that trade is invisible to a
   collision test, which only ever gets happier. These are the floors on the
   other side of it: how far a page turns, how hard it folds, how fast it
   wheels. They exist so a future clearance fix cannot pay for itself out of
   the animation without the bill showing up here. */

const PW = 528;
const PH = 704;
const TOTAL = 11;
const DT = 1 / 60;
const COLUMNS = LEAF_SEGMENTS + 1;

const input = (over: Partial<DriftPointerInput> = {}): DriftPointerInput => ({
  screenX: 0,
  screenY: 0,
  inside: false,
  pressed: false,
  shift: 0,
  cameraDistance: 2300,
  viewportWidth: 1440,
  viewportHeight: 900,
  ...over,
});

/** Mirrors DriftBook's frame, so what is measured is what is drawn. */
function makeRig(seed = 0xd21f7) {
  const field = createDriftField({
    pw: PW,
    ph: PH,
    totalLeaves: TOTAL,
    currentSpread: 5,
    seed,
  });
  const sheets = field.leaves.map(
    () => new PaperSheet(PW, PH, LEAF_SEGMENTS, LEAF_ROWS),
  );
  const guides: LeafVertex[][] = field.leaves.map(() =>
    Array.from({ length: COLUMNS * (LEAF_ROWS + 1) }, () => ({
      x: 0,
      y: 0,
      z: 0,
    })),
  );
  const xs = new Float64Array(COLUMNS);
  const ys = new Float64Array(LEAF_ROWS + 1);
  for (let c = 0; c <= LEAF_SEGMENTS; c += 1) {
    xs[c] = -PW / 2 + (c / LEAF_SEGMENTS) * PW;
  }
  for (let r = 0; r <= LEAF_ROWS; r += 1) {
    ys[r] = (1 - (2 * r) / LEAF_ROWS) * (PH / 2);
  }

  const step = (pointer: DriftPointerInput) => {
    stepDriftField(field, DT, pointer);
    for (const leaf of field.leaves) {
      const guide = guides[leaf.index]!;
      writeDriftLeafGuide(leaf, xs, ys, guide);
      const speed = Math.hypot(leaf.vx, leaf.vy, leaf.vz);
      const flex = driftLeafFlex(leaf);
      const amplitude = (3200 + speed * 3) * leaf.release * flex;
      const vertices = sheets[leaf.index]!.stepDrift(guide, {
        dt: DT,
        windX: -leaf.vx * 3.2 * flex,
        windY: -leaf.vy * 3.2 * flex,
        windZ: -leaf.vz * 3.2 * flex,
        puffX: 0,
        puffY: 0,
        puffZ: 0,
        puffStrength: 0,
        puffRadius: PW * 0.5,
        followRate: 2.4,
        damping: 0.955,
        curvatureScale: 0.22,
        restScale: leaf.scale,
        flutterX: leaf.axisNX * amplitude,
        flutterY: leaf.axisNY * amplitude,
        flutterZ: leaf.axisNZ * amplitude,
        flutterPhase: field.time * 2.3 + leaf.seedA * Math.PI * 2,
        maxDeviation: DRIFT_SHEET_MAX_DEVIATION * flex,
      });
      recordDriftDeviation(leaf, vertices, guide, LEAF_SEGMENTS, LEAF_ROWS);
    }
  };
  return { field, step };
}

/** Angular velocity splits by what it costs the depth budget: roll about the
    sheet's own normal is free, everything else swings the plane through
    depth. They are floored separately because they are governed separately. */
function rollAndTumble(leaf: DriftLeafState) {
  const roll =
    leaf.wx * leaf.axisNX + leaf.wy * leaf.axisNY + leaf.wz * leaf.axisNZ;
  const total = Math.hypot(leaf.wx, leaf.wy, leaf.wz);
  return {
    roll: Math.abs(roll),
    tumble: Math.sqrt(Math.max(0, total * total - roll * roll)),
  };
}

function survey(pointerFor: (frame: number) => DriftPointerInput, frames = 420) {
  const rig = makeRig();
  for (let frame = 0; frame < 150; frame += 1) rig.step(input());
  let swing = 0;
  let roll = 0;
  let tumble = 0;
  let flex = 0;
  let samples = 0;
  let deepestSwing = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    rig.step(pointerFor(frame));
    for (const leaf of rig.field.leaves) {
      const split = rollAndTumble(leaf);
      swing += leaf.swing;
      roll += split.roll;
      tumble += split.tumble;
      flex += driftLeafFlex(leaf);
      deepestSwing = Math.max(deepestSwing, leaf.swing);
      samples += 1;
    }
  }
  return {
    swing: swing / samples,
    roll: roll / samples,
    tumble: tumble / samples,
    flex: flex / samples,
    deepestSwing,
  };
}

describe("drift motion", { timeout: 60_000 }, () => {
  it("keeps pages turning and folding while merely adrift", () => {
    const calm = survey(() => input());
    // A page leans this far off the viewing plane on average, so the pile
    // reads as paper hanging in air rather than a deck laid on glass.
    expect(calm.swing).toBeGreaterThan(0.28);
    // Spin about the page's own normal costs the depth budget nothing, so it
    // is never the thing a clearance fix is allowed to economise on.
    expect(calm.roll).toBeGreaterThan(0.6);
    // Bend left to the sheet solver, as a fraction of its full range.
    expect(calm.flex).toBeGreaterThan(0.55);
  });

  it("wheels and folds harder once the wind is stirred", () => {
    const stirred = survey((frame) =>
      input({
        inside: true,
        pressed: frame % 90 === 0,
        screenX: Math.sin(frame / 26) * 420,
        screenY: Math.cos(frame / 19) * 240,
      }),
    );
    expect(stirred.swing).toBeGreaterThan(0.30);
    expect(stirred.roll).toBeGreaterThan(0.75);
    // Tumble is what the clearance actually pays for, so it is the first
    // thing a tightened budget takes away.
    expect(stirred.tumble).toBeGreaterThan(0.6);
    expect(stirred.flex).toBeGreaterThan(0.55);
    // Somewhere in the storm a page turns properly edge-on-ish.
    expect(stirred.deepestSwing).toBeGreaterThan(0.6);
  });

  it("stirring the air adds motion rather than trading one kind for another", () => {
    const calm = survey(() => input());
    const stirred = survey((frame) =>
      input({
        inside: true,
        pressed: frame % 90 === 0,
        screenX: Math.sin(frame / 26) * 420,
        screenY: Math.cos(frame / 19) * 240,
      }),
    );
    expect(stirred.tumble).toBeGreaterThan(calm.tumble * 1.5);
    expect(stirred.roll).toBeGreaterThan(calm.roll);
  });
});
