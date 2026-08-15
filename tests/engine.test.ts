import { describe, expect, it } from "vitest";
import {
  type EngineEvent,
  type EngineState,
  initialEngineState,
  landingSpread,
  reduce,
} from "@/magazine/engine";

const TOTAL = 11;
const run = (state: EngineState, ...events: EngineEvent[]) =>
  events.reduce((s, e) => reduce(s, e, TOTAL), state);

describe("magazine engine", () => {
  it("starts a forward drag on the current sheet", () => {
    const s = run(initialEngineState(2), { type: "DRAG_START", edge: "fore" });
    expect(s).toMatchObject({ sheet: 2, direction: 1, dragging: true, progress: 0 });
  });

  it("starts a backward drag on the previous sheet at progress 1", () => {
    const s = run(initialEngineState(2), { type: "DRAG_START", edge: "back" });
    expect(s).toMatchObject({ sheet: 1, direction: -1, dragging: true, progress: 1 });
  });

  it("refuses to turn past the covers", () => {
    expect(run(initialEngineState(TOTAL - 1), { type: "DRAG_START", edge: "fore" }).sheet).toBeNull();
    expect(run(initialEngineState(0), { type: "DRAG_START", edge: "back" }).sheet).toBeNull();
  });

  it("commits a forward drag past the threshold", () => {
    const s = run(
      initialEngineState(0),
      { type: "DRAG_START", edge: "fore" },
      { type: "DRAG_MOVE", progress: 0.5 },
      { type: "DRAG_END", velocity: 0 },
    );
    expect(s.settleTarget).toBe(1);
    expect(run(s, { type: "TICK_COMPLETE" })).toMatchObject({ current: 1, sheet: null });
  });

  it("rolls back a timid forward drag", () => {
    const s = run(
      initialEngineState(0),
      { type: "DRAG_START", edge: "fore" },
      { type: "DRAG_MOVE", progress: 0.2 },
      { type: "DRAG_END", velocity: 0 },
    );
    expect(s.settleTarget).toBe(0);
    expect(run(s, { type: "TICK_COMPLETE" }).current).toBe(0);
  });

  it("a fast fling commits regardless of progress", () => {
    const s = run(
      initialEngineState(0),
      { type: "DRAG_START", edge: "fore" },
      { type: "DRAG_MOVE", progress: 0.1 },
      { type: "DRAG_END", velocity: 0.9 },
    );
    expect(s.settleTarget).toBe(1);
  });

  it("a reverse fling aborts a deep forward drag", () => {
    const s = run(
      initialEngineState(0),
      { type: "DRAG_START", edge: "fore" },
      { type: "DRAG_MOVE", progress: 0.7 },
      { type: "DRAG_END", velocity: -0.9 },
    );
    expect(s.settleTarget).toBe(0);
  });

  it("backward drag commits below the mirrored threshold", () => {
    const s = run(
      initialEngineState(3),
      { type: "DRAG_START", edge: "back" },
      { type: "DRAG_MOVE", progress: 0.5 },
      { type: "DRAG_END", velocity: 0 },
    );
    expect(s.settleTarget).toBe(0);
    expect(run(s, { type: "TICK_COMPLETE" }).current).toBe(2);
  });

  it("ignores drag starts while a sheet is settling", () => {
    const settling = run(
      initialEngineState(0),
      { type: "DRAG_START", edge: "fore" },
      { type: "DRAG_MOVE", progress: 0.6 },
      { type: "DRAG_END", velocity: 0 },
    );
    expect(run(settling, { type: "DRAG_START", edge: "fore" })).toBe(settling);
  });

  it("keeps adjacent TURNs as a single physical sheet", () => {
    let s = run(initialEngineState(1), { type: "TURN", to: 2 });
    expect(s).toMatchObject({ sheet: 1, settleTarget: 1, riffle: null });
    s = run(s, { type: "TICK_COMPLETE" });
    expect(s).toMatchObject({ current: 2, sheet: null, riffle: null });
  });

  it("keeps an adjacent backward TURN as the mirrored physical sheet", () => {
    let s = run(initialEngineState(2), { type: "TURN", to: 1 });
    expect(s).toMatchObject({
      current: 2,
      sheet: 1,
      direction: -1,
      progress: 1,
      settleTarget: 0,
      riffle: null,
    });
    s = run(s, { type: "TICK_COMPLETE" });
    expect(s).toMatchObject({ current: 1, sheet: null, riffle: null });
  });

  it("groups a non-adjacent forward TURN into one riffle transaction", () => {
    let s = run(initialEngineState(1), { type: "TURN", to: 6 });
    expect(s).toMatchObject({
      current: 1,
      sheet: null,
      direction: 1,
      riffle: {
        from: 1,
        to: 6,
        direction: 1,
        sheets: [1, 2, 3, 4, 5],
        visibleSheets: [1, 2, 3, 4, 5],
      },
    });
    s = run(s, { type: "RIFFLE_COMPLETE" });
    expect(s).toEqual(initialEngineState(6));
  });

  it("groups a non-adjacent backward TURN in physical sheet order", () => {
    let s = run(initialEngineState(6), { type: "TURN", to: 1 });
    expect(s.riffle).toMatchObject({
      from: 6,
      to: 1,
      direction: -1,
      sheets: [5, 4, 3, 2, 1],
      visibleSheets: [5, 4, 3, 2, 1],
    });
    s = run(s, { type: "RIFFLE_COMPLETE" });
    expect(s).toEqual(initialEngineState(1));
  });

  it("animates long jumps with a capped representative packet", () => {
    const s = run(initialEngineState(0), { type: "TURN", to: 10 });
    expect(s).toMatchObject({ current: 0, sheet: null });
    expect(s.riffle?.sheets).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(s.riffle?.visibleSheets).toEqual([0, 2, 5, 7, 9]);
  });

  it("TURN is ignored mid-drag and clamped in range", () => {
    const dragging = run(initialEngineState(0), { type: "DRAG_START", edge: "fore" });
    expect(run(dragging, { type: "TURN", to: 3 })).toBe(dragging);
    const clamped = run(initialEngineState(9), { type: "TURN", to: 99 }, { type: "TICK_COMPLETE" });
    expect(clamped.current).toBe(10);
  });

  it("ignores drag and TURN input while a riffle is active", () => {
    const riffle = run(initialEngineState(1), { type: "TURN", to: 6 });
    expect(run(riffle, { type: "DRAG_START", edge: "fore" })).toBe(riffle);
    expect(run(riffle, { type: "TURN", to: 8 })).toBe(riffle);
  });
});

describe("landingSpread", () => {
  it("is the current spread at rest", () => {
    expect(landingSpread(initialEngineState(3))).toBe(3);
  });

  it("is the destination of an auto turn from launch", () => {
    expect(landingSpread(run(initialEngineState(2), { type: "TURN", to: 3 }))).toBe(3);
    expect(landingSpread(run(initialEngineState(2), { type: "TURN", to: 1 }))).toBe(1);
  });

  it("stays on the origin while a drag is still in hand", () => {
    const held = run(initialEngineState(2), { type: "DRAG_START", edge: "fore" });
    expect(landingSpread(held)).toBe(2);
  });

  it("follows the committed side of a released drag", () => {
    const start: EngineEvent[] = [
      { type: "DRAG_START", edge: "fore" },
      { type: "DRAG_MOVE", progress: 0.5 },
      { type: "DRAG_END", velocity: 0 },
    ];
    expect(landingSpread(run(initialEngineState(2), ...start))).toBe(3);
    const timid = run(
      initialEngineState(2),
      { type: "DRAG_START", edge: "fore" },
      { type: "DRAG_MOVE", progress: 0.1 },
      { type: "DRAG_END", velocity: 0 },
    );
    expect(landingSpread(timid)).toBe(2);
  });

  it("is the riffle destination during a jump", () => {
    expect(landingSpread(run(initialEngineState(2), { type: "TURN", to: 7 }))).toBe(7);
  });

  it("matches where TICK_COMPLETE actually lands the book", () => {
    const settling = run(initialEngineState(4), { type: "TURN", to: 5 });
    expect(landingSpread(settling)).toBe(
      run(settling, { type: "TICK_COMPLETE" }).current,
    );
  });
});
