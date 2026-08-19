import { describe, expect, it } from "vitest";
import {
  DRIFT_BURST_PUFFS,
  DRIFT_BURST_START_RADIUS,
  DRIFT_SWIRL_IMPULSE,
  DRIFT_PUFF_LIFETIME,
  DRIFT_PUFF_SPACING,
  DRIFT_TRAIL_CAPACITY,
  DRIFT_TRAIL_SPAN,
  ageDriftTrail,
  burstDriftTrail,
  collectDriftTrail,
  createDriftTrail,
  decayDriftSwirlBoost,
  driftCursorGust,
  driftGustBurst,
  driftPuffRender,
  driftSwirlRate,
  resetDriftTrail,
  shedDriftTrail,
} from "@/drift/cursorMotion";

const live = (trail: ReturnType<typeof createDriftTrail>) =>
  trail.puffs.filter((puff) => puff.age >= 0);

describe("drift cursor motion", () => {
  it("is still at rest and responds clearly to ordinary pointer speeds", () => {
    expect(driftCursorGust(0, 0)).toEqual({ x: 0, y: 0, speed: 0 });

    const moving = driftCursorGust(300, -240);
    expect(moving.x).toBeGreaterThan(0.4);
    expect(moving.y).toBeLessThan(-0.35);
    expect(moving.speed).toBeGreaterThan(0.5);
  });

  it("preserves direction while smoothly saturating extreme samples", () => {
    const right = driftCursorGust(900, 0);
    const left = driftCursorGust(-900, 0);
    expect(right.x).toBeCloseTo(-left.x, 8);
    expect(right.y).toBe(0);

    const extreme = driftCursorGust(50_000, -50_000);
    expect(extreme.x).toBeLessThanOrEqual(1);
    expect(extreme.y).toBeGreaterThanOrEqual(-1);
    expect(extreme.speed).toBeLessThanOrEqual(1);
  });

  it("sheds air by distance travelled, not by elapsed time", () => {
    const trail = createDriftTrail();
    resetDriftTrail(trail, 0, 0);

    // Creeping along leaves nothing behind, however many samples arrive.
    for (let step = 1; step <= 6; step += 1) {
      expect(shedDriftTrail(trail, step * 2, 0, 0.4)).toBe(0);
    }
    expect(live(trail)).toHaveLength(0);

    // Crossing a full spacing sheds exactly one parcel, on the path.
    expect(shedDriftTrail(trail, DRIFT_PUFF_SPACING + 1, 0, 0.4)).toBe(1);
    const shed = live(trail);
    expect(shed).toHaveLength(1);
    expect(shed[0]!.x).toBeCloseTo(DRIFT_PUFF_SPACING, 6);
    expect(shed[0]!.age).toBe(0);
  });

  it("interpolates a fast flick so spacing never tracks pointer speed", () => {
    const trail = createDriftTrail();
    resetDriftTrail(trail, 0, 0);

    // One 120px sample — a ~7000px/s flick between two 60Hz samples.
    const shedCount = shedDriftTrail(trail, 120, 0, 1);
    expect(shedCount).toBe(Math.floor(120 / DRIFT_PUFF_SPACING));

    const xs = live(trail).map((puff) => puff.x).sort((a, b) => a - b);
    // Evenly spaced along the real path, not one lonely parcel at the end.
    for (let index = 1; index < xs.length; index += 1) {
      expect(xs[index]! - xs[index - 1]!).toBeCloseTo(DRIFT_PUFF_SPACING, 6);
    }
    // And no gaps: neighbours sit well inside a fresh parcel's own radius,
    // so the wake reads as a path rather than a dotted line.
    const { radius } = driftPuffRender(0, 1, 0);
    expect(DRIFT_PUFF_SPACING).toBeLessThan(radius);
  });

  it("bounds the trail's length no matter how fast the pointer moves", () => {
    for (const jump of [40, 200, 1200, 9000]) {
      const trail = createDriftTrail();
      resetDriftTrail(trail, 0, 0);
      for (let sample = 1; sample <= 6; sample += 1) {
        shedDriftTrail(trail, sample * jump, 0, 1);
        ageDriftTrail(trail, 1 / 60);
      }
      const pointer = 6 * jump;
      const furthest = Math.max(
        ...live(trail).map((puff) => Math.abs(pointer - puff.x)),
      );
      // The span is capacity x spacing by construction — this is what keeps
      // the wake inside the draw quad at any speed.
      expect(furthest).toBeLessThanOrEqual(DRIFT_TRAIL_SPAN);
    }
  });

  it("leaves parcels where they were dropped — they never chase the pointer", () => {
    const trail = createDriftTrail();
    resetDriftTrail(trail, 0, 0);
    shedDriftTrail(trail, DRIFT_PUFF_SPACING, 0, 0.5);
    const parcel = live(trail)[0]!;
    const bornAt = { x: parcel.x, y: parcel.y };

    // Sweep the pointer away, ageing the trail as frames pass. Only a short
    // hop each sample, so the original parcel is not recycled.
    for (let step = 1; step <= 3; step += 1) {
      shedDriftTrail(trail, DRIFT_PUFF_SPACING + step * 16, step * 4, 0.9);
      ageDriftTrail(trail, 1 / 120);
    }

    // The original parcel has not moved a pixel: this is what separates
    // shed air from a mass on a spring, which would have swung along.
    expect(parcel.x).toBe(bornAt.x);
    expect(parcel.y).toBe(bornAt.y);
  });

  it("keeps only the most recent stretch of path once the buffer is full", () => {
    const trail = createDriftTrail();
    resetDriftTrail(trail, 0, 0);
    const steps = DRIFT_TRAIL_CAPACITY + 6;
    for (let step = 1; step <= steps; step += 1) {
      shedDriftTrail(trail, step * DRIFT_PUFF_SPACING, 0, 0.6);
      ageDriftTrail(trail, 1 / 240);
    }

    const shed = live(trail);
    expect(shed).toHaveLength(DRIFT_TRAIL_CAPACITY);
    // Every survivor is from the most recent stretch — the discarded ones
    // are exactly the earliest, whatever their ages did.
    const oldestKeptX = Math.min(...shed.map((puff) => puff.x));
    expect(oldestKeptX).toBeCloseTo(
      (steps - DRIFT_TRAIL_CAPACITY + 1) * DRIFT_PUFF_SPACING,
      6,
    );
  });

  it("recycles strictly in insertion order even when ages tie", () => {
    // Every parcel shed inside one frame has age 0, so an age-scanning
    // recycler would keep re-picking the same slot and collapse the trail.
    const trail = createDriftTrail();
    resetDriftTrail(trail, 0, 0);
    for (let step = 1; step <= DRIFT_TRAIL_CAPACITY + 4; step += 1) {
      shedDriftTrail(trail, step * DRIFT_PUFF_SPACING, 0, 0.5);
    }
    const xs = live(trail).map((puff) => puff.x);
    expect(new Set(xs).size).toBe(DRIFT_TRAIL_CAPACITY);
  });

  it("dissolves the tail of the buffer so nothing blinks out at full opacity", () => {
    // Fast strokes recycle parcels long before they can age out, so the
    // recency term has to carry the fade instead.
    const fresh = driftPuffRender(0.05, 1, 0);
    const oldest = driftPuffRender(0.05, 1, 1);
    expect(fresh.envelope).toBeGreaterThan(0.5);
    expect(oldest.envelope).toBe(0);

    // And a parcel retired by age alone is equally quiet at the end.
    expect(driftPuffRender(DRIFT_PUFF_LIFETIME * 0.99, 1, 0).envelope)
      .toBeLessThan(0.05);
  });

  it("packs the live trail for the GPU with a y-up flip", () => {
    const trail = createDriftTrail();
    resetDriftTrail(trail, 0, 0);
    shedDriftTrail(trail, 0, DRIFT_PUFF_SPACING * 2, 0.8);
    ageDriftTrail(trail, 0.05);

    const out = new Float32Array(DRIFT_TRAIL_CAPACITY * 4);
    const count = collectDriftTrail(trail, out, 0, DRIFT_PUFF_SPACING * 2);
    expect(count).toBe(2);

    const packed = [];
    for (let slot = 0; slot < DRIFT_TRAIL_CAPACITY; slot += 1) {
      if (out[slot * 4 + 2]! > 0) packed.push(out.slice(slot * 4, slot * 4 + 4));
    }
    expect(packed).toHaveLength(2);
    for (const entry of packed) {
      // Shed below the pointer in client space (+y down) must appear ABOVE
      // it in the shader's y-up frame.
      expect(entry[1]!).toBeGreaterThanOrEqual(0);
      expect(entry[3]!).toBeGreaterThan(0);
    }
  });

  it("dissipates every parcel within its lifetime", () => {
    const trail = createDriftTrail();
    resetDriftTrail(trail, 0, 0);
    shedDriftTrail(trail, DRIFT_PUFF_SPACING, 0, 1);
    expect(live(trail)).toHaveLength(1);

    ageDriftTrail(trail, DRIFT_PUFF_LIFETIME * 0.5);
    expect(live(trail)).toHaveLength(1);
    ageDriftTrail(trail, DRIFT_PUFF_LIFETIME * 0.6);
    expect(live(trail)).toHaveLength(0);
  });

  it("forgets the trail when the cursor re-enters the page", () => {
    const trail = createDriftTrail();
    resetDriftTrail(trail, 0, 0);
    for (let step = 1; step <= 4; step += 1) {
      shedDriftTrail(trail, step * DRIFT_PUFF_SPACING, 0, 0.7);
    }
    expect(live(trail).length).toBeGreaterThan(0);

    resetDriftTrail(trail, 900, 400);
    expect(live(trail)).toHaveLength(0);
    // And the next sample near the new position sheds nothing, so no parcel
    // is stranded across the jump.
    expect(shedDriftTrail(trail, 903, 402, 0.7)).toBe(0);
  });

  it("spins the vortex up on a click and eases it back down", () => {
    // The glyph reacts to its own gust rather than only emitting a ring.
    const idle = driftSwirlRate(0, 0);
    const gusting = driftSwirlRate(0, DRIFT_SWIRL_IMPULSE);
    expect(gusting).toBeGreaterThan(idle * 4);
    // Moving the hand also turns the arms, but far less than a click.
    expect(driftSwirlRate(1, 0)).toBeGreaterThan(idle);
    expect(driftSwirlRate(1, 0)).toBeLessThan(gusting);

    // The spin-up decays smoothly and lands exactly on zero.
    let boost = DRIFT_SWIRL_IMPULSE;
    let previous = boost;
    for (let frame = 0; frame < 12; frame += 1) {
      boost = decayDriftSwirlBoost(boost, 1 / 60);
      expect(boost).toBeLessThan(previous);
      previous = boost;
    }
    let settled = boost;
    for (let frame = 0; frame < 200; frame += 1) {
      settled = decayDriftSwirlBoost(settled, 1 / 60);
    }
    expect(settled).toBe(0);

    // Frame-rate independent, like every other curve here.
    let sixty = DRIFT_SWIRL_IMPULSE;
    let oneTwenty = DRIFT_SWIRL_IMPULSE;
    for (let frame = 0; frame < 12; frame += 1) {
      sixty = decayDriftSwirlBoost(sixty, 1 / 60);
    }
    for (let frame = 0; frame < 24; frame += 1) {
      oneTwenty = decayDriftSwirlBoost(oneTwenty, 1 / 120);
    }
    expect(sixty).toBeCloseTo(oneTwenty, 8);
  });

  it("throws a ring of real air parcels on a click", () => {
    const trail = createDriftTrail();
    resetDriftTrail(trail, 400, 300);
    burstDriftTrail(trail, 400, 300, 26);

    const shed = live(trail);
    expect(shed).toHaveLength(DRIFT_BURST_PUFFS);
    for (const puff of shed) {
      // Thrown outward to a common radius, at full force.
      expect(Math.hypot(puff.x - 400, puff.y - 300)).toBeCloseTo(26, 6);
      expect(puff.force).toBe(1);
      expect(puff.age).toBe(0);
    }
    // Spread all the way around, not clustered on one side.
    const angles = shed.map((puff) =>
      Math.atan2(puff.y - 300, puff.x - 400),
    );
    expect(new Set(angles.map((a) => a.toFixed(3))).size).toBe(
      DRIFT_BURST_PUFFS,
    );

    // And they are ordinary shed air: they stay put and dissipate.
    const first = shed[0]!;
    const bornAt = { x: first.x, y: first.y };
    ageDriftTrail(trail, DRIFT_PUFF_LIFETIME * 0.6);
    expect(first.x).toBe(bornAt.x);
    expect(first.y).toBe(bornAt.y);
    ageDriftTrail(trail, DRIFT_PUFF_LIFETIME);
    expect(live(trail)).toHaveLength(0);
  });

  it("grows and fades the click-gust ring like the leaf shove it mirrors", () => {
    expect(driftGustBurst(-1).strength).toBe(0);

    const young = driftGustBurst(0);
    expect(young.radius).toBe(DRIFT_BURST_START_RADIUS);
    expect(young.strength).toBe(1);

    const mid = driftGustBurst(0.3);
    const old = driftGustBurst(0.9);
    expect(mid.radius).toBeGreaterThan(young.radius);
    expect(old.radius).toBeGreaterThan(mid.radius);
    expect(mid.strength).toBeLessThan(young.strength);
    expect(old.strength).toBeLessThan(mid.strength);
    expect(old.strength).toBeLessThan(0.06);
  });
});
