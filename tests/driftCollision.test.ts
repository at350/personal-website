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
  type DriftField,
  type DriftPointerInput,
} from "@/drift/driftField";

/* The field and the sheet solver are separately unit-tested, but "pages must
   not clip" is a property of the two RUNNING TOGETHER: the clearance is
   computed from carriers and measured deviations, while what the eye judges
   is the solved vertex grid. This suite drives the same per-frame pipeline
   DriftBook runs and measures real sheet-through-sheet penetration. */

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

/** Mirrors DriftBook's frame: carriers step, guides transform, sheets flex,
    shapes are recorded for the next frame's clearance. */
function makeRig(seed = 0xd21f7) {
  const field = createDriftField({
    pw: PW, ph: PH, totalLeaves: TOTAL, currentSpread: 5, seed,
  });
  const sheets = field.leaves.map(
    () => new PaperSheet(PW, PH, LEAF_SEGMENTS, LEAF_ROWS),
  );
  const guides: LeafVertex[][] = field.leaves.map(() =>
    Array.from({ length: COLUMNS * (LEAF_ROWS + 1) }, () => ({ x: 0, y: 0, z: 0 })),
  );
  const solved: LeafVertex[][] = guides.map((g) => g.map((v) => ({ ...v })));
  const xs = new Float64Array(COLUMNS);
  const ys = new Float64Array(LEAF_ROWS + 1);
  for (let c = 0; c <= LEAF_SEGMENTS; c += 1) xs[c] = -PW / 2 + (c / LEAF_SEGMENTS) * PW;
  for (let r = 0; r <= LEAF_ROWS; r += 1) ys[r] = (1 - (2 * r) / LEAF_ROWS) * (PH / 2);

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
        puffX: 0, puffY: 0, puffZ: 0, puffStrength: 0, puffRadius: PW * 0.5,
        followRate: 2.4, damping: 0.955, curvatureScale: 0.22,
        restScale: leaf.scale,
        flutterX: leaf.axisNX * amplitude,
        flutterY: leaf.axisNY * amplitude,
        flutterZ: leaf.axisNZ * amplitude,
        flutterPhase: field.time * 2.3 + leaf.seedA * Math.PI * 2,
        maxDeviation: DRIFT_SHEET_MAX_DEVIATION * flex,
      });
      const store = solved[leaf.index]!;
      for (let i = 0; i < vertices.length; i += 1) {
        store[i]!.x = vertices[i]!.x;
        store[i]!.y = vertices[i]!.y;
        store[i]!.z = vertices[i]!.z;
      }
      recordDriftDeviation(leaf, vertices, guide, LEAF_SEGMENTS, LEAF_ROWS);
    }
  };
  return { field, solved, step };
}

/* Two drawn sheets clip when their depth ORDER flips across the screen
   region they share: in one place page A is in front, in another B is —
   which is exactly the cross-cutting the eye reads as pages fusing. Each
   sheet is scattered into a coarse screen-space height map, and any pair
   whose difference changes sign over the shared cells has crossed. The
   reported number is how deep the crossing goes, in pixels. */
const MAP = 44;
const MAP_SPAN = 1600;

function heightMap(vertices: readonly LeafVertex[]) {
  const sum = new Float64Array(MAP * MAP);
  const count = new Int32Array(MAP * MAP);
  for (const point of vertices) {
    const gx = Math.floor(((point.x + MAP_SPAN / 2) / MAP_SPAN) * MAP);
    const gy = Math.floor(((point.y + MAP_SPAN / 2) / MAP_SPAN) * MAP);
    if (gx < 0 || gx >= MAP || gy < 0 || gy >= MAP) continue;
    const cell = gy * MAP + gx;
    sum[cell] += point.z;
    count[cell] += 1;
  }
  return { sum, count };
}

function worstCrossing(field: DriftField, solved: LeafVertex[][]) {
  const maps = solved.map(heightMap);
  let worst = 0;
  for (let i = 0; i < field.leaves.length; i += 1) {
    if (field.leaves[i]!.release <= 0) continue;
    for (let j = i + 1; j < field.leaves.length; j += 1) {
      if (field.leaves[j]!.release <= 0) continue;
      const a = maps[i]!;
      const b = maps[j]!;
      let above = 0;
      let below = 0;
      let shared = 0;
      for (let cell = 0; cell < MAP * MAP; cell += 1) {
        if (a.count[cell]! === 0 || b.count[cell]! === 0) continue;
        shared += 1;
        const difference =
          a.sum[cell]! / a.count[cell]! - b.sum[cell]! / b.count[cell]!;
        if (difference > above) above = difference;
        if (difference < below) below = difference;
      }
      // A couple of shared cells is a glancing corner, where a cell mean is
      // too coarse to call a crossing.
      if (shared < 6) continue;
      // Both signs present over the shared area: the surfaces cross.
      const crossing = Math.min(above, -below);
      if (crossing > worst) worst = crossing;
    }
  }
  return worst;
}

describe("drift page collision", { timeout: 60_000 }, () => {
  it("never lets one page's surface pass through another's", () => {
    const rig = makeRig();
    const idle = input();
    for (let frame = 0; frame < 150; frame += 1) rig.step(idle);

    let peak = 0;
    let sum = 0;
    const frames = 600;
    for (let frame = 0; frame < frames; frame += 1) {
      rig.step(idle);
      const penetration = worstCrossing(rig.field, rig.solved);
      peak = Math.max(peak, penetration);
      sum += penetration;
    }
    process.stdout.write(`\nIDLE peak ${peak.toFixed(1)} mean ${(sum / frames).toFixed(2)}\n`);
    // Measured at zero. The headroom is for solver jitter across platforms,
    // not a budget to spend: a real regression here runs to tens of pixels.
    expect(peak).toBeLessThan(3);
    expect(sum / frames).toBeLessThan(0.2);
  });

  it("holds through a gust that herds every page together", () => {
    const rig = makeRig(0x51ee7);
    const idle = input();
    for (let frame = 0; frame < 150; frame += 1) rig.step(idle);

    let peak = 0;
    let gustSum = 0;
    for (let frame = 0; frame < 300; frame += 1) {
      rig.step(input({
        inside: true,
        pressed: frame % 90 === 0,
        screenX: Math.sin(frame / 26) * 420,
        screenY: Math.cos(frame / 19) * 240,
      }));
      const crossing = worstCrossing(rig.field, rig.solved);
      peak = Math.max(peak, crossing);
      gustSum += crossing;
    }
    process.stdout.write(`GUST peak ${peak.toFixed(1)} mean ${(gustSum / 300).toFixed(2)}
`);
    expect(peak).toBeLessThan(4);
    expect(gustSum / 300).toBeLessThan(0.2);
  });

  it("the measure catches a crossing that is really there", () => {
    // Rails are only worth their salt if the instrument can fail. Two sheets
    // pitched through each other must register; the same two pulled apart in
    // depth must not.
    const rig = makeRig();
    const idle = input();
    for (let frame = 0; frame < 60; frame += 1) rig.step(idle);

    const a = rig.solved[0]!;
    const b = rig.solved[1]!;
    for (let i = 0; i < a.length; i += 1) {
      const u = (i % (LEAF_SEGMENTS + 1)) / LEAF_SEGMENTS - 0.5;
      a[i]!.x = u * PW;
      a[i]!.y = (Math.floor(i / (LEAF_SEGMENTS + 1)) / LEAF_ROWS - 0.5) * PH;
      a[i]!.z = u * 300;
      b[i]!.x = a[i]!.x;
      b[i]!.y = a[i]!.y;
      b[i]!.z = -u * 300;
    }
    for (let i = 2; i < rig.field.leaves.length; i += 1) {
      rig.field.leaves[i]!.release = 0;
    }
    expect(worstCrossing(rig.field, rig.solved)).toBeGreaterThan(100);

    for (let i = 0; i < b.length; i += 1) b[i]!.z += 5000;
    expect(worstCrossing(rig.field, rig.solved)).toBe(0);
  });
});