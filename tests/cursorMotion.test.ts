import { describe, expect, it } from "vitest";
import {
  cursorFlameBottomResponse,
  cursorFlameMotion,
  stepCursorFlameBody,
  type CursorFlameBodyState,
} from "@/ignite/cursorMotion";

describe("cursor flame motion", () => {
  it("is still at rest and responds clearly to ordinary pointer speeds", () => {
    expect(cursorFlameMotion(0, 0)).toEqual({ x: 0, y: 0, speed: 0 });

    const moving = cursorFlameMotion(300, -240);
    expect(moving.x).toBeGreaterThan(0.5);
    expect(moving.y).toBeLessThan(-0.45);
    expect(moving.speed).toBeGreaterThan(0.6);
  });

  it("preserves direction while smoothly saturating extreme samples", () => {
    const right = cursorFlameMotion(900, 0);
    const left = cursorFlameMotion(-900, 0);
    expect(right.x).toBeCloseTo(-left.x, 8);
    expect(right.y).toBe(0);

    const extreme = cursorFlameMotion(50_000, -50_000);
    expect(extreme.x).toBeLessThanOrEqual(1);
    expect(extreme.y).toBeGreaterThanOrEqual(-1);
    expect(extreme.speed).toBeLessThanOrEqual(1);
  });

  it("stays tightly attached to a pointer step without overshoot", () => {
    let body: CursorFlameBodyState = {
      x: 0,
      y: 0,
      velocityX: 0,
      velocityY: 0,
    };

    for (let frame = 0; frame < 6; frame += 1) {
      body = stepCursorFlameBody(body, 100, 0, 1 / 60);
    }
    expect(body.x).toBeGreaterThan(84);
    expect(body.x).toBeLessThan(87);
    expect(body.velocityX).toBeGreaterThan(0);

    let maximum = body.x;
    for (let frame = 0; frame < 9; frame += 1) {
      body = stepCursorFlameBody(body, 100, 0, 1 / 60);
      maximum = Math.max(maximum, body.x);
    }
    expect(body.x).toBeGreaterThan(99.7);
    expect(maximum).toBeLessThanOrEqual(103);
  });

  it("is deterministic across 60Hz and 120Hz frame delivery", () => {
    const initial: CursorFlameBodyState = {
      x: -20,
      y: 15,
      velocityX: 0,
      velocityY: 0,
    };
    let sixty = initial;
    let oneTwenty = initial;

    for (let frame = 0; frame < 12; frame += 1) {
      sixty = stepCursorFlameBody(sixty, 80, -35, 1 / 60);
    }
    for (let frame = 0; frame < 24; frame += 1) {
      oneTwenty = stepCursorFlameBody(oneTwenty, 80, -35, 1 / 120);
    }

    expect(sixty.x).toBeCloseTo(oneTwenty.x, 8);
    expect(sixty.y).toBeCloseTo(oneTwenty.y, 8);
    expect(sixty.velocityX).toBeCloseTo(oneTwenty.velocityX, 8);
    expect(sixty.velocityY).toBeCloseTo(oneTwenty.velocityY, 8);
  });

  it("matches the same response under irregular frame deltas", () => {
    const initial: CursorFlameBodyState = {
      x: 0,
      y: 0,
      velocityX: 0,
      velocityY: 0,
    };
    let regular = initial;
    let irregular = initial;

    for (let frame = 0; frame < 12; frame += 1) {
      regular = stepCursorFlameBody(regular, 120, -40, 1 / 60);
    }
    for (const delta of [0.011, 0.027, 0.008, 0.034, 0.016, 0.021, 0.013, 0.03, 0.04]) {
      irregular = stepCursorFlameBody(irregular, 120, -40, delta);
    }

    expect(irregular.x).toBeCloseTo(regular.x, 8);
    expect(irregular.y).toBeCloseTo(regular.y, 8);
    expect(irregular.velocityX).toBeCloseTo(regular.velocityX, 8);
    expect(irregular.velocityY).toBeCloseTo(regular.velocityY, 8);
  });

  it("bends the gas body upward over the final 90 viewport pixels", () => {
    expect(cursorFlameBottomResponse(600, 720)).toEqual({
      pressure: 0,
      bodyBiasY: 0,
    });

    const midway = cursorFlameBottomResponse(675, 720);
    expect(midway.pressure).toBeCloseTo(0.5, 8);
    expect(midway.bodyBiasY).toBeCloseTo(35, 8);

    const edge = cursorFlameBottomResponse(715, 720);
    expect(edge.pressure).toBeGreaterThan(0.99);
    expect(edge.bodyBiasY).toBeGreaterThan(69);
    expect(edge.bodyBiasY).toBeLessThanOrEqual(70);
  });
});
