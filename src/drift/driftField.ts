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
  /** How flat this page is currently pressed by its neighbours. Driven by the
      overlaps the solver actually fails to clear, so a page jammed into the
      pile flattens while one with open air around it keeps its lean. */
  crowdCap: number;
  /** Worst unmet clearance this page was party to last frame; scratch for the
      cap above, kept on the leaf so the loop allocates nothing. */
  crowdResidual: number;
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
  /** World-space in-plane axes and normal, refreshed by the projection. */
  axisUX: number;
  axisUY: number;
  axisUZ: number;
  axisVX: number;
  axisVY: number;
  axisVZ: number;
  axisNX: number;
  axisNY: number;
  axisNZ: number;
  /** How many neighbours crowd this leaf's footprint, refreshed with the
      soft pair pass; crowded pages press flat. */
  crowd: number;
  /** Perspective counter-scale (d - z) / d, capped at 1: the leaf's world
      size shrinks by exactly the factor perspective would magnify it, so a
      floating page never looks zoomed and lands at exactly full size. */
  scale: number;
  /** The drawn sheet's z-deviation from its carrier plane, measured per cell
      over the page. This is what turns clearance from a worst-case constant
      into real collision: two sheets rippling the same way locally need
      almost no gap, while the gap grows exactly where they would touch. */
  devMax: Float32Array;
  devMin: Float32Array;
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
  /** Where the press began, and how far it has strayed since — a tap gusts,
      a drag carries a leaf. */
  pressX: number;
  pressY: number;
  pressTravel: number;
  /** Set for one step when a tap releases its gust. */
  puffed: boolean;
  /** Last pointer position on the page plane, for the gust wake. */
  pointerWX: number;
  pointerWY: number;
  pointerTracked: boolean;
  /** Depth-sorted leaf indices and their inverse, rebuilt each projection
      pass so every pairwise correction agrees on one stacking order. */
  readonly order: number[];
  readonly rank: number[];

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

const LINEAR_DAMPING = 0.5;
const ANGULAR_DAMPING = 0.55;
const GRABBED_EXTRA_DAMPING = 2.4;
export const DRIFT_MAX_SPEED = 520;
export const DRIFT_MAX_SPIN = 2.4;
/** Angular velocity splits into two halves with very different prices.
    ROLL — spin about the sheet's own normal — wheels the page in its own
    plane without moving that plane through depth, so it costs the clearance
    budget nothing at all. TUMBLE — everything else — swings the plane
    through depth, and is the whole reason the pile needs gaps. Damping and
    capping the two together made the free half as scarce as the costly one,
    which is why a windstorm read as a slow shuffle. Roll is now allowed to
    be genuinely fast, and to hold its speed far longer than a tumble does. */
export const DRIFT_MAX_ROLL = 5.2;
const ROLL_DAMPING_RATIO = 0.42;

/** Pages fly at a fraction of their resting size. Eleven full-size sheets
    cover three times the viewport, so they overlap almost everywhere and the
    depth budget is spent entirely on keeping that pile apart — which is what
    left them too flat to read as weather. Shrinking them buys twice over:
    the overlapping area falls with the SQUARE of the scale, and each page's
    depth reach falls linearly with it. Rides in and out on release, so the
    book comes apart and reassembles at its true size. */
export const DRIFT_PAGE_SCALE = 0.58;

const AMBIENT_ACCEL = 46;
/** Angular acceleration amplitude (rad/s²). All three axes carry real
    energy now — pages pitch, yaw, and roll; the depth projection prices
    every tilt, so tumble no longer needs to be roll-only to stay safe. */
const AMBIENT_TORQUE = 0.5;
/** The air's own spin, applied about each sheet's normal. Free of the depth
    budget, so this is where the storm's energy can go without ever pushing
    two pages through one another. */
const AMBIENT_ROLL_TORQUE = 0.85;
/** Paper drifting in still air settles broadside-on — eventually. This is
    the one torque that actively works against the look: it turns pages to
    face the camera, and a page facing the camera is a page not turning. Kept
    barely strong enough to stop sheets ending up permanently edge-on. */
const ALIGN_TORQUE = 0.15;
/** Hard ceiling (~62°) on the out-of-plane tilt: deep enough to read as
    paper wheeling through the air, bounded enough that the depth projection
    can always price a gap that fits the containment volume. In-plane roll
    stays unlimited — pages spin freely. */
const SWING_CAP = 0.8;
/** A pinched page stays flat in the hand: the held leaf keeps a shallow
    tilt so the pile it is swept through only ever needs modest gaps to
    part around it — the grabbed leaf barely yields in the projection. */
const GRABBED_SWING_CAP = 0.35;

/** Two leaves whose centers overlap in the viewing plane should hold this
    much depth between them; inside it a soft shuffle pushes them apart,
    depth-first with a broad lateral shrug that also scatters the pile
    across the viewport. Comfort spacing only — the hard guarantee is the
    depth projection below. */
const PAIR_XY_REACH_RATIO = 0.85;
const PAIR_Z_CLEARANCE = 84;
const PAIR_PUSH_ACCEL = 900;
const PAIR_LATERAL_ACCEL = 170;

/** Non-penetration, position-based: after integration, any two released
    leaves whose footprints overlap in the viewing plane are PROJECTED apart
    in depth until their gap covers both sheets' actual reach — a flex
    budget plus each tilted plane's true depth extent (sin of its tilt times
    its scaled half-diagonal), discounted by how far off-center the pair
    sits: two tilted planes can only cross where they overlap, so an
    edge-brushing pair needs a fraction of a concentric pair's gap. Scaled
    by release so the resting pile can exist, rate-limited so neighbours
    part instead of teleporting — EXCEPT when a true slab overlap already
    exists, which resolves at panic speed because visible clipping is worse
    than a fast shove. Skipped entirely during the landing collapse. */
const PAIR_HARD_X_RATIO = 1.3;
const PAIR_HARD_Y_RATIO = 1.15;
/** How far a flexing sheet may stray from its rigid carrier. Everything
    below separates CARRIERS, but what the eye sees is the sheet: flutter bow
    plus follow lag put the drawn surface tens of pixels off the plane this
    projection reasons about, so that displacement has to be bounded for the
    guarantee to mean anything on screen. Measured before the clamp existed:
    a still page bowed ~17px and a fast one reached 38px. */
/** Resolution of the measured deviation grid over each page. Sheets are
    curvature-constrained and therefore smooth, so a coarse grid captures
    their shape; each cell stores the extremes of every vertex inside it, so
    sampling stays conservative rather than missing a local spike. */
export const DRIFT_DEV_GRID = 4;
export const DRIFT_DEV_CELLS = DRIFT_DEV_GRID * DRIFT_DEV_GRID;
/** A safety bound on sheet deviation. With clearance now measured from the
    real surfaces this no longer buys gap — it only keeps one pathological
    frame from outrunning the one-frame-stale measurement below. */
export const DRIFT_SHEET_MAX_DEVIATION = 46;
/** Slack over the measured surface separation: one frame of staleness (the
    grids describe last frame's sheets) plus solver discreteness. It no
    longer has to cover the worst bow imaginable, because the requirement
    now measures the bow that is actually there. */
const PAIR_FLEX_SLACK = 12;
/** Sweeps of the final floor-only pass; it converges fast because the floor
    it enforces is small enough to always fit the depth range. */
const FLEX_FLOOR_SWEEPS = 4;
/** Sweeps of the two-sided stack relaxation per frame. */
const STACK_RELAXATIONS = 3;
/** Closed loop on the crowd flattening. Residual violation the solver may
    leave before the pile is pressed flatter, and the rates it tightens and
    releases at — fast enough to answer a gust, slow enough that pages are
    not visibly snapped flat. */
const CROWD_TOLERANCE = 0.5;
const CROWD_TIGHTEN = 0.8;
const CROWD_RELEASE = 1.015;
const CROWD_MIN_CAP = 0.05;
/** Depth corrections are nearly invisible on screen — the perspective
    counter-scale holds apparent size constant — so the stack passes may
    move leaves briskly along z without reading as snaps. */
const PAIR_HARD_PANIC_STEP = 9000;
const PAIR_LATERAL_RELIEF = 0.9;
/** Crowded pages press flat: each overlapping neighbour multiplies the
    broadside restoring torque, cutting the tilt reach that drives the
    depth demand in the first place. */
const CROWD_ALIGN_BOOST = 2.2;
/** Sheets buried in a crowd are shielded from the wind: force and torque
    fade with neighbours, so piles peel from the outside in instead of the
    whole column being spun past what the depth range can hold. */
const CROWD_WIND_SHIELD = 0.8;
const CROWD_SPIN_DAMPING = 0.7;
const HARD_Z_FLOOR_RATIO = -1.16;
const HARD_Z_HEADROOM = 40;
export const DRIFT_CURRENT_ACCEL = 900;
export const DRIFT_CURRENT_RADIUS_RATIO = 0.75;
export const DRIFT_PUFF_SPEED = 420;
export const DRIFT_PUFF_RADIUS_RATIO = 1.1;
/** Pointer travel (px) within which a press still counts as a tap. Beyond
    it the press was a drag, and dragging a leaf must not also blast it. */
export const DRIFT_TAP_SLOP = 6;
/** Tumble imparted by a gust. A sheet hit dead centre has no lever arm for
    the radial shove, so without this the very case that should react most —
    a click in the middle of a page — would barely move at all. */
const PUFF_TUMBLE = 1.5;
/** The cursor's own motion is the wind. Its velocity across the page plane
    couples into every nearby leaf, so a fast sweep fans the pile in the
    sweep direction instead of merely parting it radially. */
const GUST_WAKE_COUPLING = 0.6;
const GUST_WAKE_RADIUS_RATIO = 1.05;
const GUST_WAKE_SPEED_CAP = 2600;
const GUST_WAKE_DISPERSION = 0.9;

const SEPARATION_SPEED = 130;
const SEPARATION_SPIN = 0.6;

const CONTAIN_ACCEL = 7;
const CONTAIN_BRAKE = 3;
const CONTAIN_MARGIN_X_RATIO = 0.45;
const CONTAIN_MARGIN_Y_RATIO = 0.42;
/** The drift volume reaches far BEHIND the resting page plane — empty white
    void, and the cheapest clearance there is. Every pair of overlapping
    pages needs depth between them, so depth is the currency the whole pile
    turns and folds on; there is nothing back there to crowd, and a page that
    drifts into it simply reads a little further away. */
export const CONTAIN_Z_MIN_RATIO = -1.1;
/** Deep enough toward the camera that eleven sheets can layer with real
    clearance; the perspective-aware x/y bounds shrink to compensate. */
export const CONTAIN_Z_MAX_RATIO = 0.82;

const GRAB_STIFFNESS = 60;
const GRAB_DAMPING = 15.5;
const GRAB_PICK_PAD = 6;
/** A held page rises gently toward the reader's hand — to the middle of the
    depth range, so the pile keeps headroom to clear over or under it. */
const GRAB_LIFT_RATE = 2;
const GRAB_LIFT_BAND = 0.55;
/** The hand's bow wave flattens the pages it sweeps past: leaves near the
    held one get their broadside restoring torque multiplied, dropping their
    tilt reach — and with it the depth gap they need — before contact. */
const GRAB_WAKE_ALIGN_BOOST = 3.5;

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
      crowdCap: SWING_CAP,
      crowdResidual: 0,
      // Top sheets loosen first: the book peels open from its exposed faces.
      releaseDelay:
        (layer / Math.max(1, total - 1)) * DRIFT_RELEASE_STAGGER * 0.6 +
        seedB * DRIFT_RELEASE_STAGGER * 0.4,
      landRate: 0.85 + 0.3 * seedA,
      pairFX: 0,
      pairFY: 0,
      pairFZ: 0,
      swing: 0,
      crowd: 0,
      axisUX: 1,
      axisUY: 0,
      axisUZ: 0,
      axisVX: 0,
      axisVY: 1,
      axisVZ: 0,
      axisNX: 0,
      axisNY: 0,
      axisNZ: 1,
      scale: 1,
      sepX: (sx / length) * SEPARATION_SPEED,
      sepY: (sy / length) * SEPARATION_SPEED,
      sepZ: (sz / length) * SEPARATION_SPEED,
      // Departure spin is roll-dominant: the pile starts at a 2.3px pitch,
      // where any early out-of-plane tilt slices straight into a neighbour.
      spinX: (seedA - 0.5) * SEPARATION_SPIN * 0.3,
      spinY: (seedB - 0.5) * SEPARATION_SPIN * 0.3,
      spinZ: (seedC - 0.5) * SEPARATION_SPIN * 1.6,
      devMax: new Float32Array(DRIFT_DEV_CELLS),
      devMin: new Float32Array(DRIFT_DEV_CELLS),
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
    pressX: 0,
    pressY: 0,
    pressTravel: 0,
    puffed: false,
    pointerWX: 0,
    pointerWY: 0,
    pointerTracked: false,
    order: leaves.map((leaf) => leaf.index),
    rank: leaves.map((leaf) => leaf.index),
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

  for (const leaf of field.leaves) {
    // Picking respects the perspective counter-scale: the rendered sheet is
    // leaf.scale of its nominal size, so the hit rectangle is too.
    const halfW = (field.pw / 2) * leaf.scale + GRAB_PICK_PAD;
    const halfH = (field.ph / 2) * leaf.scale + GRAB_PICK_PAD;
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
    field.pickLocalX = clamp(
      hx,
      (-field.pw / 2) * leaf.scale,
      (field.pw / 2) * leaf.scale,
    );
    field.pickLocalY = clamp(
      hy,
      (-field.ph / 2) * leaf.scale,
      (field.ph / 2) * leaf.scale,
    );
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
    const falloff = Math.exp(-(distance * distance) / (radius * radius));
    const impulse =
      DRIFT_PUFF_SPEED * field.pageScale * falloff * leaf.release;
    // A hit square in the middle of a sheet has no radial direction to push
    // along; give it a seeded one so the strongest hit is never the stillest.
    const away = distance > 1e-3
      ? { x: dx / distance, y: dy / distance }
      : { x: Math.cos(leaf.seedA * TAU), y: Math.sin(leaf.seedA * TAU) };
    const jx = away.x * impulse;
    const jy = away.y * impulse;
    // Air catching a sheet sets it tumbling; the lever arm below cannot do
    // this for a centred hit, so the gust supplies the spin directly.
    const tumble = PUFF_TUMBLE * falloff * leaf.release;
    leaf.wx += (leaf.seedB - 0.5) * tumble;
    leaf.wy += (leaf.seedC - 0.5) * tumble;
    leaf.wz += (leaf.seedA - 0.5) * tumble;
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
    const halfW = (field.pw / 2) * leaf.scale;
    const halfH = (field.ph / 2) * leaf.scale;
    const lx = clamp(gripScratch.x, -halfW, halfW);
    const ly = clamp(gripScratch.y, -halfH, halfH);
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
    for (const leaf of field.leaves) {
      // Same easing as the drifting path. Landing is precisely when the
      // flying size has to be handed back, and dropping the factor here
      // would return the whole difference in a single frame.
      leaf.scale =
        (1 - (1 - DRIFT_PAGE_SCALE) * leaf.release) *
        Math.min(1, (input.cameraDistance - leaf.z) / input.cameraDistance);
    }
    return;
  }

  // The gust wake: pointer velocity across the page plane, the directional
  // half of the wind. Tracked here so a still cursor blows nothing.
  pointerPointAtDepth(input, 0, pointScratch);
  let wakeX = 0;
  let wakeY = 0;
  if (input.inside && field.pointerTracked) {
    wakeX = clamp(
      (pointScratch.x - field.pointerWX) / dt,
      -GUST_WAKE_SPEED_CAP,
      GUST_WAKE_SPEED_CAP,
    );
    wakeY = clamp(
      (pointScratch.y - field.pointerWY) / dt,
      -GUST_WAKE_SPEED_CAP,
      GUST_WAKE_SPEED_CAP,
    );
  }
  field.pointerWX = pointScratch.x;
  field.pointerWY = pointScratch.y;
  field.pointerTracked = input.inside;

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
  const releasedEdge = !input.pressed && field.wasPressed;
  if (pressedEdge) {
    field.pressX = input.screenX;
    field.pressY = input.screenY;
    field.pressTravel = 0;
    // The grab still engages on the press itself, so dragging a leaf stays
    // immediate; only the gust waits to see whether this was a tap.
    if (input.inside) {
      const hit = pickDriftLeaf(field, input);
      if (hit >= 0) {
        field.grabIndex = hit;
        field.grabLocalX = field.pickLocalX;
        field.grabLocalY = field.pickLocalY;
      }
    }
  } else if (input.pressed) {
    field.pressTravel = Math.max(
      field.pressTravel,
      Math.hypot(input.screenX - field.pressX, input.screenY - field.pressY),
    );
  }
  if (releasedEdge) {
    const tapped = field.pressTravel <= DRIFT_TAP_SLOP;
    // Let the held leaf go BEFORE the gust, so a tap on a page shoves that
    // page too rather than gusting everything except the one clicked.
    field.grabIndex = -1;
    if (tapped && input.inside) applyPuff(field, input);
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
    leaf.crowd = 0;
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
      a.crowd += closeness * gate;
      b.crowd += closeness * gate;
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
    tx += ambientSpin * 0.8 * Math.sin(t * 0.23 + leaf.seedC * TAU);
    ty += ambientSpin * 0.9 * Math.sin(t * 0.19 + leaf.seedA * TAU);
    tz += ambientSpin * Math.sin(t * 0.31 + leaf.seedB * TAU);
    // Spin about the sheet's own normal costs no clearance, so the ambient
    // air drives it hard: slow enough to read as a drift rather than a
    // propeller, but a wheel the eye can actually follow.
    const ambientRoll =
      AMBIENT_ROLL_TORQUE *
      r *
      field.inertia *
      (0.7 * Math.sin(t * 0.21 + leaf.seedA * TAU) +
        0.3 * Math.sin(t * 0.47 + leaf.seedB * TAU));
    tx += leaf.axisNX * ambientRoll;
    ty += leaf.axisNY * ambientRoll;
    tz += leaf.axisNZ * ambientRoll;

    // Broadside-on preference: torque along n × ẑ eases the sheet's normal
    // toward whichever camera-facing pole it is already nearest, so flipped
    // leaves stay flipped and every sheet wobbles instead of knifing.
    rotate(leaf.qx, leaf.qy, leaf.qz, leaf.qw, 0, 0, 1, gripScratch);
    const facing = gripScratch.z >= 0 ? 1 : -1;
    // Crowded pages press flat, and pages in a held leaf's path press
    // flatter still — dropping the tilt reach that drives depth demand.
    let alignBoost = 1 + CROWD_ALIGN_BOOST * Math.min(2.5, leaf.crowd);
    if (field.grabIndex >= 0 && field.grabIndex !== leaf.index) {
      const held = field.leaves[field.grabIndex]!;
      const px = (leaf.x - held.x) / (field.pw * PAIR_HARD_X_RATIO);
      const py = (leaf.y - held.y) / (field.ph * PAIR_HARD_Y_RATIO);
      const proximity = 1 - Math.min(1, px * px + py * py);
      alignBoost += GRAB_WAKE_ALIGN_BOOST * proximity;
    }
    const alignGain = ALIGN_TORQUE * alignBoost * field.inertia * r * facing;
    tx += gripScratch.y * alignGain;
    ty += -gripScratch.x * alignGain;

    fx += leaf.pairFX;
    fy += leaf.pairFY;
    fz += leaf.pairFZ;

    if (input.inside && field.grabIndex !== leaf.index) {
      // The pointer's wind: a radial push away from the hand plus the
      // directional wake of the hand's own motion, both applied at the
      // point of the sheet nearest the pointer, so pages tumble and wheel
      // away instead of sliding off in formation.
      pointerPointAtDepth(input, leaf.z, pointScratch);
      const dx = leaf.x - pointScratch.x;
      const dy = leaf.y - pointScratch.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 1e-3) {
        const shield = 1 / (1 + CROWD_WIND_SHIELD * leaf.crowd);
        const falloff = Math.exp(
          -(distance * distance) / (currentRadius * currentRadius),
        );
        const strength =
          DRIFT_CURRENT_ACCEL * field.pageScale * falloff * r * shield;
        const wakeRadius = field.pw * GUST_WAKE_RADIUS_RATIO;
        const wakeFalloff = Math.exp(
          -(distance * distance) / (wakeRadius * wakeRadius),
        );
        const wakeGain = GUST_WAKE_COUPLING * wakeFalloff * r * shield;
        // Real gusts disperse: each leaf rides the wake with its own seeded
        // sideways bias, so a sweep fans the pile out instead of herding
        // every page into the corridor of the hand.
        const disperse = (leaf.seedB - 0.5) * GUST_WAKE_DISPERSION;
        const cfx =
          (dx / distance) * strength + (wakeX - wakeY * disperse) * wakeGain;
        const cfy =
          (dy / distance) * strength + (wakeY + wakeX * disperse) * wakeGain;
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
        const halfW = (field.pw / 2) * leaf.scale;
        const halfH = (field.ph / 2) * leaf.scale;
        const lx = clamp(gripScratch.x, -halfW, halfW);
        const ly = clamp(gripScratch.y, -halfH, halfH);
        rotate(leaf.qx, leaf.qy, leaf.qz, leaf.qw, lx, ly, 0, gripScratch);
        tx += -gripScratch.z * cfy;
        ty += gripScratch.z * cfx;
        tz += gripScratch.x * cfy - gripScratch.y * cfx;
      }
    }

    let grabbed = false;
    if (field.grabIndex === leaf.index) {
      grabbed = true;
      // Lift the held page toward the hand, above the pile it crosses.
      fz += (zMax * GRAB_LIFT_BAND - leaf.z) * GRAB_LIFT_RATE;
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
    } else if (leaf.z < field.ph * CONTAIN_Z_MIN_RATIO) {
      fz +=
        (field.ph * CONTAIN_Z_MIN_RATIO - leaf.z) * CONTAIN_ACCEL * r -
        CONTAIN_BRAKE * Math.min(0, leaf.vz);
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
    // Split the spin into the half that costs depth and the half that does
    // not, then price them separately. Crowding, which exists only to keep
    // the pile inside its depth budget, has no business slowing a roll.
    // Take the normal from the live quaternion rather than leaf.axisN*: the
    // cached axes are refreshed by the depth projection, which the landing
    // collapse skips, and a split against a stale normal would misfile
    // tumble as roll — the one direction that escapes the tumble cap.
    const nx = 2 * (leaf.qx * leaf.qz + leaf.qy * leaf.qw);
    const ny = 2 * (leaf.qy * leaf.qz - leaf.qx * leaf.qw);
    const nz = 1 - 2 * (leaf.qx * leaf.qx + leaf.qy * leaf.qy);
    const rollRate = leaf.wx * nx + leaf.wy * ny + leaf.wz * nz;
    let rollX = nx * rollRate;
    let rollY = ny * rollRate;
    let rollZ = nz * rollRate;
    let tumbleX = leaf.wx - rollX;
    let tumbleY = leaf.wy - rollY;
    let tumbleZ = leaf.wz - rollZ;

    const grabDamp = grabbed ? GRABBED_EXTRA_DAMPING : 0;
    const rollDamp = Math.exp(
      -(ANGULAR_DAMPING * ROLL_DAMPING_RATIO + grabDamp) * dt,
    );
    rollX *= rollDamp;
    rollY *= rollDamp;
    rollZ *= rollDamp;
    const rolled = Math.hypot(rollX, rollY, rollZ);
    if (rolled > DRIFT_MAX_ROLL) {
      const cap = DRIFT_MAX_ROLL / rolled;
      rollX *= cap;
      rollY *= cap;
      rollZ *= cap;
    }

    const tumbleDamp = Math.exp(
      -(ANGULAR_DAMPING * (1 + CROWD_SPIN_DAMPING * Math.min(2.5, leaf.crowd)) +
        grabDamp) *
        dt,
    );
    tumbleX *= tumbleDamp;
    tumbleY *= tumbleDamp;
    tumbleZ *= tumbleDamp;
    const tumbled = Math.hypot(tumbleX, tumbleY, tumbleZ);
    if (tumbled > DRIFT_MAX_SPIN) {
      const cap = DRIFT_MAX_SPIN / tumbled;
      tumbleX *= cap;
      tumbleY *= cap;
      tumbleZ *= cap;
    }

    leaf.wx = rollX + tumbleX;
    leaf.wy = rollY + tumbleY;
    leaf.wz = rollZ + tumbleZ;

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
    clampSwing(leaf, grabbed ? GRABBED_SWING_CAP : SWING_CAP);
  }

  projectDepthClearance(field, dt);

  // The perspective counter-scale reads the FINAL depth of the frame, after
  // the projection has had its say, so rendered size never lags a shove.
  for (const leaf of field.leaves) {
    leaf.scale =
      (1 - (1 - DRIFT_PAGE_SCALE) * leaf.release) *
      Math.min(1, (input.cameraDistance - leaf.z) / input.cameraDistance);
  }
}

/** Whether two leaves overlap enough in the viewing plane to matter. */
/** Do the two pages cover any common ground on screen? Answered from the
    footprints the carriers actually project — a rotated page reaches out to
    its half-DIAGONAL, so two centres far enough apart to look clear can still
    have their corners over one another — widened by how far a solved sheet is
    allowed to stray outside its carrier. Conservative on purpose: a pair
    wrongly called clear gets no clearance enforced at all, which is the one
    error that shows up as pages passing through each other. */
function pairOverlaps(
  field: DriftField,
  a: DriftLeafState,
  b: DriftLeafState,
) {
  const halfW = field.pw / 2;
  const halfH = field.ph / 2;
  const margin = DRIFT_SHEET_MAX_DEVIATION;
  const ax =
    halfW * a.scale * Math.abs(a.axisUX) +
    halfH * a.scale * Math.abs(a.axisVX);
  const ay =
    halfW * a.scale * Math.abs(a.axisUY) +
    halfH * a.scale * Math.abs(a.axisVY);
  const bx =
    halfW * b.scale * Math.abs(b.axisUX) +
    halfH * b.scale * Math.abs(b.axisVX);
  const by =
    halfW * b.scale * Math.abs(b.axisUY) +
    halfH * b.scale * Math.abs(b.axisVY);
  return (
    Math.abs(b.x - a.x) < ax + bx + margin &&
    Math.abs(b.y - a.y) < ay + by + margin
  );
}

/**
 * Depth a pair's two carrier PLANES need between them. Exact and continuous:
 * |dz| covering the sum of both sheets' true z-extents makes the depth axis
 * a separating axis — airtight by SAT sufficiency, whatever the orientation.
 */
/** Depth a pair of tilted planes must hold between them.

    The blunt answer is each page's full depth reach added together, and that
    is what this used to charge. It is wildly pessimistic. Two planes can only
    meet where their footprints overlap, and two planes that lean the SAME way
    never converge at all — they are parallel, and could sit a hair apart at
    any tilt without touching. Charging both of them their full reach priced
    the commonest arrangement in the pile as if it were the worst one, and the
    budget that bought went straight out of the pages' freedom to turn.

    So price what actually closes. Each plane's height over the viewing plane
    is linear in screen position, with gradient g; the pair converges at the
    rate their gradients DIFFER, over the region where they overlap. Both are
    cheap to bound: g falls out of inverting the page's own projection, and
    the overlap is contained in a box around the lens where the two pages'
    circumscribed discs meet. Never charges more than the old full-reach
    answer, so it cannot loosen a gap that was already holding. */
export function pairTilt(
  field: DriftField,
  a: DriftLeafState,
  b: DriftLeafState,
) {
  if (!pairOverlaps(field, a, b)) return 0;
  const gate = a.release * b.release;
  if (gate <= 0) return 0;

  const extA =
    (field.pw / 2) * a.scale * Math.abs(a.axisUZ) +
    (field.ph / 2) * a.scale * Math.abs(a.axisVZ);
  const extB =
    (field.pw / 2) * b.scale * Math.abs(b.axisUZ) +
    (field.ph / 2) * b.scale * Math.abs(b.axisVZ);
  const blunt = extA + extB;

  // Gradient of each page's depth with respect to screen position. The page
  // maps (u, v) along its own axes onto the viewing plane; invert that and
  // the depth per screen unit falls out. A page seen edge-on projects to a
  // sliver, the inverse blows up, and the blunt answer is the right one.
  const detA = a.axisUX * a.axisVY - a.axisVX * a.axisUY;
  const detB = b.axisUX * b.axisVY - b.axisVX * b.axisUY;
  if (Math.abs(detA) < 1e-3 || Math.abs(detB) < 1e-3) return gate * blunt;
  const gax = (a.axisVY * a.axisUZ - a.axisUY * a.axisVZ) / detA;
  const gay = (a.axisUX * a.axisVZ - a.axisVX * a.axisUZ) / detA;
  const gbx = (b.axisVY * b.axisUZ - b.axisUY * b.axisVZ) / detB;
  const gby = (b.axisUX * b.axisVZ - b.axisVX * b.axisUZ) / detB;
  const dgx = gbx - gax;
  const dgy = gby - gay;

  // Bound the overlap. Each page sits inside a disc of its half-diagonal;
  // where two discs meet is a lens, and the lens sits inside a small box
  // aligned with the line between the centres.
  const halfDiag = Math.hypot(field.pw / 2, field.ph / 2);
  const ra = halfDiag * a.scale;
  const rb = halfDiag * b.scale;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const centres = Math.hypot(dx, dy);

  let cx: number;
  let cy: number;
  let reach: number;
  if (centres <= Math.abs(ra - rb) + 1e-3) {
    // One disc sits inside the other, so the overlap IS the smaller page.
    // Worth its own branch: the chord below is only defined for discs that
    // properly cross, and on a nested pair it collapses to nothing — which
    // would hand back a gap of zero for two pages sitting right on top of
    // one another, the very case that needs the most room.
    const inner = Math.min(ra, rb);
    const smaller = ra <= rb ? a : b;
    cx = smaller.x;
    cy = smaller.y;
    reach = inner * Math.hypot(dgx, dgy);
  } else {
    const ux = dx / centres;
    const uy = dy / centres;
    const along = Math.max(0, (ra + rb - centres) / 2);
    const foot = clamp(
      (centres * centres + ra * ra - rb * rb) / (2 * centres),
      -ra,
      ra,
    );
    // How far the shared area reaches to either side of the line of centres.
    // The chord where the two outlines cross is the answer only while each
    // page's own widest point lies outside the other; once one of them falls
    // inside, the shared area bulges out to that page's full width and the
    // chord badly understates it — which for two pages nearly on top of one
    // another is a gap missed, not a gap trimmed.
    let across = Math.sqrt(Math.max(0, ra * ra - foot * foot));
    if (Math.hypot(centres, rb) <= ra) across = Math.max(across, rb);
    if (Math.hypot(centres, ra) <= rb) across = Math.max(across, ra);
    const offset = Math.min(ra, Math.max(-ra, centres - rb + along));
    cx = a.x + ux * offset;
    cy = a.y + uy * offset;
    // Support of the box in the direction the planes converge.
    reach =
      along * Math.abs(dgx * ux + dgy * uy) +
      across * Math.abs(-dgx * uy + dgy * ux);
  }

  // Depth already between the two surfaces at the middle of that overlap.
  // A pair leaning apart there has bought some of its own clearance.
  const bias =
    (gbx * (cx - b.x) + gby * (cy - b.y)) -
    (gax * (cx - a.x) + gay * (cy - a.y));

  const measured = reach - bias;
  return gate * clamp(measured, 0, blunt);
}

/**
 * Real collision between the DRAWN sheets, rather than a worst-case
 * allowance for how far they might bend. Walk the lower sheet's cells, find
 * where each sits on the upper sheet, and ask how far the two surfaces
 * actually close on each other there. Pages rippling the same way locally
 * need almost nothing; the gap grows only where they would genuinely meet —
 * which is what lets a page bend freely without paying for it in clearance
 * everywhere else.
 */
export function pairFlex(
  field: DriftField,
  lower: DriftLeafState,
  upper: DriftLeafState,
) {
  if (!pairOverlaps(field, lower, upper)) return 0;
  const gate = lower.release * upper.release;
  if (gate <= 0) return 0;

  const N = DRIFT_DEV_GRID;
  const halfWL = (field.pw / 2) * lower.scale;
  const halfHL = (field.ph / 2) * lower.scale;
  const halfWU = (field.pw / 2) * upper.scale;
  const halfHU = (field.ph / 2) * upper.scale;
  // Half-diagonal of a lower cell, expressed in the upper's normalized uv.
  // The diagonal is used because the cell arrives rotated by the pair's
  // relative orientation, and over-reaching is the safe direction here.
  const cellHalf = Math.hypot(halfWL / N, halfHL / N);
  const cellHalfU = cellHalf / halfWU;
  const cellHalfV = cellHalf / halfHU;
  let closure = 0;

  for (let j = 0; j < N; j += 1) {
    const tv = ((j + 0.5) / N) * 2 - 1;
    for (let i = 0; i < N; i += 1) {
      const tu = ((i + 0.5) / N) * 2 - 1;
      const du = tu * halfWL;
      const dv = tv * halfHL;
      // Where this cell of the lower sheet sits in the viewing plane...
      const wx = lower.x + lower.axisUX * du + lower.axisVX * dv;
      const wy = lower.y + lower.axisUY * du + lower.axisVY * dv;
      // ...and where that lands on the upper sheet.
      const rx = wx - upper.x;
      const ry = wy - upper.y;
      const su = (rx * upper.axisUX + ry * upper.axisUY) / halfWU;
      const sv = (rx * upper.axisVX + ry * upper.axisVY) / halfHU;
      // The sample stands for a whole CELL, not a point: its devMax is the
      // crest of a quarter-page. Testing only the centre for containment
      // would blind the scan to the outer half-cell of every page — the
      // band where two sheets most often overlap edge-on — and report no
      // closure at all there. Test the cell's reach, then clamp the lookup
      // back into the neighbour.
      if (su + cellHalfU < -1 || su - cellHalfU > 1) continue;
      if (sv + cellHalfV < -1 || sv - cellHalfV > 1) continue;
      const clampedU = clamp(su, -1, 1);
      const clampedV = clamp(sv, -1, 1);

      // Conservative: take the deepest dip of every cell the sample could
      // fall in, so sampling can never under-report an approach.
      const ci = clamp(Math.floor(((clampedU + 1) / 2) * N), 0, N - 1);
      const cj = clamp(Math.floor(((clampedV + 1) / 2) * N), 0, N - 1);
      let dipUpper = Infinity;
      for (let nj = Math.max(0, cj - 1); nj <= Math.min(N - 1, cj + 1); nj += 1) {
        for (let ni = Math.max(0, ci - 1); ni <= Math.min(N - 1, ci + 1); ni += 1) {
          const value = upper.devMin[nj * N + ni]!;
          if (value < dipUpper) dipUpper = value;
        }
      }
      if (dipUpper === Infinity) continue;
      const here = lower.devMax[j * N + i]! - dipUpper;
      if (here > closure) closure = here;
    }
  }

  return gate * (closure + PAIR_FLEX_SLACK);
}

/** Total depth a pair needs: their planes, plus their sheets' real shapes. */
/** Floor on how much a crowded page may still bend. */
const DRIFT_FLEX_FLOOR = 0.3;

/** How freely this page may bend right now, 0..1. A page with open air around
    it flexes fully; one pressed into the pile stiffens. The pile's depth
    simply cannot hold every page bulging at full amplitude at once, and the
    two ways out of that are a page that flexes less or a page that passes
    through its neighbour — the second reads far worse than the first. */
export function driftLeafFlex(leaf: DriftLeafState) {
  return (
    DRIFT_FLEX_FLOOR + (1 - DRIFT_FLEX_FLOOR) * (leaf.crowdCap / SWING_CAP)
  );
}

export function driftPairClearance(
  field: DriftField,
  lower: DriftLeafState,
  upper: DriftLeafState,
) {
  return pairTilt(field, lower, upper) + pairFlex(field, lower, upper);
}

/** Hard tilt ceiling: rotate the leaf back toward its nearest camera-facing
    pole just enough to stay inside the cap. Applied about the world axis
    n × pole, which never disturbs in-plane roll. */
function clampSwing(leaf: DriftLeafState, cap: number) {
  const { qx, qy, qz, qw } = leaf;
  const nx = 2 * (qx * qz + qy * qw);
  const ny = 2 * (qy * qz - qx * qw);
  const nz = 1 - 2 * (qx * qx + qy * qy);
  const pole = nz >= 0 ? 1 : -1;
  const cosTilt = clamp(nz * pole, -1, 1);
  if (cosTilt >= Math.cos(cap)) return;
  const axisX = ny * pole;
  const axisY = -nx * pole;
  const axisLength = Math.hypot(axisX, axisY);
  if (axisLength < 1e-6) return;
  const half = (Math.acos(cosTilt) - cap) / 2;
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
  const zFloor = field.ph * HARD_Z_FLOOR_RATIO;
  const zCeil = field.ph * CONTAIN_Z_MAX_RATIO + HARD_Z_HEADROOM;
  const refreshAxes = (leaf: DriftLeafState) => {
    const { qx, qy, qz, qw } = leaf;
    leaf.axisUX = 1 - 2 * (qy * qy + qz * qz);
    leaf.axisUY = 2 * (qx * qy + qz * qw);
    leaf.axisUZ = 2 * (qx * qz - qy * qw);
    leaf.axisVX = 2 * (qx * qy - qz * qw);
    leaf.axisVY = 1 - 2 * (qx * qx + qz * qz);
    leaf.axisVZ = 2 * (qy * qz + qx * qw);
    leaf.axisNX = 2 * (qx * qz + qy * qw);
    leaf.axisNY = 2 * (qy * qz - qx * qw);
    leaf.axisNZ = 1 - 2 * (qx * qx + qy * qy);
    leaf.swing = Math.sqrt(
      Math.max(0, 1 - leaf.axisNZ * leaf.axisNZ),
    );
  };
  for (const leaf of field.leaves) refreshAxes(leaf);
  // One stacking order per frame (insertion sort, stable by index). Every
  // correction pushes along this order — a pair can never be shoved both
  // ways in one frame, which is what used to let near-coplanar sheets
  // oscillate straight through each other.
  const { order, rank } = field;
  for (let i = 1; i < order.length; i += 1) {
    const moving = order[i]!;
    const movingZ = field.leaves[moving]!.z;
    let slot = i - 1;
    while (
      slot >= 0 &&
      (field.leaves[order[slot]!]!.z > movingZ ||
        (field.leaves[order[slot]!]!.z === movingZ && order[slot]! > moving))
    ) {
      order[slot + 1] = order[slot]!;
      slot -= 1;
    }
    order[slot + 1] = moving;
  }
  for (let position = 0; position < order.length; position += 1) {
    rank[order[position]!] = position;
  }

  // The requirement splits in two, because only one half may be negotiated.
  // The TILT half is the sheets' true z-extents: real geometry, but it
  // shrinks honestly when crowd pressure presses pages flat. The FLEX half
  // covers how far each drawn sheet bows off its carrier plane, and that
  // does not shrink just because the pile is crowded — scaling it away is
  // exactly how pages whose carriers were properly spaced still crossed on
  // screen. So the flex margin is a floor the scaler may never touch.
  const tiltFor = (a: DriftLeafState, b: DriftLeafState) =>
    pairTilt(field, a, b);
  const flexFor = (lower: DriftLeafState, upper: DriftLeafState) =>
    pairFlex(field, lower, upper);

  // Press the pile as flat as it currently needs to be. The cap is carried
  // between frames and driven by the violations the previous frame actually
  // left behind, so it tightens under a gust and eases off as the pages
  // spread out again — no feasibility estimate to be wrong about.
  for (const leaf of field.leaves) {
    if (leaf.index === field.grabIndex) continue;
    clampSwing(leaf, leaf.crowdCap);
    refreshAxes(leaf);
  }
  const tiltScale = 1;

  const requiredFor = (a: DriftLeafState, b: DriftLeafState) =>
    tiltFor(a, b) * tiltScale + flexFor(a, b);

  // One budgeted forward/backward stack pass instead of pairwise sweeps:
  // extent-based requirements obey the triangle inequality, so satisfying
  // every leaf against its predecessors (and the ceiling from above) covers
  // all pairs without the conflicting pushes that stall Gauss-Seidel.
  const budget = PAIR_HARD_PANIC_STEP * dt;
  const floorFor = (position: number) => {
    const leaf = field.leaves[order[position]!]!;
    let floorZ = zFloor;
    let binding: DriftLeafState | null = null;
    for (let below = 0; below < position; below += 1) {
      const other = field.leaves[order[below]!]!;
      if (other.release <= 0) continue;
      const required = requiredFor(other, leaf);
      if (required <= 0) continue;
      const need = other.z + required;
      if (need > floorZ) {
        floorZ = need;
        binding = other;
      }
    }
    return { floorZ, binding };
  };
  const ceilFor = (position: number) => {
    const leaf = field.leaves[order[position]!]!;
    let ceilZ = zCeil;
    for (let above = position + 1; above < order.length; above += 1) {
      const other = field.leaves[order[above]!]!;
      if (other.release <= 0) continue;
      const required = requiredFor(leaf, other);
      if (required <= 0) continue;
      ceilZ = Math.min(ceilZ, other.z - required);
    }
    return ceilZ;
  };

  // The stack passes are a relaxation, so a single sweep leaves fast motion
  // half-resolved; repeating them costs a few dozen comparisons and lets the
  // pile actually settle within the frame.
  for (let relax = 0; relax < STACK_RELAXATIONS; relax += 1) {
    // Two budgeted, two-sided stack passes instead of pairwise sweeps:
    // extent-based requirements obey the triangle inequality, so satisfying
    // every leaf against its neighbours in rank order covers all pairs, and
    // each move stays inside the leaf's own feasible interval so the passes
    // can never fling a leaf through the constraint it was escaping.
    for (let position = 1; position < order.length; position += 1) {
      const leaf = field.leaves[order[position]!]!;
      if (leaf.release <= 0) continue;
      const { floorZ, binding } = floorFor(position);
      if (binding === null || leaf.z >= floorZ) continue;
      const ceilZ = Math.max(ceilFor(position), leaf.z);
      const target = Math.min(floorZ, ceilZ);
      const deficit = floorZ - leaf.z;
      leaf.z = Math.min(leaf.z + Math.min(deficit, budget), target);
      // Contact: closing depth speed dies with the squeeze. Only on the
      // first sweep — the relaxation repeats the POSITION solve, and a
      // pinched leaf that cannot move would otherwise be damped again and
      // again for the same single contact.
      if (relax === 0) {
        if (leaf.vz < 0) leaf.vz *= 0.2;
        if (binding.vz > 0) binding.vz *= 0.2;
      }
      // Squeezed pages escape sideways too, draining the very overlap that
      // created the demand. Velocity, not position: containment and the
      // speed cap stay in charge of the outcome.
      const lateralX = leaf.x - binding.x;
      const lateralY = leaf.y - binding.y;
      const lateralLength = Math.hypot(lateralX, lateralY);
      if (relax === 0 && lateralLength > 1e-3) {
        const slide = Math.min(deficit * PAIR_LATERAL_RELIEF, 1400) * dt * 0.5;
        leaf.vx += (lateralX / lateralLength) * slide;
        leaf.vy += (lateralY / lateralLength) * slide;
        binding.vx -= (lateralX / lateralLength) * slide;
        binding.vy -= (lateralY / lateralLength) * slide;
      }
    }
    for (let position = order.length - 1; position >= 0; position -= 1) {
      const leaf = field.leaves[order[position]!]!;
      if (leaf.release <= 0) continue;
      const ceilZ = ceilFor(position);
      if (leaf.z > ceilZ) {
        const { floorZ } = floorFor(position);
        const target = Math.max(ceilZ, Math.min(floorZ, leaf.z));
        leaf.z = Math.max(leaf.z - budget, target);
        if (leaf.vz > 0) leaf.vz *= 0.2;
      }
      if (leaf.z < zFloor) {
        leaf.z = zFloor;
        if (leaf.vz < 0) leaf.vz = 0;
      }
    }
  }

  // What did the passes actually fail to satisfy? That residual — over every
  // overlapping pair, not just the consecutive depth chain — is the signal
  // each page's crowd cap is steered by. Charging it to the two pages in the
  // pair keeps the flattening local: a jam in one corner of the pile does not
  // press the pages drifting freely on the other side.
  for (const leaf of field.leaves) leaf.crowdResidual = 0;
  for (let i = 0; i < field.leaves.length; i += 1) {
    const a = field.leaves[i]!;
    if (a.release <= 0) continue;
    for (let j = i + 1; j < field.leaves.length; j += 1) {
      const b = field.leaves[j]!;
      if (b.release <= 0) continue;
      const lower = a.z <= b.z ? a : b;
      const upper = a.z <= b.z ? b : a;
      const need = requiredFor(lower, upper);
      if (need <= 0) continue;
      const shortfall = need - (upper.z - lower.z);
      if (shortfall > a.crowdResidual) a.crowdResidual = shortfall;
      if (shortfall > b.crowdResidual) b.crowdResidual = shortfall;
    }
  }
  for (const leaf of field.leaves) {
    leaf.crowdCap =
      leaf.crowdResidual > CROWD_TOLERANCE
        ? Math.max(CROWD_MIN_CAP, leaf.crowdCap * CROWD_TIGHTEN)
        : Math.min(SWING_CAP, leaf.crowdCap * CROWD_RELEASE);
    // Spend the tightened cap now rather than next frame. Waiting a frame
    // would leave the overlap that provoked it on screen for that frame,
    // which is exactly the crossing this is meant to prevent.
    if (leaf.index !== field.grabIndex && leaf.crowdResidual > CROWD_TOLERANCE) {
      clampSwing(leaf, leaf.crowdCap);
      refreshAxes(leaf);
    }
  }

  // The passes above bound each leaf by its own feasible interval, so a
  // locally impossible chain can leave the floor unmet. This last pass
  // enforces the FLEX floor alone — the clearance the drawn sheets need —
  // which is small enough to always fit the depth range, and so converges.
  for (let sweep = 0; sweep < FLEX_FLOOR_SWEEPS; sweep += 1) {
    let settled = true;
    for (let i = 0; i < field.leaves.length; i += 1) {
      const a = field.leaves[i]!;
      if (a.release <= 0) continue;
      for (let j = i + 1; j < field.leaves.length; j += 1) {
        const b = field.leaves[j]!;
        if (b.release <= 0) continue;
        const direction = rank[b.index]! > rank[a.index]! ? 1 : -1;
        // flexFor reads the LOWER sheet's crests against the UPPER sheet's
        // dips, so the pair has to be handed over in depth order.
        const need = direction === 1 ? flexFor(a, b) : flexFor(b, a);
        if (need <= 0) continue;
        const gap = (b.z - a.z) * direction;
        if (gap >= need) continue;
        settled = false;
        const push = (need - gap) * 0.5;
        a.z = clamp(a.z - direction * push, zFloor, zCeil);
        b.z = clamp(b.z + direction * push, zFloor, zCeil);
        if ((b.vz - a.vz) * direction < 0) {
          const shared = (a.vz + b.vz) * 0.5;
          a.vz = shared;
          b.vz = shared;
        }
      }
    }
    if (settled) break;
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
 * Records how far a solved sheet rises above and dips below its carrier
 * plane, per cell of the page. The clearance between leaves is computed from
 * these numbers, so what the eye sees is what collides: two pages rippling
 * the same way locally need almost no gap, while the gap opens exactly where
 * their surfaces would meet. Grid order matches the guide: rows top to
 * bottom, column 0 the spine.
 */
export function recordDriftDeviation(
  leaf: DriftLeafState,
  vertices: readonly DriftVec[],
  guide: readonly DriftVec[],
  segments: number,
  rows: number,
) {
  const { devMax, devMin } = leaf;
  devMax.fill(-Infinity);
  devMin.fill(Infinity);
  const columns = segments + 1;
  for (let index = 0; index < vertices.length; index += 1) {
    const column = index % columns;
    const row = (index - column) / columns;
    const u = -1 + (2 * column) / segments;
    const v = 1 - (2 * row) / rows;
    const cellI = clamp(
      Math.floor(((u + 1) / 2) * DRIFT_DEV_GRID),
      0,
      DRIFT_DEV_GRID - 1,
    );
    const cellJ = clamp(
      Math.floor(((v + 1) / 2) * DRIFT_DEV_GRID),
      0,
      DRIFT_DEV_GRID - 1,
    );
    const cell = cellJ * DRIFT_DEV_GRID + cellI;
    const deviation = vertices[index]!.z - guide[index]!.z;
    if (deviation > devMax[cell]!) devMax[cell] = deviation;
    if (deviation < devMin[cell]!) devMin[cell] = deviation;
  }
  for (let cell = 0; cell < devMax.length; cell += 1) {
    if (devMax[cell] === -Infinity) devMax[cell] = 0;
    if (devMin[cell] === Infinity) devMin[cell] = 0;
  }
}

/**
 * Writes the carrier-transformed rest grid into a preallocated guide array —
 * the target surface the sheet solver then flexes against. One rotation
 * matrix per leaf per frame beats half a thousand quaternion sandwiches.
 * The matrix folds in leaf.scale, the perspective counter-scale that keeps
 * a floating page's apparent size constant at any depth. Grid order matches
 * PlaneGeometry: rows top to bottom, column 0 the spine.
 */
export function writeDriftLeafGuide(
  leaf: DriftLeafState,
  columnsX: ArrayLike<number>,
  rowsY: ArrayLike<number>,
  guide: DriftVec[],
) {
  const { qx, qy, qz, qw, scale } = leaf;
  const m00 = (1 - 2 * (qy * qy + qz * qz)) * scale;
  const m01 = 2 * (qx * qy - qz * qw) * scale;
  const m10 = 2 * (qx * qy + qz * qw) * scale;
  const m11 = (1 - 2 * (qx * qx + qz * qz)) * scale;
  const m20 = 2 * (qx * qz - qy * qw) * scale;
  const m21 = 2 * (qy * qz + qx * qw) * scale;
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
