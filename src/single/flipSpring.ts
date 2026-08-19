/* The settle a single-page turn springs through, as pure arithmetic.

   engine.ts deliberately owns no animation: DRAG_END picks a settleTarget and
   waits to be told the paper landed. The book answers that with Verlet cloth;
   a DOM leaf only needs a critically damped spring, so this is the whole of
   it. No DOM, no frame timing — the view owns the clock. */

export interface SpringState {
  value: number;
  velocity: number;
}

/** Tuned so a released page lands in ~380ms — the same family as the book's
    own leaf flight (RIFFLE_LEAF_DURATION, 340ms). Critical damping approaches
    asymptotically, so most of that is an imperceptible tail; the tolerances
    below are what actually end the turn. */
export const FLIP_STIFFNESS = 800;
/** Critical damping: the fastest approach that never overshoots. Paper that
    bounces past flat and back reads as rubber. */
export const FLIP_DAMPING = 2 * Math.sqrt(FLIP_STIFFNESS);

/* 0.002 of a turn is 0.36° of a 180° rotation: below anything a screen can
   show, so holding the page non-interactive past this point buys nothing. */
export const FLIP_VALUE_TOLERANCE = 0.002;
export const FLIP_VELOCITY_TOLERANCE = 0.05;

/** A long frame (a backgrounded tab, a slow capture) must not let the spring
    integrate a huge step and fling the page. */
export const MAX_STEP_SECONDS = 1 / 30;

export function stepSpring(
  state: SpringState,
  target: number,
  deltaSeconds: number,
  stiffness = FLIP_STIFFNESS,
  damping = FLIP_DAMPING,
): SpringState {
  const dt = Math.min(Math.max(deltaSeconds, 0), MAX_STEP_SECONDS);
  if (dt === 0) return state;
  const acceleration =
    -stiffness * (state.value - target) - damping * state.velocity;
  const velocity = state.velocity + acceleration * dt;
  return { value: state.value + velocity * dt, velocity };
}

/** Landed: within a subpixel of the target and no longer carrying energy. */
export function springAtRest(state: SpringState, target: number): boolean {
  return (
    Math.abs(state.value - target) <= FLIP_VALUE_TOLERANCE &&
    Math.abs(state.velocity) <= FLIP_VELOCITY_TOLERANCE
  );
}
