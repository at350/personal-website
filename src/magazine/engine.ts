/* Pure page-flip state machine. No DOM or frame timing — the component owns
   springs/riffle clocks and dispatches a completion event when paper lands. */

import {
  createRiffleTransition,
  type RiffleTransition,
} from "./riffle";

export const COMMIT_THRESHOLD = 0.35;
export const VELOCITY_BIAS = 0.4; // px/ms of pointer speed that forces a commit

export interface EngineState {
  /** Spread currently considered "open". */
  current: number;
  /** Sheet in flight (sheet s sits between spread s and s+1), or null at rest. */
  sheet: number | null;
  /** Flip amount of the in-flight sheet: 0 = unflipped (right stack), 1 = flipped (left stack). */
  progress: number;
  direction: 1 | -1 | 0;
  dragging: boolean;
  /** Where the in-flight sheet should spring to once released / auto-turning. */
  settleTarget: 0 | 1 | null;
  /** One bounded, concurrent packet for a non-adjacent TURN. */
  riffle: RiffleTransition | null;
}

export type EngineEvent =
  | { type: "DRAG_START"; edge: "fore" | "back" }
  | { type: "DRAG_MOVE"; progress: number }
  | { type: "DRAG_END"; velocity: number }
  | { type: "TURN"; to: number }
  | { type: "TICK_COMPLETE" }
  | { type: "RIFFLE_COMPLETE" };

export const initialEngineState = (spread = 0): EngineState => ({
  current: spread,
  sheet: null,
  progress: 0,
  direction: 0,
  dragging: false,
  settleTarget: null,
  riffle: null,
});

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function reduce(state: EngineState, event: EngineEvent, total: number): EngineState {
  switch (event.type) {
    case "DRAG_START": {
      if (state.sheet !== null || state.riffle !== null) return state;
      if (event.edge === "fore") {
        if (state.current >= total - 1) return state;
        return { ...state, sheet: state.current, direction: 1, progress: 0, dragging: true };
      }
      if (state.current <= 0) return state;
      return { ...state, sheet: state.current - 1, direction: -1, progress: 1, dragging: true };
    }

    case "DRAG_MOVE": {
      if (!state.dragging || state.sheet === null) return state;
      return { ...state, progress: clamp01(event.progress) };
    }

    case "DRAG_END": {
      if (!state.dragging || state.sheet === null) return state;
      const fast = Math.abs(event.velocity) >= VELOCITY_BIAS;
      const flingForward = fast && event.velocity > 0;
      const flingBack = fast && event.velocity < 0;
      let commit: boolean;
      if (state.direction === 1) {
        commit = flingForward || (!flingBack && state.progress > COMMIT_THRESHOLD);
      } else {
        commit = flingBack || (!flingForward && state.progress < 1 - COMMIT_THRESHOLD);
      }
      const settleTarget = state.direction === 1 ? (commit ? 1 : 0) : commit ? 0 : 1;
      return { ...state, dragging: false, settleTarget };
    }

    case "TURN": {
      if (state.sheet !== null || state.dragging || state.riffle !== null) return state;
      const to = Math.min(Math.max(event.to, 0), total - 1);
      if (to === state.current) return state;
      const distance = Math.abs(to - state.current);
      if (distance > 1) {
        const riffle = createRiffleTransition(state.current, to);
        if (!riffle) return state;
        return {
          ...state,
          direction: riffle.direction,
          riffle,
        };
      }
      const direction: 1 | -1 = to > state.current ? 1 : -1;
      return startAutoTurn(state, direction);
    }

    case "TICK_COMPLETE": {
      if (state.sheet === null || state.settleTarget === null) return state;
      const flipped = state.settleTarget === 1;
      const landed = flipped ? state.sheet + 1 : state.sheet;
      const rest: EngineState = {
        ...state,
        current: landed,
        sheet: null,
        progress: 0,
        direction: 0,
        settleTarget: null,
      };
      return rest;
    }

    case "RIFFLE_COMPLETE": {
      if (state.riffle === null) return state;
      return initialEngineState(state.riffle.to);
    }

    default:
      return state;
  }
}

function startAutoTurn(state: EngineState, direction: 1 | -1): EngineState {
  const sheet = direction === 1 ? state.current : state.current - 1;
  return {
    ...state,
    sheet,
    direction,
    dragging: false,
    progress: direction === 1 ? 0 : 1,
    settleTarget: direction === 1 ? 1 : 0,
    riffle: null,
  };
}
