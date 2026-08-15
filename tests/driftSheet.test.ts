import { describe, expect, it } from "vitest";
import { LEAF_ROWS, LEAF_SEGMENTS, type LeafVertex } from "../src/book3d/bend";
import { PaperSheet, type DriftSheetOptions } from "../src/book3d/paperPhysics";

const PW = 400;
const PH = 533;

const indexOf = (row: number, column: number) =>
  row * (LEAF_SEGMENTS + 1) + column;

const distance = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A flat centered sheet — the drift carrier guide at identity orientation. */
const flatGuide = (cx = 0, cy = 0, cz = 0): LeafVertex[] => {
  const vertices: LeafVertex[] = [];
  for (let row = 0; row <= LEAF_ROWS; row += 1) {
    const y = (1 - (2 * row) / LEAF_ROWS) * (PH / 2) + cy;
    for (let column = 0; column <= LEAF_SEGMENTS; column += 1) {
      vertices.push({
        x: -PW / 2 + (column / LEAF_SEGMENTS) * PW + cx,
        y,
        z: cz,
      });
    }
  }
  return vertices;
};

const options = (over: Partial<DriftSheetOptions> = {}): DriftSheetOptions => ({
  dt: 1 / 60,
  windX: 0,
  windY: 0,
  windZ: 0,
  puffX: 0,
  puffY: 0,
  puffZ: 0,
  puffStrength: 0,
  puffRadius: PW * 0.5,
  followRate: 3.4,
  damping: 0.94,
  curvatureScale: 1,
  ...over,
});

/* Multi-hundred-frame solver runs; same wall-clock allowance as the page-turn
   sheet suite. */
describe("weightless drift sheet regime", { timeout: 30_000 }, () => {
  it("pins the spine column to the carrier guide exactly", () => {
    const sheet = new PaperSheet(PW, PH, LEAF_SEGMENTS, LEAF_ROWS);
    const guide = flatGuide();
    sheet.reset(guide);
    let current: readonly LeafVertex[] = guide;
    for (let frame = 0; frame < 40; frame += 1) {
      current = sheet.stepDrift(guide, options({ windZ: 600 }));
    }
    for (let row = 0; row <= LEAF_ROWS; row += 1) {
      const pinned = current[indexOf(row, 0)]!;
      const target = guide[indexOf(row, 0)]!;
      expect(pinned.x).toBe(target.x);
      expect(pinned.y).toBe(target.y);
      expect(pinned.z).toBe(target.z);
    }
  });

  it("bends the free area downwind while the spine holds", () => {
    const sheet = new PaperSheet(PW, PH, LEAF_SEGMENTS, LEAF_ROWS);
    const guide = flatGuide();
    sheet.reset(guide);
    let current: readonly LeafVertex[] = guide;
    for (let frame = 0; frame < 40; frame += 1) {
      current = sheet.stepDrift(guide, options({ windZ: 900 }));
    }
    const midRow = LEAF_ROWS / 2;
    const tip = current[indexOf(midRow, LEAF_SEGMENTS)]!;
    const middle = current[indexOf(midRow, LEAF_SEGMENTS / 2)]!;
    // Deflection grows toward the fore-edge: paper flexing, not a card.
    expect(tip.z).toBeGreaterThan(4);
    expect(tip.z).toBeGreaterThan(middle.z);
    expect(middle.z).toBeGreaterThan(0.2);
  });

  it("lets a pointed gust carve real local curvature when relaxed", () => {
    // A swing about the pinned spine is curvature-free, so uniform wind
    // amplitude is governed by the follow tether. What curvatureScale owns
    // is LOCAL bending: how sharply a pointed gust can dimple the sheet.
    const stiff = new PaperSheet(PW, PH, LEAF_SEGMENTS, LEAF_ROWS);
    const supple = new PaperSheet(PW, PH, LEAF_SEGMENTS, LEAF_ROWS);
    const guide = flatGuide();
    stiff.reset(guide);
    supple.reset(guide);
    let stiffCurrent: readonly LeafVertex[] = guide;
    let suppleCurrent: readonly LeafVertex[] = guide;
    const gust = {
      puffX: PW / 4,
      puffY: 0,
      puffZ: -40,
      puffStrength: 2600,
      puffRadius: PW * 0.12,
      followRate: 0.9,
    };
    for (let frame = 0; frame < 150; frame += 1) {
      stiffCurrent = stiff.stepDrift(guide, options(gust));
      suppleCurrent = supple.stepDrift(
        guide,
        options({ ...gust, curvatureScale: 0.3 }),
      );
    }
    const bump = (vertices: readonly LeafVertex[]) => {
      // Prominence of the dimple over its along-row neighbours: a pure
      // spine-swing has none, only genuine local curvature registers.
      const row = LEAF_ROWS / 2;
      const center = Math.round(((PW / 4 + PW / 2) / PW) * LEAF_SEGMENTS);
      const here = vertices[indexOf(row, center)]!.z;
      const left = vertices[indexOf(row, center - 5)]!.z;
      const right = vertices[indexOf(row, center + 5)]!.z;
      return here - (left + right) / 2;
    };
    expect(bump(suppleCurrent)).toBeGreaterThan(bump(stiffCurrent) * 1.15);
    expect(bump(suppleCurrent)).toBeGreaterThan(5);
  });

  it("keeps edge lengths paper-tight under a hard gust", () => {
    const sheet = new PaperSheet(PW, PH, LEAF_SEGMENTS, LEAF_ROWS);
    const guide = flatGuide();
    sheet.reset(guide);
    let current: readonly LeafVertex[] = guide;
    for (let frame = 0; frame < 30; frame += 1) {
      current = sheet.stepDrift(
        guide,
        options({
          puffX: PW / 2,
          puffY: -PH / 4,
          puffZ: -40,
          puffStrength: 4000,
          puffRadius: PW * 0.45,
        }),
      );
    }
    const horizontalRest = PW / LEAF_SEGMENTS;
    const verticalRest = PH / LEAF_ROWS;
    let maxStrain = 0;
    for (let row = 0; row <= LEAF_ROWS; row += 1) {
      for (let column = 0; column <= LEAF_SEGMENTS; column += 1) {
        const here = current[indexOf(row, column)]!;
        if (column < LEAF_SEGMENTS) {
          const next = current[indexOf(row, column + 1)]!;
          maxStrain = Math.max(
            maxStrain,
            Math.abs(distance(here, next) / horizontalRest - 1),
          );
        }
        if (row < LEAF_ROWS) {
          const next = current[indexOf(row + 1, column)]!;
          maxStrain = Math.max(
            maxStrain,
            Math.abs(distance(here, next) / verticalRest - 1),
          );
        }
      }
    }
    expect(maxStrain).toBeLessThan(0.1);
  });

  it("calms back onto the guide once the air stops", () => {
    const sheet = new PaperSheet(PW, PH, LEAF_SEGMENTS, LEAF_ROWS);
    const guide = flatGuide();
    sheet.reset(guide);
    for (let frame = 0; frame < 30; frame += 1) {
      sheet.stepDrift(guide, options({ windZ: 700 }));
    }
    let current: readonly LeafVertex[] = guide;
    for (let frame = 0; frame < 300; frame += 1) {
      current = sheet.stepDrift(guide, options());
    }
    const worst = current.reduce(
      (max, vertex, index) => Math.max(max, distance(vertex, guide[index]!)),
      0,
    );
    expect(worst).toBeLessThan(1.5);
    expect(sheet.motionEnergy()).toBeLessThan(0.02);
  });

  it("tracks a moving carrier with lag and no permanent residue", () => {
    const sheet = new PaperSheet(PW, PH, LEAF_SEGMENTS, LEAF_ROWS);
    sheet.reset(flatGuide());
    // The carrier slides forward through depth, then parks.
    let lagSeen = 0;
    for (let frame = 0; frame < 90; frame += 1) {
      const guide = flatGuide(0, 0, frame * 1.6);
      const current = sheet.stepDrift(guide, options());
      const tip = current[indexOf(LEAF_ROWS / 2, LEAF_SEGMENTS)]!;
      lagSeen = Math.max(lagSeen, Math.abs(tip.z - guide[0]!.z));
    }
    // The free edge visibly trails the carrier while it moves…
    expect(lagSeen).toBeGreaterThan(2);
    const parked = flatGuide(0, 0, 90 * 1.6);
    let current: readonly LeafVertex[] = parked;
    for (let frame = 0; frame < 300; frame += 1) {
      current = sheet.stepDrift(parked, options());
    }
    // …and fully catches up once it rests.
    const worst = current.reduce(
      (max, vertex, index) => Math.max(max, distance(vertex, parked[index]!)),
      0,
    );
    expect(worst).toBeLessThan(1.5);
  });

  it("is deterministic across identical runs", () => {
    const first = new PaperSheet(PW, PH, LEAF_SEGMENTS, LEAF_ROWS);
    const second = new PaperSheet(PW, PH, LEAF_SEGMENTS, LEAF_ROWS);
    const guide = flatGuide();
    first.reset(guide);
    second.reset(guide);
    let a: readonly LeafVertex[] = guide;
    let b: readonly LeafVertex[] = guide;
    for (let frame = 0; frame < 120; frame += 1) {
      const gust = options({
        windX: Math.sin(frame / 9) * 120,
        windZ: 300,
        puffX: 0,
        puffY: 0,
        puffZ: -60,
        puffStrength: frame % 30 === 0 ? 2400 : 0,
      });
      a = first.stepDrift(guide, gust);
      b = second.stepDrift(guide, gust);
    }
    expect(a).toEqual(b);
  });
});
