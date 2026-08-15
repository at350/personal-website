import { describe, expect, it } from "vitest";
import {
  DRIFT_BURST_START_RADIUS,
  driftCursorGust,
  driftGustBurst,
  stepDriftOrbBody,
  type DriftOrbBodyState,
} from "@/drift/cursorMotion";

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

  it("trails the pointer as a lazier air parcel than the flame body", () => {
    let body: DriftOrbBodyState = { x: 0, y: 0, velocityX: 0, velocityY: 0 };

    // The orb visibly sloshes: after 100 ms it is still clearly short of a
    // pointer step, and it settles without overshoot.
    for (let frame = 0; frame < 6; frame += 1) {
      body = stepDriftOrbBody(body, 100, 0, 1 / 60);
    }
    expect(body.x).toBeGreaterThan(55);
    expect(body.x).toBeLessThan(75);

    let maximum = body.x;
    for (let frame = 0; frame < 30; frame += 1) {
      body = stepDriftOrbBody(body, 100, 0, 1 / 60);
      maximum = Math.max(maximum, body.x);
    }
    expect(body.x).toBeGreaterThan(99);
    expect(maximum).toBeLessThanOrEqual(101);
  });

  it("is deterministic across 60Hz and 120Hz frame delivery", () => {
    const initial: DriftOrbBodyState = {
      x: -20,
      y: 15,
      velocityX: 0,
      velocityY: 0,
    };
    let sixty = initial;
    let oneTwenty = initial;

    for (let frame = 0; frame < 12; frame += 1) {
      sixty = stepDriftOrbBody(sixty, 80, -35, 1 / 60);
    }
    for (let frame = 0; frame < 24; frame += 1) {
      oneTwenty = stepDriftOrbBody(oneTwenty, 80, -35, 1 / 120);
    }

    expect(sixty.x).toBeCloseTo(oneTwenty.x, 8);
    expect(sixty.y).toBeCloseTo(oneTwenty.y, 8);
    expect(sixty.velocityX).toBeCloseTo(oneTwenty.velocityX, 8);
    expect(sixty.velocityY).toBeCloseTo(oneTwenty.velocityY, 8);
  });

  it("grows and fades the click-gust ring like the leaf shove it mirrors", () => {
    // Unstarted bursts draw nothing.
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
