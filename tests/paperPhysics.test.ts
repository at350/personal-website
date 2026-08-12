import { describe, expect, it } from "vitest";
import { leafSurface, LEAF_ROWS, LEAF_SEGMENTS } from "../src/book3d/bend";
import { PaperSheet } from "../src/book3d/paperPhysics";

const indexOf = (row: number, column: number) =>
  row * (LEAF_SEGMENTS + 1) + column;

const distance = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/* Multi-hundred-frame solver simulations: comfortably fast alone, but they
   exceed vitest's 5s default when CI runners or parallel suites starve the
   worker. The assertions are deterministic — only the wall clock varies. */
describe("thin paper sheet dynamics", { timeout: 30_000 }, () => {
  it("lets the grabbed corner lead while the rest of the sheet follows", () => {
    const sheet = new PaperSheet(100, 140, LEAF_SEGMENTS, LEAF_ROWS);
    const flat = leafSurface(0, 100, 140, 0, 1, 1);
    const target = leafSurface(0.46, 100, 140, 2.4, 1, 1);
    sheet.reset(flat);

    let current = flat;
    for (let frame = 0; frame < 8; frame += 1) {
      current = sheet.step(target, {
        dt: 1 / 60,
        dragging: true,
        grabY: 1,
        handleOffsetY: -14,
        velocity: 2.4,
      });
    }

    const grabbed = indexOf(0, LEAF_SEGMENTS);
    const farCorner = indexOf(LEAF_ROWS, LEAF_SEGMENTS);
    const grabbedTravel = distance(current[grabbed]!, flat[grabbed]!);
    const farTravel = distance(current[farCorner]!, flat[farCorner]!);

    expect(grabbedTravel).toBeGreaterThan(farTravel);
    expect(farTravel).toBeGreaterThan(10);
    expect(current[grabbed]!.y).toBeLessThan(67);
  });

  it("resists stretch while remaining free to form a compound curve", () => {
    const width = 100;
    const height = 140;
    const sheet = new PaperSheet(width, height, LEAF_SEGMENTS, LEAF_ROWS);
    const flat = leafSurface(0, width, height, 0, 0.8, 1);
    const target = leafSurface(0.52, width, height, 3, 0.8, 1);
    sheet.reset(flat);

    let current = flat;
    for (let frame = 0; frame < 24; frame += 1) {
      current = sheet.step(target, {
        dt: 1 / 60,
        dragging: true,
        grabY: 0.8,
        handleOffsetY: 10,
        velocity: 3,
      });
    }

    const horizontalRest = width / LEAF_SEGMENTS;
    const verticalRest = height / LEAF_ROWS;
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

    const topTip = current[indexOf(0, LEAF_SEGMENTS)]!;
    const bottomTip = current[indexOf(LEAF_ROWS, LEAF_SEGMENTS)]!;
    expect(maxStrain).toBeLessThan(0.08);
    expect(Math.abs(topTip.z - bottomTip.z)).toBeGreaterThan(4);
  });

  it("settles back onto an exact stack without permanent cloth sag", () => {
    const sheet = new PaperSheet(100, 140, LEAF_SEGMENTS, LEAF_ROWS);
    const curled = leafSurface(0.5, 100, 140, 2, 0.7, 1);
    const landed = leafSurface(1, 100, 140, 0, 0.7, 1);
    sheet.reset(curled);

    let current = curled;
    for (let frame = 0; frame < 240; frame += 1) {
      current = sheet.step(landed, {
        dt: 1 / 60,
        dragging: false,
        grabY: 0.7,
        handleOffsetY: 0,
        velocity: 0,
      });
    }

    const worstError = current.reduce(
      (worst, vertex, index) =>
        Math.max(worst, distance(vertex, landed[index]!)),
      0,
    );
    expect(worstError).toBeLessThan(0.75);
  });

  it("never punches through the stack while a drag slams the page down", () => {
    // The hand pulls hard to the landing extreme and keeps jittering: the
    // arched guide collapses flat in a few frames and Verlet inertia wants to
    // carry the sheet below z = 0 — into the stack it lands on. The rendered
    // leaf sits only 0.4px above the stack box, so any real overshoot clips.
    const width = 450;
    const height = 600;
    const sheet = new PaperSheet(width, height, LEAF_SEGMENTS, LEAF_ROWS);
    sheet.reset(leafSurface(0.55, width, height, 3, 0.9, 1));

    let minZ = 0;
    for (let frame = 0; frame < 160; frame += 1) {
      const progress = Math.min(1, 0.55 + frame * 0.05);
      const current = sheet.step(leafSurface(progress, width, height, 3, 0.9, 1), {
        dt: 1 / 60,
        dragging: true,
        grabY: 0.9,
        handleOffsetY: 120 * Math.sin(frame / 2.5),
        velocity: 3,
      });
      for (const vertex of current) minZ = Math.min(minZ, vertex.z);
    }

    expect(minZ).toBeGreaterThanOrEqual(-1e-6);
  });

  it("never dips below the stack during a released landing", () => {
    // A fling release: the guide drops from a mid-air arch to dead flat and
    // the sheet follows with momentum. The transit minimum matters, not just
    // where it finally rests.
    const width = 450;
    const height = 600;
    const sheet = new PaperSheet(width, height, LEAF_SEGMENTS, LEAF_ROWS);
    sheet.reset(leafSurface(0.7, width, height, 3.5, 0.8, 1));
    const landed = leafSurface(1, width, height, 0, 0.8, 1);

    let minZ = 0;
    for (let frame = 0; frame < 200; frame += 1) {
      const current = sheet.step(landed, {
        dt: 1 / 60,
        dragging: false,
        grabY: 0.8,
        handleOffsetY: 0,
        velocity: 0,
      });
      for (const vertex of current) minZ = Math.min(minZ, vertex.z);
    }

    expect(minZ).toBeGreaterThanOrEqual(-1e-6);
  });

  it("keeps floor contact inelastic when corrections drag the sheet below it", () => {
    // Constraint passes co-move `previous` with `positions` (zero-velocity
    // corrections). If a co-move carries both below the floor, clamping only
    // the position half manufactures upward velocity — an unmodeled bounce.
    const width = 450;
    const height = 600;
    const sheet = new PaperSheet(width, height, LEAF_SEGMENTS, LEAF_ROWS);
    const landed = leafSurface(1, width, height, 0, 0.8, 1);
    const below = landed.map((v) => ({ ...v, z: v.z - 3 }));
    sheet.reset(below);

    let maxZ = -Infinity;
    for (let frame = 0; frame < 3; frame += 1) {
      const current = sheet.step(landed, {
        dt: 1 / 60,
        dragging: false,
        grabY: 0.8,
        handleOffsetY: 0,
        velocity: 0,
      });
      for (const vertex of current) maxZ = Math.max(maxZ, vertex.z);
    }

    // A truly inelastic clamp surfaces the sheet without launching it.
    expect(maxZ).toBeLessThan(1);
  });

  it("reports motion energy that is live under the hand and dies at rest", () => {
    const sheet = new PaperSheet(450, 600, LEAF_SEGMENTS, LEAF_ROWS);
    const flat = leafSurface(0, 450, 600, 0, 0.8, 1);
    sheet.reset(flat);

    for (let frame = 0; frame < 30; frame += 1) {
      sheet.step(leafSurface(0.2 + 0.2 * Math.sin(frame / 3), 450, 600, 2, 0.8, 1), {
        dt: 1 / 60,
        dragging: true,
        grabY: 0.8,
        handleOffsetY: 80 * Math.sin(frame / 3),
        velocity: 2,
      });
    }
    expect(sheet.motionEnergy()).toBeGreaterThan(0.1);

    const landed = leafSurface(1, 450, 600, 0, 0.8, 1);
    for (let frame = 0; frame < 240; frame += 1) {
      sheet.step(landed, {
        dt: 1 / 60,
        dragging: false,
        grabY: 0.8,
        handleOffsetY: 0,
        velocity: 0,
      });
    }
    expect(sheet.motionEnergy()).toBeLessThan(0.02);
  });

  it("keeps the free edge smooth instead of folding into an accordion", () => {
    const width = 100;
    const height = 140;
    const sheet = new PaperSheet(width, height, LEAF_SEGMENTS, LEAF_ROWS);
    const flat = leafSurface(0, width, height, 0, 0.92, 1);
    sheet.reset(flat);

    let current = flat;
    for (let frame = 1; frame <= 36; frame += 1) {
      const progress = frame / 72;
      current = sheet.step(
        leafSurface(progress, width, height, 2.8, 0.92, 1),
        {
          dt: 1 / 60,
          dragging: true,
          grabY: 0.92,
          handleOffsetY: -18 * (frame / 36),
          velocity: 2.8,
        },
      );
    }

    let reversals = 0;
    let previousDirection = 0;
    for (let row = 1; row <= LEAF_ROWS; row += 1) {
      const previous = current[indexOf(row - 1, LEAF_SEGMENTS)]!;
      const here = current[indexOf(row, LEAF_SEGMENTS)]!;
      const deltaX = here.x - previous.x;
      const direction = Math.abs(deltaX) < 0.12 ? 0 : Math.sign(deltaX);
      if (direction !== 0) {
        if (previousDirection !== 0 && direction !== previousDirection) reversals += 1;
        previousDirection = direction;
      }
    }

    expect(reversals).toBeLessThanOrEqual(1);
  });
});
