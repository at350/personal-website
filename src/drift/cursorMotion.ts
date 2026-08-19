/* Pure motion mapping for the Drift wind-orb cursor: perceptual velocity
   normalization, the shed-air trail, and the click-gust ring envelope.
   Everything is deterministic and frame-rate independent.

   There is deliberately no inertial body here. A lagging mass on a spring
   reads as a pendulum — circle the pointer and the whole glyph swings around
   behind it. Air does not swing: it sheds off the hand and dissipates where
   it was left, which is what the trail below models. */

export interface DriftCursorGust {
  x: number;
  y: number;
  speed: number;
}

/** One parcel of air shed by the moving pointer, fixed in screen space. */
export interface DriftPuff {
  x: number;
  y: number;
  /** Seconds since shedding; negative marks an unused slot. */
  age: number;
  /** Pointer energy at the moment of shedding, 0..1. */
  force: number;
}

export interface DriftTrailState {
  /** Ring buffer written strictly in order, so insertion order is exact and
      never has to be recovered from ages (which tie within a frame). */
  puffs: DriftPuff[];
  /** Total parcels ever shed; the write cursor is this modulo capacity. */
  shedCount: number;
  lastX: number;
  lastY: number;
  seeded: boolean;
}

const MAX_POINTER_SPEED = 2_400;
/** Air is broader-shouldered than flame: direction saturates later, so slow
    strokes read as a breeze before a fast one reads as a gust. */
const DIRECTION_RESPONSE_SPEED = 520;
const ENERGY_RESPONSE_SPEED = 460;

/** Parcels are shed by DISTANCE along the path — interpolated across each
    pointer sample, so a 2000 px/s flick lays down the same even spacing a
    slow drag does instead of scattering dots. That fixed spacing is also
    what bounds the trail: it can never span more than capacity × spacing,
    however fast the hand moves, so it always fits inside the draw quad. */
export const DRIFT_PUFF_SPACING = 15;
export const DRIFT_TRAIL_CAPACITY = 12;
export const DRIFT_TRAIL_SPAN = DRIFT_PUFF_SPACING * DRIFT_TRAIL_CAPACITY;
export const DRIFT_PUFF_LIFETIME = 0.5;
/** Seconds a fresh parcel takes to reach full opacity. Deliberately brief:
    at speed a parcel is recycled long before it could age out. */
const PUFF_FADE_IN = 0.02;
const PUFF_BASE_RADIUS = 8;
const PUFF_GROWTH = 24;
const PUFF_FORCE_RADIUS = 10;
/** Share of the buffer's tail that fades out. Without it the oldest parcel
    would blink off at full opacity the moment its slot is recycled — which
    happens early during fast strokes, where age alone never retires it. */
const PUFF_RECENCY_FADE_START = 0.72;

export const DRIFT_BURST_START_RADIUS = 30;
export const DRIFT_BURST_GROWTH = 430;
const BURST_DECAY = 3.4;
/** A click spins the vortex up before the shockwave leaves it — the glyph
    reacts to its own gust instead of merely emitting a ring. */
export const DRIFT_SWIRL_IMPULSE = 7;
const SWIRL_BOOST_DECAY = 3.2;
/** Parcels of air thrown outward by a click. They are ordinary shed air —
    static, dissipating in place — so the burst leaves real substance behind
    rather than a travelling outline. */
export const DRIFT_BURST_PUFFS = 8;
export const DRIFT_BURST_PUFF_RADIUS = 26;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Maps pointer velocity into a perceptual wind response. The tanh curve keeps
 * ordinary mouse movement legible while absorbing trackpad flicks and gaming
 * mice without a hard visual step.
 */
export function driftCursorGust(
  velocityX: number,
  velocityY: number,
): DriftCursorGust {
  const safeX = clamp(velocityX, -MAX_POINTER_SPEED, MAX_POINTER_SPEED);
  const safeY = clamp(velocityY, -MAX_POINTER_SPEED, MAX_POINTER_SPEED);
  const magnitude = Math.hypot(safeX, safeY);

  return {
    x: Math.tanh(safeX / DIRECTION_RESPONSE_SPEED),
    y: Math.tanh(safeY / DIRECTION_RESPONSE_SPEED),
    speed: 1 - Math.exp(-magnitude / ENERGY_RESPONSE_SPEED),
  };
}

export function createDriftTrail(): DriftTrailState {
  return {
    puffs: Array.from({ length: DRIFT_TRAIL_CAPACITY }, () => ({
      x: 0,
      y: 0,
      age: -1,
      force: 0,
    })),
    shedCount: 0,
    lastX: 0,
    lastY: 0,
    seeded: false,
  };
}

/** Forgets every shed parcel — used whenever the cursor re-enters the page. */
export function resetDriftTrail(trail: DriftTrailState, x: number, y: number) {
  for (const puff of trail.puffs) puff.age = -1;
  trail.lastX = x;
  trail.lastY = y;
  trail.seeded = true;
}

/**
 * Sheds parcels along the segment the pointer just travelled, one every
 * DRIFT_PUFF_SPACING px, and returns how many were shed. Interpolating (as
 * opposed to shedding once per sample) is what keeps spacing independent of
 * pointer speed and sample rate. A jump longer than the buffer can hold only
 * fills the buffer once — the older parcels would have been recycled anyway.
 */
export function shedDriftTrail(
  trail: DriftTrailState,
  x: number,
  y: number,
  force: number,
): number {
  if (!trail.seeded) {
    resetDriftTrail(trail, x, y);
    return 0;
  }

  const deltaX = x - trail.lastX;
  const deltaY = y - trail.lastY;
  const travel = Math.hypot(deltaX, deltaY);
  if (travel < DRIFT_PUFF_SPACING) return 0;

  const wanted = Math.floor(travel / DRIFT_PUFF_SPACING);
  const count = Math.min(wanted, DRIFT_TRAIL_CAPACITY);
  const safeForce = clamp(force, 0, 1);
  // Emit the LAST `count` positions along the segment, so a jump that
  // overruns the buffer keeps the parcels nearest the pointer.
  for (let step = wanted - count + 1; step <= wanted; step += 1) {
    const at = (step * DRIFT_PUFF_SPACING) / travel;
    const slot = trail.puffs[trail.shedCount % DRIFT_TRAIL_CAPACITY]!;
    slot.x = trail.lastX + deltaX * at;
    slot.y = trail.lastY + deltaY * at;
    slot.age = 0;
    slot.force = safeForce;
    trail.shedCount += 1;
  }
  // Carry the remainder so spacing stays even across sample boundaries.
  const consumed = (wanted * DRIFT_PUFF_SPACING) / travel;
  trail.lastX += deltaX * consumed;
  trail.lastY += deltaY * consumed;
  return count;
}

/** Ages every live parcel, retiring those past their lifetime. */
export function ageDriftTrail(trail: DriftTrailState, deltaSeconds: number) {
  const delta = Math.max(0, deltaSeconds);
  for (const puff of trail.puffs) {
    if (puff.age < 0) continue;
    puff.age += delta;
    if (puff.age >= DRIFT_PUFF_LIFETIME) puff.age = -1;
  }
}

/**
 * Opacity and size of one parcel. `recency` is 0 for the newest live parcel
 * and 1 for the oldest, so the tail of the buffer dissolves smoothly whether
 * a parcel is retired by age (slow strokes) or by recycling (fast ones).
 */
export function driftPuffRender(
  age: number,
  force: number,
  recency: number,
): { envelope: number; radius: number } {
  if (age < 0) return { envelope: 0, radius: 0 };
  const life = clamp(age / DRIFT_PUFF_LIFETIME, 0, 1);
  const fadeIn = smoothstep(0, PUFF_FADE_IN, age);
  const dissipate = 1 - smoothstep(0.1, 1, life);
  const tail = 1 - smoothstep(PUFF_RECENCY_FADE_START, 1, clamp(recency, 0, 1));
  return {
    envelope: fadeIn * dissipate * tail * (0.35 + clamp(force, 0, 1) * 0.65),
    radius:
      PUFF_BASE_RADIUS + PUFF_GROWTH * life + PUFF_FORCE_RADIUS * clamp(force, 0, 1),
  };
}

/**
 * Packs the live trail for the GPU as (localX, localY, envelope, radius) per
 * slot, relative to the pointer. The shader's frame is y-up, so y flips
 * here. Slots with a non-positive envelope are skipped by the shader.
 * Returns the number of live parcels. Allocation-free: writes into `out`.
 */
export function collectDriftTrail(
  trail: DriftTrailState,
  out: Float32Array,
  cursorX: number,
  cursorY: number,
): number {
  for (let slot = 0; slot < DRIFT_TRAIL_CAPACITY; slot += 1) {
    out[slot * 4 + 2] = 0;
  }

  let live = 0;
  for (const puff of trail.puffs) {
    if (puff.age >= 0) live += 1;
  }
  if (live === 0) return 0;

  // Walk newest to oldest through the ring buffer's exact insertion order.
  let seen = 0;
  for (let back = 1; back <= DRIFT_TRAIL_CAPACITY; back += 1) {
    const index = trail.shedCount - back;
    if (index < 0) break;
    const slot = ((index % DRIFT_TRAIL_CAPACITY) + DRIFT_TRAIL_CAPACITY) %
      DRIFT_TRAIL_CAPACITY;
    const puff = trail.puffs[slot]!;
    if (puff.age < 0) continue;
    // Ranked against CAPACITY, not the live count: the tail fade is meant
    // to dissolve parcels approaching recycling, not to dim a short trail.
    const recency = seen / (DRIFT_TRAIL_CAPACITY - 1);
    const { envelope, radius } = driftPuffRender(puff.age, puff.force, recency);
    const base = slot * 4;
    out[base] = puff.x - cursorX;
    out[base + 1] = cursorY - puff.y;
    out[base + 2] = envelope;
    out[base + 3] = radius;
    seen += 1;
  }
  return live;
}

/** How fast the vortex turns: its idle rate, plus the hand's speed, plus
    whatever is left of a click's spin-up. */
export function driftSwirlRate(speed: number, boost: number): number {
  return 1 + clamp(speed, 0, 1) * 1.6 + Math.max(0, boost);
}

/** Exponential decay of the click spin-up, frame-rate independent. */
export function decayDriftSwirlBoost(boost: number, deltaSeconds: number) {
  if (boost <= 0) return 0;
  const next = boost * Math.exp(-SWIRL_BOOST_DECAY * Math.max(0, deltaSeconds));
  return next < 0.01 ? 0 : next;
}

/**
 * Throws a ring of air parcels outward from a click. They are shed air like
 * any other, so they stay where they land and dissipate — the burst has body
 * where a lone expanding outline had none.
 */
export function burstDriftTrail(
  trail: DriftTrailState,
  x: number,
  y: number,
  radius = DRIFT_BURST_PUFF_RADIUS,
) {
  for (let index = 0; index < DRIFT_BURST_PUFFS; index += 1) {
    const angle = (index / DRIFT_BURST_PUFFS) * Math.PI * 2;
    const slot = trail.puffs[trail.shedCount % DRIFT_TRAIL_CAPACITY]!;
    slot.x = x + Math.cos(angle) * radius;
    slot.y = y + Math.sin(angle) * radius;
    slot.age = 0;
    slot.force = 1;
    trail.shedCount += 1;
  }
  trail.lastX = x;
  trail.lastY = y;
  trail.seeded = true;
}

/**
 * The click-gust ring: an expanding circle whose strength dies as it grows,
 * matching the radial shove the click gives the floating leaves. A negative
 * or unstarted age yields no ring at all.
 */
export function driftGustBurst(ageSeconds: number) {
  if (ageSeconds < 0) return { radius: DRIFT_BURST_START_RADIUS, strength: 0 };
  return {
    radius: DRIFT_BURST_START_RADIUS + ageSeconds * DRIFT_BURST_GROWTH,
    strength: Math.exp(-ageSeconds * BURST_DECAY),
  };
}
