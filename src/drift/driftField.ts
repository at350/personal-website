/* Pure weightless-leaf dynamics for Drift mode. Each physical leaf gets a
   rigid "carrier" pose (position + orientation + velocities) that the paper
   sheet solver then flexes around. Everything here is deterministic: seeded
   per-leaf phases, sums of incommensurate sines for ambient air, no clocks
   and no Math.random, so two fields stepped with the same inputs stay
   bit-identical — the same contract burnField keeps for Ignite.

   Frames: coordinates are group-local book space (world units are CSS px).
   The spine rests at x = 0, +z faces the camera. The camera sits at
   (-shift, 0, cameraDistance) in this frame because the whole book group is
   shifted by `shift` in scene space. A leaf's local frame is centered on the
   sheet: local x = -pw/2 is the spine edge (sheet column 0), +y is up. */

export type DriftPhase = "loosen" | "adrift" | "landing" | "landed";

export interface DriftVec {
  x: number;
  y: number;
  z: number;
}

export interface DriftLeafState {
  index: number;
  side: "left" | "right";
  /** Depth in its home stack; 0 is the exposed top sheet. */
  layer: number;
  homeX: number;
  homeY: number;
  homeZ: number;
  homeQX: number;
  homeQY: number;
  homeQZ: number;
  homeQW: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  /** 0 = still bound to the closed book, 1 = fully adrift. */
  release: number;
  /** Seconds after entry before this leaf starts loosening. */
  releaseDelay: number;
  /** Landing glide rate variation so the pile reassembles organically. */
  landRate: number;
  /** Pairwise clearance force, accumulated before integration each step. */
  pairFX: number;
  pairFY: number;
  pairFZ: number;
  /** sin of the out-of-plane tilt, refreshed by the depth projection. */
  swing: number;
  sepX: number;
  sepY: number;
  sepZ: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  seedA: number;
  seedB: number;
  seedC: number;
}

export interface DriftPointerInput {
  /** Viewport-centered pointer x in CSS px (clientX - innerWidth / 2). */
  screenX: number;
  /** Viewport-centered pointer y, +up (innerHeight / 2 - clientY). */
  screenY: number;
  inside: boolean;
  pressed: boolean;
  /** Horizontal book-group shift in scene space (bookRestingShift). */
  shift: number;
  /** Camera distance to the z = 0 page plane. */
  cameraDistance: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface DriftFieldParams {
  pw: number;
  ph: number;
  totalLeaves: number;
  currentSpread: number;
  seed: number;
}

export interface DriftField {
  readonly pw: number;
  readonly ph: number;
  readonly leaves: DriftLeafState[];
  phase: DriftPhase;
  time: number;
  /** Index of the leaf held by the pointer, or -1. */
  grabIndex: number;
  grabLocalX: number;
  grabLocalY: number;
  wasPressed: boolean;
  /** Set for one step when a click lands on open air. */
  puffed: boolean;
  /** Rotational inertia of one leaf (unit mass thin plate). */
  readonly inertia: number;
  /** Linear force scale so motion feels page-relative on every viewport. */
  readonly pageScale: number;
  /** Local pick coordinates from the most recent successful pickDriftLeaf. */
  pickLocalX: number;
  pickLocalY: number;
}

/** Matches the real stack pitch so the landed pile occupies the same slab the
    resting book's stack boxes render. */
export const DRIFT_LAYER_GAP = 2.3;
/** Gravity fades over roughly a second; each leaf takes this long to loosen. */
export const DRIFT_RELEASE_SECONDS = 1.0;
/** Extra per-leaf delay so the book comes apart as a cascade, not a pop. */
export const DRIFT_RELEASE_STAGGER = 0.55;
const REFERENCE_PAGE_WIDTH = 560;

const LINEAR_DAMPING = 0.72;
const ANGULAR_DAMPING = 0.9;
const GRABBED_EXTRA_DAMPING = 2.4;
export const DRIFT_MAX_SPEED = 300;
export const DRIFT_MAX_SPIN = 1.25;

const AMBIENT_ACCEL = 34;
/** Angular acceleration amplitude (rad/s²); against the angular damping this
    sustains a slow idle tumble of roughly 0.05-0.1 rad/s. The mix below is
    roll-dominant: in-plane spin can never cut a neighbouring sheet. */
const AMBIENT_TORQUE = 0.08;
/** Paper drifting in still air settles broadside-on. This restoring torque
    (∝ sin of the tilt) holds every sheet within a gentle wobble of facing
    the camera — the calm look, and the reason mostly-parallel leaves can
    share the depth range without knifing through one another. */
const ALIGN_TORQUE = 0.85;
/** Hard ceiling (~18°) on the out-of-plane tilt. Torques merely prefer
    broadside; this clamp is what guarantees the tilt budget the depth
    projection below prices its gaps against, so no yank can wheel a sheet
    through its neighbours. In-plane roll stays unlimited. */
const SWING_CAP = 0.32;
const COS_SWING_CAP = Math.cos(SWING_CAP);

/** Two leaves whose centers overlap in the viewing plane should hold this
    much depth between them; inside it a soft shuffle pushes them apart,
    depth-first with a light lateral shrug. Comfort spacing only — the hard
    guarantee is the depth projection below. */
const PAIR_XY_REACH_RATIO = 0.7;
const PAIR_Z_CLEARANCE = 72;
const PAIR_PUSH_ACCEL = 620;
const PAIR_LATERAL_ACCEL = 90;

/** Non-penetration, position-based: after integration, any two released
    leaves whose footprints overlap in the viewing plane are PROJECTED apart
    in depth until their gap covers both sheets' actual reach — a flex
    budget plus a term for how far each tilted plane departs from vertical
    slabhood. Scaled by release so the resting pile can exist, rate-limited
    so neighbours part instead of teleporting, and skipped entirely during
    the landing collapse. */
const PAIR_HARD_X_RATIO = 0.95;
const PAIR_HARD_Y_RATIO = 0.9;
const PAIR_HARD_BASE_GAP = 48;
const PAIR_HARD_TILT_GAP = 190;
const PAIR_HARD_ITERATIONS = 3;
const PAIR_HARD_MAX_STEP = 260;
/** A held leaf is the reader's anchor: the pile parts around it. */
const PAIR_GRABBED_MOBILITY = 0.12;
const HARD_Z_FLOOR = 6;
const HARD_Z_HEADROOM = 40;
export const DRIFT_CURRENT_ACCEL = 340;
export const DRIFT_CURRENT_RADIUS_RATIO = 0.6;
export const DRIFT_PUFF_SPEED = 230;
export const DRIFT_PUFF_RADIUS_RATIO = 0.95;

const SEPARATION_SPEED = 92;
const SEPARATION_SPIN = 0.34;

const CONTAIN_ACCEL = 7;
const CONTAIN_BRAKE = 3;
const CONTAIN_MARGIN_X_RATIO = 0.45;
const CONTAIN_MARGIN_Y_RATIO = 0.42;
const CONTAIN_Z_MIN = 10;
/** Deep enough toward the camera that eleven sheets can layer with real
    clearance; the perspective-aware x/y bounds shrink to compensate. */
const CONTAIN_Z_MAX_RATIO = 0.7;

const GRAB_STIFFNESS = 60;
const GRAB_DAMPING = 15.5;
const GRAB_PICK_PAD = 6;

export const DRIFT_LAND_RATE = 3.2;
const LAND_BRAKE = 6;
export const DRIFT_LAND_DISTANCE = 0.5;
export const DRIFT_LAND_SPEED = 2;
export const DRIFT_LAND_SPIN = 0.01;
/** cos(half-angle) for ~0.002 rad of total orientation error. */
const LAND_ALIGNMENT = 0.9999995;

const TAU = Math.PI * 2;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const smoothstep01 = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Deterministic per-leaf noise in [0, 1) — the burnField hash family. */
const hash01 = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Rotate (x, y, z) by quaternion q, writing into out. */
function rotate(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  x: number,
  y: number,
  z: number,
  out: DriftVec,
) {
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
}

export function createDriftField(params: DriftFieldParams): DriftField {
  const { pw, ph, totalLeaves, currentSpread, seed } = params;
  const total = Math.max(0, Math.floor(totalLeaves));
  const spread = clamp(Math.floor(currentSpread), 0, total);
  const leaves: DriftLeafState[] = [];

  for (let index = 0; index < total; index += 1) {
    const side: "left" | "right" = index < spread ? "left" : "right";
    // Left stack: sheet spread-1 is exposed on top; right stack: sheet spread.
    const layer = side === "left" ? spread - 1 - index : index - spread;
    const seedA = hash01(seed + index * 3.7);
    const seedB = hash01(seed + index * 9.1 + 47);
    const seedC = hash01(seed + index * 5.3 + 131);
    const homeZ = layer === 0 ? 0 : -layer * DRIFT_LAYER_GAP;
    // Separation direction: mostly toward the camera, fanning outward from
    // the spine so the book visibly opens apart rather than lifting as one.
    const sx = (side === "left" ? -1 : 1) * (0.24 + 0.5 * seedB);
    const sy = (seedC - 0.5) * 0.8;
    const sz = 0.55 + 0.45 * seedA;
    const length = Math.hypot(sx, sy, sz);
    leaves.push({
      index,
      side,
      layer,
      homeX: side === "left" ? -pw / 2 : pw / 2,
      homeY: 0,
      homeZ,
      homeQX: 0,
      homeQY: side === "left" ? 1 : 0,
      homeQZ: 0,
      homeQW: side === "left" ? 0 : 1,
      x: side === "left" ? -pw / 2 : pw / 2,
      y: 0,
      z: homeZ,
      qx: 0,
      qy: side === "left" ? 1 : 0,
      qz: 0,
      qw: side === "left" ? 0 : 1,
      vx: 0,
      vy: 0,
      vz: 0,
      wx: 0,
      wy: 0,
      wz: 0,
      release: 0,
      // Top sheets loosen first: the book peels open from its exposed faces.
      releaseDelay:
        (layer / Math.max(1, total - 1)) * DRIFT_RELEASE_STAGGER * 0.6 +
        seedB * DRIFT_RELEASE_STAGGER * 0.4,
      landRate: 0.85 + 0.3 * seedA,
      pairFX: 0,
      pairFY: 0,
      pairFZ: 0,
      swing: 0,
      sepX: (sx / length) * SEPARATION_SPEED,
      sepY: (sy / length) * SEPARATION_SPEED,
      sepZ: (sz / length) * SEPARATION_SPEED,
      // Departure spin is roll-dominant: the pile starts at a 2.3px pitch,
      // where any early out-of-plane tilt slices straight into a neighbour.
      spinX: (seedA - 0.5) * SEPARATION_SPIN * 0.3,
      spinY: (seedB - 0.5) * SEPARATION_SPIN * 0.3,
      spinZ: (seedC - 0.5) * SEPARATION_SPIN * 1.6,
      seedA,
      seedB,
      seedC,
    });
  }

  return {
    pw,
    ph,
    leaves,
    phase: "loosen",
    time: 0,
    grabIndex: -1,
    grabLocalX: 0,
    grabLocalY: 0,
    wasPressed: false,
    puffed: false,
    inertia: (pw * pw + ph * ph) / 12,
    pageScale: pw / REFERENCE_PAGE_WIDTH,
    pickLocalX: 0,
    pickLocalY: 0,
  };
}

/** Where the pointer ray crosses the plane at depth z, in group-local space. */
export function pointerPointAtDepth(
  input: DriftPointerInput,
  z: number,
  out: DriftVec,
) {
  const t = (input.cameraDistance - z) / input.cameraDistance;
  out.x = -input.shift + input.screenX * t;
  out.y = input.screenY * t;
  out.z = z;
}

const pickScratch: DriftVec = { x: 0, y: 0, z: 0 };
const pickScratch2: DriftVec = { x: 0, y: 0, z: 0 };

/**
 * Closest leaf under the pointer ray, or -1. On a hit the leaf-local grip
 * point is left in field.pickLocalX/Y so a grab can start without a second
 * intersection pass.
 */
export function pickDriftLeaf(field: DriftField, input: DriftPointerInput): number {
  const d = input.cameraDistance;
  const rox = -input.shift;
  const roy = 0;
  const roz = d;
  const rdx = input.screenX;
  const rdy = input.screenY;
  const rdz = -d;
  let best = -1;
  let bestS = Infinity;
  const halfW = field.pw / 2 + GRAB_PICK_PAD;
  const halfH = field.ph / 2 + GRAB_PICK_PAD;

  for (const leaf of field.leaves) {
    // Ray into the leaf frame: rotate by the conjugate quaternion.
    rotate(
      -leaf.qx,
      -leaf.qy,
      -leaf.qz,
      leaf.qw,
      rox - leaf.x,
      roy - leaf.y,
      roz - leaf.z,
      pickScratch,
    );
    rotate(-leaf.qx, -leaf.qy, -leaf.qz, leaf.qw, rdx, rdy, rdz, pickScratch2);
    if (Math.abs(pickScratch2.z) < 1e-6) continue;
    const s = -pickScratch.z / pickScratch2.z;
    if (s <= 0 || s >= bestS) continue;
    const hx = pickScratch.x + pickScratch2.x * s;
    const hy = pickScratch.y + pickScratch2.y * s;
    if (Math.abs(hx) > halfW || Math.abs(hy) > halfH) continue;
    best = leaf.index;
    bestS = s;
    field.pickLocalX = clamp(hx, -field.pw / 2, field.pw / 2);
    field.pickLocalY = clamp(hy, -field.ph / 2, field.ph / 2);
  }
  return best;
}

/** Switches the field into its glide-home phase. Idempotent. */
export function beginDriftLanding(field: DriftField) {
  if (field.phase === "landing" || field.phase === "landed") return;
  field.phase = "landing";
  field.grabIndex = -1;
}

const pointScratch: DriftVec = { x: 0, y: 0, z: 0 };
const gripScratch: DriftVec = { x: 0, y: 0, z: 0 };

/** A radial shove from the pointer to every leaf — the click gust. */
function applyPuff(field: DriftField, input: DriftPointerInput) {
  const radius = field.pw * DRIFT_PUFF_RADIUS_RATIO;
  for (const leaf of field.leaves) {
    if (leaf.release <= 0) continue;
    pointerPointAtDepth(input, leaf.z, pointScratch);
    const dx = leaf.x - pointScratch.x;
    const dy = leaf.y - pointScratch.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-3) {
      leaf.vz += DRIFT_PUFF_SPEED * field.pageScale * leaf.release;
      continue;
    }
    const falloff = Math.exp(-(distance * distance) / (radius * radius));
    const impulse =
      DRIFT_PUFF_SPEED * field.pageScale * falloff * leaf.release;
    const jx = (dx / distance) * impulse;
    const jy = (dy / distance) * impulse;
    // A gust also catches the sheet off-center: the closest point on the
    // leaf to the pointer carries the impulse, so nearby leaves tumble away
    // instead of translating like pushed cards.
    rotate(
      -leaf.qx,
      -leaf.qy,
      -leaf.qz,
      leaf.qw,
      pointScratch.x - leaf.x,
      pointScratch.y - leaf.y,
      pointScratch.z - leaf.z,
      gripScratch,
    );
    const lx = clamp(gripScratch.x, -field.pw / 2, field.pw / 2);
    const ly = clamp(gripScratch.y, -field.ph / 2, field.ph / 2);
    rotate(leaf.qx, leaf.qy, leaf.qz, leaf.qw, lx, ly, 0, gripScratch);
    leaf.vx += jx;
    leaf.vy += jy;
    leaf.vz += impulse * 0.25;
    leaf.wx += (gripScratch.y * impulse * 0.25 - gripScratch.z * jy) / field.inertia;
    leaf.wy += (gripScratch.z * jx - gripScratch.x * impulse * 0.25) / field.inertia;
    leaf.wz += (gripScratch.x * jy - gripScratch.y * jx) / field.inertia;
  }
  field.puffed = true;
}

function stepLanding(field: DriftField, dt: number) {
  let settled = true;
  for (const leaf of field.leaves) {
    const glide = 1 - Math.exp(-DRIFT_LAND_RATE * leaf.landRate * dt);
    leaf.x += (leaf.homeX - leaf.x) * glide;
    leaf.y += (leaf.homeY - leaf.y) * glide;
    leaf.z += (leaf.homeZ - leaf.z) * glide;
    const brake = Math.exp(-LAND_BRAKE * dt);
    leaf.vx *= brake;
    leaf.vy *= brake;
    leaf.vz *= brake;
    leaf.wx *= brake;
    leaf.wy *= brake;
    leaf.wz *= brake;
    // Shortest-path nlerp toward the home orientation. Steps are small, so
    // normalized lerp tracks slerp indistinguishably and stays branch-cheap.
    let dot =
      leaf.qx * leaf.homeQX +
      leaf.qy * leaf.homeQY +
      leaf.qz * leaf.homeQZ +
      leaf.qw * leaf.homeQW;
    const sign = dot < 0 ? -1 : 1;
    dot *= sign;
    leaf.qx += (leaf.homeQX * sign - leaf.qx) * glide;
    leaf.qy += (leaf.homeQY * sign - leaf.qy) * glide;
    leaf.qz += (leaf.homeQZ * sign - leaf.qz) * glide;
    leaf.qw += (leaf.homeQW * sign - leaf.qw) * glide;
    const norm = Math.hypot(leaf.qx, leaf.qy, leaf.qz, leaf.qw);
    leaf.qx /= norm;
    leaf.qy /= norm;
    leaf.qz /= norm;
    leaf.qw /= norm;
    leaf.release = Math.max(0, leaf.release - dt / DRIFT_RELEASE_SECONDS);

    const distance = Math.hypot(
      leaf.x - leaf.homeX,
      leaf.y - leaf.homeY,
      leaf.z - leaf.homeZ,
    );
    const speed = Math.hypot(leaf.vx, leaf.vy, leaf.vz);
    const spin = Math.hypot(leaf.wx, leaf.wy, leaf.wz);
    if (
      distance > DRIFT_LAND_DISTANCE ||
      speed > DRIFT_LAND_SPEED ||
      spin > DRIFT_LAND_SPIN ||
      dot < LAND_ALIGNMENT
    ) {
      settled = false;
    }
  }
  if (settled) {
    for (const leaf of field.leaves) {
      leaf.x = leaf.homeX;
      leaf.y = leaf.homeY;
      leaf.z = leaf.homeZ;
      leaf.qx = leaf.homeQX;
      leaf.qy = leaf.homeQY;
      leaf.qz = leaf.homeQZ;
      leaf.qw = leaf.homeQW;
      leaf.vx = 0;
      leaf.vy = 0;
      leaf.vz = 0;
      leaf.wx = 0;
      leaf.wy = 0;
      leaf.wz = 0;
      leaf.release = 0;
    }
    field.phase = "landed";
  }
}

/**
 * Advance the field one frame. Mutates in place with zero allocations; the
 * caller owns the frame cadence (the r3f loop or a test harness).
 */
export function stepDriftField(
  field: DriftField,
  rawDt: number,
  input: DriftPointerInput,
) {
  const dt = clamp(rawDt, 1 / 240, 1 / 30);
  field.time += dt;
  field.puffed = false;

  if (field.phase === "landed") return;
  if (field.phase === "landing") {
    field.wasPressed = input.pressed;
    stepLanding(field, dt);
    return;
  }

  if (field.phase === "loosen") {
    let allReleased = true;
    for (const leaf of field.leaves) {
      const target = smoothstep01(
        (field.time - leaf.releaseDelay) / DRIFT_RELEASE_SECONDS,
      );
      const gain = target - leaf.release;
      if (gain > 0) {
        // Separation speed is tied to the release rate: over the whole fade
        // each leaf gains exactly its seeded departure velocity, however the
        // frame cadence slices the window.
        leaf.vx += leaf.sepX * field.pageScale * gain;
        leaf.vy += leaf.sepY * field.pageScale * gain;
        leaf.vz += leaf.sepZ * field.pageScale * gain;
        leaf.wx += leaf.spinX * gain;
        leaf.wy += leaf.spinY * gain;
        leaf.wz += leaf.spinZ * gain;
        leaf.release = target;
      }
      if (leaf.release < 1) allReleased = false;
    }
    if (allReleased) field.phase = "adrift";
  }

  const pressedEdge = input.pressed && !field.wasPressed;
  if (pressedEdge && input.inside) {
    const hit = pickDriftLeaf(field, input);
    if (hit >= 0) {
      field.grabIndex = hit;
      field.grabLocalX = field.pickLocalX;
      field.grabLocalY = field.pickLocalY;
    } else {
      applyPuff(field, input);
    }
  }
  if (!input.pressed) field.grabIndex = -1;
  field.wasPressed = input.pressed;

  const currentRadius = field.pw * DRIFT_CURRENT_RADIUS_RATIO;
  const maxSpeed = DRIFT_MAX_SPEED * field.pageScale;
  const zMax = field.ph * CONTAIN_Z_MAX_RATIO;

  // Pairwise clearance: any two released leaves that overlap in the viewing
  // plane shuffle apart, depth-first. O(n²) over eleven leaves is nothing.
  const reach = field.pw * PAIR_XY_REACH_RATIO;
  for (const leaf of field.leaves) {
    leaf.pairFX = 0;
    leaf.pairFY = 0;
    leaf.pairFZ = 0;
  }
  for (let i = 0; i < field.leaves.length; i += 1) {
    const a = field.leaves[i]!;
    if (a.release <= 0) continue;
    for (let j = i + 1; j < field.leaves.length; j += 1) {
      const b = field.leaves[j]!;
      if (b.release <= 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lateral = Math.hypot(dx, dy);
      if (lateral >= reach) continue;
      const dz = b.z - a.z;
      const gap = Math.abs(dz);
      if (gap >= PAIR_Z_CLEARANCE) continue;
      // Perfectly co-planar pairs (the freshly loosened pile) break the tie
      // deterministically: the later sheet steps toward the camera.
      const direction = dz !== 0 ? Math.sign(dz) : 1;
      const deficit = (PAIR_Z_CLEARANCE - gap) / PAIR_Z_CLEARANCE;
      const closeness = 1 - lateral / reach;
      const gate = a.release * b.release;
      const push = PAIR_PUSH_ACCEL * deficit * closeness * gate * 0.5;
      a.pairFZ -= direction * push;
      b.pairFZ += direction * push;
      if (lateral > 1e-3) {
        const shrug =
          PAIR_LATERAL_ACCEL * deficit * closeness * gate * 0.5;
        const nx = dx / lateral;
        const ny = dy / lateral;
        a.pairFX -= nx * shrug;
        a.pairFY -= ny * shrug;
        b.pairFX += nx * shrug;
        b.pairFY += ny * shrug;
      }
    }
  }

  for (const leaf of field.leaves) {
    if (leaf.release <= 0) continue;
    const r = leaf.release;
    let fx = 0;
    let fy = 0;
    let fz = 0;
    let tx = 0;
    let ty = 0;
    let tz = 0;

    // Ambient air: slow incommensurate sines per leaf so the scene never
    // freezes but never reads as turbulence either.
    const t = field.time;
    const amb = AMBIENT_ACCEL * field.pageScale * r;
    fx +=
      amb *
      (0.6 * Math.sin(t * 0.37 + leaf.seedA * TAU) +
        0.4 * Math.sin(t * 0.11 + leaf.seedB * TAU + leaf.y * 0.003));
    fy +=
      amb *
      (0.6 * Math.sin(t * 0.29 + leaf.seedB * TAU) +
        0.4 * Math.sin(t * 0.13 + leaf.seedC * TAU + leaf.x * 0.003));
    fz += amb * 0.5 * Math.sin(t * 0.17 + leaf.seedC * TAU);
    const ambientSpin = AMBIENT_TORQUE * r * field.inertia;
    tx += ambientSpin * 0.35 * Math.sin(t * 0.23 + leaf.seedC * TAU);
    ty += ambientSpin * 0.5 * Math.sin(t * 0.19 + leaf.seedA * TAU);
    tz += ambientSpin * 1.1 * Math.sin(t * 0.31 + leaf.seedB * TAU);

    // Broadside-on preference: torque along n × ẑ eases the sheet's normal
    // toward whichever camera-facing pole it is already nearest, so flipped
    // leaves stay flipped and every sheet wobbles instead of knifing.
    rotate(leaf.qx, leaf.qy, leaf.qz, leaf.qw, 0, 0, 1, gripScratch);
    const facing = gripScratch.z >= 0 ? 1 : -1;
    const alignGain = ALIGN_TORQUE * field.inertia * r * facing;
    tx += gripScratch.y * alignGain;
    ty += -gripScratch.x * alignGain;

    fx += leaf.pairFX;
    fy += leaf.pairFY;
    fz += leaf.pairFZ;

    if (input.inside && field.grabIndex !== leaf.index) {
      // The pointer's air current: a soft radial push, applied at the point
      // of the sheet nearest the hand so close passes shoulder leaves into a
      // slow tumble rather than a parallel slide.
      pointerPointAtDepth(input, leaf.z, pointScratch);
      const dx = leaf.x - pointScratch.x;
      const dy = leaf.y - pointScratch.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 1e-3) {
        const falloff = Math.exp(
          -(distance * distance) / (currentRadius * currentRadius),
        );
        const strength = DRIFT_CURRENT_ACCEL * field.pageScale * falloff * r;
        const cfx = (dx / distance) * strength;
        const cfy = (dy / distance) * strength;
        fx += cfx;
        fy += cfy;
        rotate(
          -leaf.qx,
          -leaf.qy,
          -leaf.qz,
          leaf.qw,
          pointScratch.x - leaf.x,
          pointScratch.y - leaf.y,
          pointScratch.z - leaf.z,
          gripScratch,
        );
        const lx = clamp(gripScratch.x, -field.pw / 2, field.pw / 2);
        const ly = clamp(gripScratch.y, -field.ph / 2, field.ph / 2);
        rotate(leaf.qx, leaf.qy, leaf.qz, leaf.qw, lx, ly, 0, gripScratch);
        tx += -gripScratch.z * cfy;
        ty += gripScratch.z * cfx;
        tz += gripScratch.x * cfy - gripScratch.y * cfx;
      }
    }

    let grabbed = false;
    if (field.grabIndex === leaf.index) {
      grabbed = true;
      // Critically-damped spring from the gripped point of the sheet to the
      // pointer ray at the grip's own depth — dragging never changes depth.
      rotate(
        leaf.qx,
        leaf.qy,
        leaf.qz,
        leaf.qw,
        field.grabLocalX,
        field.grabLocalY,
        0,
        gripScratch,
      );
      const gx = leaf.x + gripScratch.x;
      const gy = leaf.y + gripScratch.y;
      const gz = leaf.z + gripScratch.z;
      pointerPointAtDepth(input, gz, pointScratch);
      const gvx = leaf.vx + leaf.wy * gripScratch.z - leaf.wz * gripScratch.y;
      const gvy = leaf.vy + leaf.wz * gripScratch.x - leaf.wx * gripScratch.z;
      const gvz = leaf.vz + leaf.wx * gripScratch.y - leaf.wy * gripScratch.x;
      const gfx = GRAB_STIFFNESS * (pointScratch.x - gx) - GRAB_DAMPING * gvx;
      const gfy = GRAB_STIFFNESS * (pointScratch.y - gy) - GRAB_DAMPING * gvy;
      const gfz = GRAB_STIFFNESS * (pointScratch.z - gz) - GRAB_DAMPING * gvz;
      fx += gfx;
      fy += gfy;
      fz += gfz;
      tx += gripScratch.y * gfz - gripScratch.z * gfy;
      ty += gripScratch.z * gfx - gripScratch.x * gfz;
      tz += gripScratch.x * gfy - gripScratch.y * gfx;
    }

    // Soft containment: leaves may approach the viewport edge but a growing
    // counter-force (plus a brake on the outward velocity) always turns them
    // around before any part could leave the screen for long.
    const perspective = Math.max(
      0.4,
      (input.cameraDistance - leaf.z) / input.cameraDistance,
    );
    const boundX = Math.max(
      30,
      (input.viewportWidth / 2) * perspective - field.pw * CONTAIN_MARGIN_X_RATIO,
    );
    const boundY = Math.max(
      24,
      (input.viewportHeight / 2) * perspective -
        field.ph * CONTAIN_MARGIN_Y_RATIO,
    );
    const cx = leaf.x + input.shift;
    if (cx > boundX) {
      fx -= (cx - boundX) * CONTAIN_ACCEL * r + CONTAIN_BRAKE * Math.max(0, leaf.vx);
    } else if (cx < -boundX) {
      fx += (-boundX - cx) * CONTAIN_ACCEL * r - CONTAIN_BRAKE * Math.min(0, leaf.vx);
    }
    if (leaf.y > boundY) {
      fy -= (leaf.y - boundY) * CONTAIN_ACCEL * r + CONTAIN_BRAKE * Math.max(0, leaf.vy);
    } else if (leaf.y < -boundY) {
      fy += (-boundY - leaf.y) * CONTAIN_ACCEL * r - CONTAIN_BRAKE * Math.min(0, leaf.vy);
    }
    if (leaf.z > zMax) {
      fz -= (leaf.z - zMax) * CONTAIN_ACCEL * r + CONTAIN_BRAKE * Math.max(0, leaf.vz);
    } else if (leaf.z < CONTAIN_Z_MIN) {
      fz += (CONTAIN_Z_MIN - leaf.z) * CONTAIN_ACCEL * r - CONTAIN_BRAKE * Math.min(0, leaf.vz);
    }

    // Semi-implicit Euler with exponential damping; unit mass.
    leaf.vx += fx * dt;
    leaf.vy += fy * dt;
    leaf.vz += fz * dt;
    const linearDamp = Math.exp(
      -(LINEAR_DAMPING + (grabbed ? GRABBED_EXTRA_DAMPING : 0)) * dt,
    );
    leaf.vx *= linearDamp;
    leaf.vy *= linearDamp;
    leaf.vz *= linearDamp;
    const speed = Math.hypot(leaf.vx, leaf.vy, leaf.vz);
    if (speed > maxSpeed) {
      const cap = maxSpeed / speed;
      leaf.vx *= cap;
      leaf.vy *= cap;
      leaf.vz *= cap;
    }
    leaf.x += leaf.vx * dt;
    leaf.y += leaf.vy * dt;
    leaf.z += leaf.vz * dt;

    leaf.wx += (tx / field.inertia) * dt;
    leaf.wy += (ty / field.inertia) * dt;
    leaf.wz += (tz / field.inertia) * dt;
    const angularDamp = Math.exp(
      -(ANGULAR_DAMPING + (grabbed ? GRABBED_EXTRA_DAMPING : 0)) * dt,
    );
    leaf.wx *= angularDamp;
    leaf.wy *= angularDamp;
    leaf.wz *= angularDamp;
    const spin = Math.hypot(leaf.wx, leaf.wy, leaf.wz);
    if (spin > DRIFT_MAX_SPIN) {
      const cap = DRIFT_MAX_SPIN / spin;
      leaf.wx *= cap;
      leaf.wy *= cap;
      leaf.wz *= cap;
    }

    // dq/dt = ω ⊗ q / 2, then renormalize to hold unit length.
    const hx = leaf.wx * 0.5 * dt;
    const hy = leaf.wy * 0.5 * dt;
    const hz = leaf.wz * 0.5 * dt;
    const nqx = leaf.qx + (hx * leaf.qw + hy * leaf.qz - hz * leaf.qy);
    const nqy = leaf.qy + (hy * leaf.qw + hz * leaf.qx - hx * leaf.qz);
    const nqz = leaf.qz + (hz * leaf.qw + hx * leaf.qy - hy * leaf.qx);
    const nqw = leaf.qw + (-hx * leaf.qx - hy * leaf.qy - hz * leaf.qz);
    const norm = Math.hypot(nqx, nqy, nqz, nqw);
    leaf.qx = nqx / norm;
    leaf.qy = nqy / norm;
    leaf.qz = nqz / norm;
    leaf.qw = nqw / norm;
    clampSwing(leaf);
  }

  projectDepthClearance(field, dt);
}

/** Hard tilt ceiling: rotate the leaf back toward its nearest camera-facing
    pole just enough to stay inside SWING_CAP. Applied about the world axis
    n × pole, which never disturbs in-plane roll. */
function clampSwing(leaf: DriftLeafState) {
  const { qx, qy, qz, qw } = leaf;
  const nx = 2 * (qx * qz + qy * qw);
  const ny = 2 * (qy * qz - qx * qw);
  const nz = 1 - 2 * (qx * qx + qy * qy);
  const pole = nz >= 0 ? 1 : -1;
  const cosTilt = clamp(nz * pole, -1, 1);
  if (cosTilt >= COS_SWING_CAP) return;
  const axisX = ny * pole;
  const axisY = -nx * pole;
  const axisLength = Math.hypot(axisX, axisY);
  if (axisLength < 1e-6) return;
  const half = (Math.acos(cosTilt) - SWING_CAP) / 2;
  const s = Math.sin(half) / axisLength;
  const rx = axisX * s;
  const ry = axisY * s;
  const rw = Math.cos(half);
  const cqx = rw * qx + rx * qw + ry * qz;
  const cqy = rw * qy + ry * qw - rx * qz;
  const cqz = rw * qz + rx * qy - ry * qx;
  const cqw = rw * qw - rx * qx - ry * qy;
  const norm = Math.hypot(cqx, cqy, cqz, cqw);
  leaf.qx = cqx / norm;
  leaf.qy = cqy / norm;
  leaf.qz = cqz / norm;
  leaf.qw = cqw / norm;
}

/** Position-based non-penetration between overlapping leaves; see the
    constant block above for the contract. Gauss-Seidel over all pairs — a
    few sweeps settle an eleven-leaf chain. */
function projectDepthClearance(field: DriftField, dt: number) {
  const reachX = field.pw * PAIR_HARD_X_RATIO;
  const reachY = field.ph * PAIR_HARD_Y_RATIO;
  const maxStep = PAIR_HARD_MAX_STEP * dt;
  const zCeil = field.ph * CONTAIN_Z_MAX_RATIO + HARD_Z_HEADROOM;
  for (const leaf of field.leaves) {
    const nz = 1 - 2 * (leaf.qx * leaf.qx + leaf.qy * leaf.qy);
    leaf.swing = Math.sqrt(Math.max(0, 1 - nz * nz));
  }
  for (let sweep = 0; sweep < PAIR_HARD_ITERATIONS; sweep += 1) {
    for (let i = 0; i < field.leaves.length; i += 1) {
      const a = field.leaves[i]!;
      if (a.release <= 0) continue;
      for (let j = i + 1; j < field.leaves.length; j += 1) {
        const b = field.leaves[j]!;
        if (b.release <= 0) continue;
        // Elliptical footprint-overlap test so tall pages separate on their
        // long axis too, not just across the spine.
        const ox = (b.x - a.x) / reachX;
        const oy = (b.y - a.y) / reachY;
        if (ox * ox + oy * oy >= 1) continue;
        const gate = a.release * b.release;
        const required =
          gate *
          (PAIR_HARD_BASE_GAP + PAIR_HARD_TILT_GAP * (a.swing + b.swing));
        const dz = b.z - a.z;
        const gap = Math.abs(dz);
        if (gap >= required) continue;
        // Co-planar tie: the later sheet steps toward the camera.
        const direction = dz !== 0 ? Math.sign(dz) : 1;
        const correction = Math.min(required - gap, maxStep);
        const mobilityA =
          field.grabIndex === a.index ? PAIR_GRABBED_MOBILITY : 1;
        const mobilityB =
          field.grabIndex === b.index ? PAIR_GRABBED_MOBILITY : 1;
        const total = mobilityA + mobilityB;
        a.z -= direction * correction * (mobilityA / total);
        b.z += direction * correction * (mobilityB / total);
        a.z = clamp(a.z, HARD_Z_FLOOR, zCeil);
        b.z = clamp(b.z, HARD_Z_FLOOR, zCeil);
        // Inelastic contact: closing depth velocity dies with the overlap.
        if ((b.vz - a.vz) * direction < 0) {
          const shared =
            (a.vz * mobilityB + b.vz * mobilityA) / total;
          a.vz = shared;
          b.vz = shared;
        }
      }
    }
  }
}

/** World position of a leaf-local point, written into out. */
export function driftLeafPoint(
  leaf: DriftLeafState,
  lx: number,
  ly: number,
  lz: number,
  out: DriftVec,
) {
  rotate(leaf.qx, leaf.qy, leaf.qz, leaf.qw, lx, ly, lz, out);
  out.x += leaf.x;
  out.y += leaf.y;
  out.z += leaf.z;
}

/**
 * Writes the carrier-transformed rest grid into a preallocated guide array —
 * the target surface the sheet solver then flexes against. One rotation
 * matrix per leaf per frame beats half a thousand quaternion sandwiches.
 * Grid order matches PlaneGeometry: rows top to bottom, column 0 the spine.
 */
export function writeDriftLeafGuide(
  leaf: DriftLeafState,
  columnsX: ArrayLike<number>,
  rowsY: ArrayLike<number>,
  guide: DriftVec[],
) {
  const { qx, qy, qz, qw } = leaf;
  const m00 = 1 - 2 * (qy * qy + qz * qz);
  const m01 = 2 * (qx * qy - qz * qw);
  const m10 = 2 * (qx * qy + qz * qw);
  const m11 = 1 - 2 * (qx * qx + qz * qz);
  const m20 = 2 * (qx * qz - qy * qw);
  const m21 = 2 * (qy * qz + qx * qw);
  let vertex = 0;
  for (let row = 0; row < rowsY.length; row += 1) {
    const ly = rowsY[row]!;
    for (let column = 0; column < columnsX.length; column += 1) {
      const lx = columnsX[column]!;
      const point = guide[vertex]!;
      point.x = leaf.x + m00 * lx + m01 * ly;
      point.y = leaf.y + m10 * lx + m11 * ly;
      point.z = leaf.z + m20 * lx + m21 * ly;
      vertex += 1;
    }
  }
}
