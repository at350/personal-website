import { describe, expect, it } from "vitest";
import {
  type EngineEvent,
  type EngineState,
  initialEngineState,
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

  it("TURN riffles through intermediate sheets", () => {
    let s = run(initialEngineState(1), { type: "TURN", to: 4 });
    expect(s).toMatchObject({ sheet: 1, settleTarget: 1, queue: [2, 3, 4] });
    s = run(s, { type: "TICK_COMPLETE" });
    expect(s).toMatchObject({ current: 2, sheet: 2, settleTarget: 1 });
    s = run(s, { type: "TICK_COMPLETE" });
    s = run(s, { type: "TICK_COMPLETE" });
    expect(s).toMatchObject({ current: 4, sheet: null, queue: [] });
  });

  it("TURN backwards riffles too", () => {
    let s = run(initialEngineState(4), { type: "TURN", to: 2 });
    expect(s).toMatchObject({ sheet: 3, settleTarget: 0 });
    s = run(s, { type: "TICK_COMPLETE" }, { type: "TICK_COMPLETE" });
    expect(s).toMatchObject({ current: 2, sheet: null });
  });

  it("long jumps teleport instead of riffling", () => {
    const s = run(initialEngineState(0), { type: "TURN", to: 9 });
    expect(s).toMatchObject({ current: 9, sheet: null, teleported: true });
  });

  it("TURN is ignored mid-drag and clamped in range", () => {
    const dragging = run(initialEngineState(0), { type: "DRAG_START", edge: "fore" });
    expect(run(dragging, { type: "TURN", to: 3 })).toBe(dragging);
    const clamped = run(initialEngineState(9), { type: "TURN", to: 99 }, { type: "TICK_COMPLETE" });
    expect(clamped.current).toBe(10);
  });
});
