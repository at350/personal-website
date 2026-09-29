import type { LeafVertex } from "./bend";

export interface PaperStepOptions {
  dt: number;
  dragging: boolean;
  grabY: number;
  handleOffsetY: number;
  velocity: number;
}

export interface DriftSheetOptions {
  dt: number;
  /** Uniform ambient acceleration on every vertex, px/s². */
  windX: number;
  windY: number;
  windZ: number;
  /** Radial current origin in the same space as the guide vertices. */
  puffX: number;
  puffY: number;
  puffZ: number;
  /** Acceleration at the current's center; 0 disables the radial term. */
  puffStrength: number;
  puffRadius: number;
  /** Exponential rate pulling unpinned vertices toward the carrier guide. */
  followRate: number;
  /** Per-frame Verlet damping base, like SETTLE_DAMPING. */
  damping: number;
  /** Scales the bend-flattening constraints (0..1). The page-turn regime
      runs them at full strength to kill the accordion mode; a floating leaf
      wants to actually hold a bow, so drift runs them relaxed. */
  curvatureScale?: number;
  /** Scales the structural rest lengths to match a uniformly scaled guide
      (drift's perspective counter-scale). The page-turn regime is always 1. */
  restScale?: number;
  /** Out-of-plane flutter: the sheet's own normal times an amplitude, rippled
      across the sheet by a travelling wave. A free sheet cannot bend under a
      uniform wind — that only shifts it — so this spatial variation is what
      actually curves floating paper. */
  flutterX?: number;
  flutterY?: number;
  flutterZ?: number;
  /** Advances the travelling wave; seed it per leaf so no two ripple alike. */
  flutterPhase?: number;
  /** Hard ceiling on how far any vertex may sit from its carrier guide. The
      depth clearance between leaves is computed from the rigid carriers, so
      the drawn sheet has to stay inside a known shell around one or pages
      whose carriers are properly separated can still intersect on screen. */
  maxDeviation?: number;
}

const SOLVER_ITERATIONS = 6;
const STRUCTURAL_STIFFNESS = 0.9998;
const SHEAR_STIFFNESS = 0.9;
const CURVATURE_STIFFNESS = 0.9;
/** How much of the vertical pull the row farthest from the grab still gets.
    Kept high on purpose: a pull field that is nearly uniform down each column
    shears the sheet instead of compressing vertical links. Steep per-row
    falloff is what buckled the mesh into the accordion. */
const PULL_ROW_FLOOR = 0.7;
const PULL_ROW_FALLOFF = 1.4;

/** Fore-edge emphasis of the vertical pull, by column. */
const pullColumnWeight = (u: number) => Math.pow(u, 2.8);
const pullRowWeight = (distanceFromGrab: number) =>
  PULL_ROW_FLOOR +
  (1 - PULL_ROW_FLOOR) *
    Math.exp(-(distanceFromGrab * distanceFromGrab) / PULL_ROW_FALLOFF);
const DRAG_DAMPING = 0.965;
const SETTLE_DAMPING = 0.9;
const BASE_FOLLOW_RATE = 7;
const SETTLE_FOLLOW_RATE = 16;
const HANDLE_FOLLOW_RATE = 32;

const perIterationStiffness = (stiffness: number) =>
  1 - Math.pow(1 - stiffness, 1 / SOLVER_ITERATIONS);

/**
 * `Math.hypot(x, y, z)`, computed exactly the way V8's builtin computes it —
 * normalized by the largest magnitude, Kahan-compensated — so every length in
 * the solver keeps its bit pattern. The builtin allocates a scratch array per
 * call, and the solver takes tens of thousands of lengths a frame.
 */
export function hypot3(x: number, y: number, z: number): number {
  let ax = Math.abs(x);
  let ay = Math.abs(y);
  let az = Math.abs(z);
  let nan = false;
  if (ax !== ax) {
    nan = true;
    ax = 0;
  }
  if (ay !== ay) {
    nan = true;
    ay = 0;
  }
  if (az !== az) {
    nan = true;
    az = 0;
  }
  let max = 0;
  if (ax > max) max = ax;
  if (ay > max) max = ay;
  if (az > max) max = az;
  if (max === Infinity) return Infinity;
  if (nan) return NaN;
  if (max === 0) return 0;
  let sum = 0;
  let compensation = 0;
  let n = ax / max;
  let summand = n * n - compensation;
  let preliminary = sum + summand;
  compensation = preliminary - sum - summand;
  sum = preliminary;
  n = ay / max;
  summand = n * n - compensation;
  preliminary = sum + summand;
  compensation = preliminary - sum - summand;
  sum = preliminary;
  n = az / max;
  summand = n * n - compensation;
  preliminary = sum + summand;
  compensation = preliminary - sum - summand;
  sum = preliminary;
  return Math.sqrt(sum) * max;
}

/** Whether this engine's `Math.hypot` rounds exactly like `hypot3`. V8's does
    (hypot3 is its algorithm); JavaScriptCore and SpiderMonkey round their own
    way, and on them the probe fails within a few samples. */
function engineAgreesWithHypot3(): boolean {
  const edges = [0, -0, 1, -1, 0.1, 3, 1e-300, 1e300, 5e-324, Infinity, NaN];
  for (const x of edges) {
    for (const y of edges) {
      if (!Object.is(Math.hypot(x, y, 0.5), hypot3(x, y, 0.5))) return false;
    }
  }
  let seed = 0x2545f491;
  const next = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 256; i += 1) {
    const scale = Math.pow(10, Math.floor(next() * 12) - 6);
    const x = (next() - 0.5) * scale;
    const y = (next() - 0.5) * scale;
    const z = (next() - 0.5) * scale * (next() < 0.2 ? 1e-9 : 1);
    if (!Object.is(Math.hypot(x, y, z), hypot3(x, y, z))) return false;
  }
  return true;
}

/** The solver's 3D length: the allocation-free copy where it is the engine's
    own arithmetic, the engine's `Math.hypot` everywhere else, so on every
    engine the solver computes exactly what it always has. */
const length3: (x: number, y: number, z: number) => number =
  engineAgreesWithHypot3() ? hypot3 : (x, y, z) => Math.hypot(x, y, z);

/**
 * A small position-based sheet solver. The procedural curl remains the broad
 * turn guide, while Verlet inertia plus structural, shear, and bend
 * constraints supply the local lag and recovery that make thin stock read as
 * a sheet instead of a hinged surface.
 *
 * The solver runs every frame for the turning leaf and for every floating
 * leaf in Drift, so its state lives in flat typed arrays (positions `p*`, the
 * previous frame `q*`, the frame's guide `t*`) and its constraints in index
 * tables, visited in a fixed order. Callers receive stable vertex objects
 * refreshed at the end of each step.
 */
export class PaperSheet {
  private readonly segments: number;
  private readonly rows: number;
  private readonly width: number;
  private readonly columns: number;
  private readonly count: number;
  private readonly px: Float64Array;
  private readonly py: Float64Array;
  private readonly pz: Float64Array;
  private readonly qx: Float64Array;
  private readonly qy: Float64Array;
  private readonly qz: Float64Array;
  /** This frame's guide surface, copied once per step. */
  private readonly tx: Float64Array;
  private readonly ty: Float64Array;
  private readonly tz: Float64Array;
  /** The vertex objects handed to callers. */
  private readonly vertices: LeafVertex[];
  /** Column 0: the spine edge the page-turn regime pins to its guide. */
  private readonly spineColumn: Uint8Array;
  /** Shear (shape) and structural distance constraints, in solve order. */
  private readonly shapeA: Int32Array;
  private readonly shapeB: Int32Array;
  private readonly shapeRest: Float64Array;
  private readonly shapeStiffness: number;
  private readonly structuralA: Int32Array;
  private readonly structuralB: Int32Array;
  private readonly structuralRest: Float64Array;
  private readonly structuralStiffness: number;
  /** Bend triples a–b–c along rows and columns, in solve order, with the
      guide's second difference cached per step (the guide holds still while
      the constraints iterate). */
  private readonly curvatureA: Int32Array;
  private readonly curvatureB: Int32Array;
  private readonly curvatureC: Int32Array;
  private readonly curvatureStiffness: number;
  private readonly desiredX: Float64Array;
  private readonly desiredY: Float64Array;
  private readonly desiredZ: Float64Array;
  private initialized = false;
  private energy = 0;
  /** Drift's uniform guide scale; every other regime runs at 1. */
  private restScale = 1;
  /** The page-turn regime binds column 0 to the spine. Drift's leaves are
      loose in the air, where a fixed edge would read as a hinge: all the
      deformation would appear on the far side, which is exactly what a
      floating sheet must not do. */
  private spinePinned = true;

  constructor(
    width: number,
    height: number,
    segments: number,
    rows: number,
  ) {
    this.segments = segments;
    this.rows = rows;
    this.width = width;
    this.columns = segments + 1;
    const count = (segments + 1) * (rows + 1);
    this.count = count;
    this.px = new Float64Array(count);
    this.py = new Float64Array(count);
    this.pz = new Float64Array(count);
    this.qx = new Float64Array(count);
    this.qy = new Float64Array(count);
    this.qz = new Float64Array(count);
    this.tx = new Float64Array(count);
    this.ty = new Float64Array(count);
    this.tz = new Float64Array(count);
    this.vertices = Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0 }));
    this.spineColumn = new Uint8Array(count);
    for (let index = 0; index < count; index += 1) {
      if (index % this.columns === 0) this.spineColumn[index] = 1;
    }

    const dx = width / segments;
    const dy = height / rows;
    this.structuralStiffness = perIterationStiffness(STRUCTURAL_STIFFNESS);
    this.shapeStiffness = perIterationStiffness(SHEAR_STIFFNESS);
    this.curvatureStiffness = perIterationStiffness(CURVATURE_STIFFNESS);

    const structural: number[] = [];
    const shape: number[] = [];
    const curvature: number[] = [];
    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= segments; column += 1) {
        const here = this.index(row, column);
        if (column < segments) structural.push(here, this.index(row, column + 1), dx);
        if (row < rows) structural.push(here, this.index(row + 1, column), dy);
        if (column < segments && row < rows) {
          const diagonal = Math.hypot(dx, dy);
          shape.push(here, this.index(row + 1, column + 1), diagonal);
          shape.push(this.index(row + 1, column), this.index(row, column + 1), diagonal);
        }
        if (column < segments - 1) {
          curvature.push(here, this.index(row, column + 1), this.index(row, column + 2));
        }
        if (row < rows - 1) {
          curvature.push(here, this.index(row + 1, column), this.index(row + 2, column));
        }
      }
    }

    const structuralCount = structural.length / 3;
    this.structuralA = new Int32Array(structuralCount);
    this.structuralB = new Int32Array(structuralCount);
    this.structuralRest = new Float64Array(structuralCount);
    for (let i = 0; i < structuralCount; i += 1) {
      this.structuralA[i] = structural[i * 3]!;
      this.structuralB[i] = structural[i * 3 + 1]!;
      this.structuralRest[i] = structural[i * 3 + 2]!;
    }
    const shapeCount = shape.length / 3;
    this.shapeA = new Int32Array(shapeCount);
    this.shapeB = new Int32Array(shapeCount);
    this.shapeRest = new Float64Array(shapeCount);
    for (let i = 0; i < shapeCount; i += 1) {
      this.shapeA[i] = shape[i * 3]!;
      this.shapeB[i] = shape[i * 3 + 1]!;
      this.shapeRest[i] = shape[i * 3 + 2]!;
    }
    const curvatureCount = curvature.length / 3;
    this.curvatureA = new Int32Array(curvatureCount);
    this.curvatureB = new Int32Array(curvatureCount);
    this.curvatureC = new Int32Array(curvatureCount);
    for (let i = 0; i < curvatureCount; i += 1) {
      this.curvatureA[i] = curvature[i * 3]!;
      this.curvatureB[i] = curvature[i * 3 + 1]!;
      this.curvatureC[i] = curvature[i * 3 + 2]!;
    }
    this.desiredX = new Float64Array(curvatureCount);
    this.desiredY = new Float64Array(curvatureCount);
    this.desiredZ = new Float64Array(curvatureCount);
  }

  reset(vertices: readonly LeafVertex[]) {
    for (let index = 0; index < this.count; index += 1) {
      const source = vertices[index]!;
      this.px[index] = source.x;
      this.py[index] = source.y;
      this.pz[index] = source.z;
      this.qx[index] = source.x;
      this.qy[index] = source.y;
      this.qz[index] = source.z;
    }
    this.publish();
    this.energy = 0;
    this.initialized = true;
  }

  /** Mean vertex speed, normalized by page width and lightly smoothed:
      ~0 at true rest, well above SHEET_REST_ENERGY under a live hand. */
  motionEnergy(): number {
    return this.energy;
  }

  step(target: readonly LeafVertex[], options: PaperStepOptions): LeafVertex[] {
    if (!this.initialized) this.reset(target);
    this.restScale = 1;
    this.spinePinned = true;
    this.loadTarget(target);
    const dt = Math.min(1 / 30, Math.max(1 / 240, options.dt));
    const frameScale = dt * 60;
    const damping = Math.pow(
      options.dragging ? DRAG_DAMPING : SETTLE_DAMPING,
      frameScale,
    );
    const { px, py, pz, qx, qy, qz, tx, ty, tz } = this;

    for (let row = 0; row <= this.rows; row += 1) {
      const v = 1 - (row / this.rows) * 2;
      const rowDistance = v - options.grabY;
      const rowShear = pullRowWeight(rowDistance);
      for (let column = 0; column <= this.segments; column += 1) {
        const index = this.index(row, column);
        const u = column / this.segments;
        const columnShear = pullColumnWeight(u);
        const targetY = ty[index]! + options.handleOffsetY * columnShear * rowShear;
        const followRate = options.dragging
          ? BASE_FOLLOW_RATE + HANDLE_FOLLOW_RATE * columnShear
          : SETTLE_FOLLOW_RATE;
        const follow = 1 - Math.exp(-followRate * dt);

        const oldX = px[index]!;
        const oldY = py[index]!;
        const oldZ = pz[index]!;
        const x = oldX + (oldX - qx[index]!) * damping;
        const y = oldY + (oldY - qy[index]!) * damping;
        const z = oldZ + (oldZ - qz[index]!) * damping;
        px[index] = x + (tx[index]! - x) * follow;
        py[index] = y + (targetY - y) * follow;
        pz[index] = z + (tz[index]! - z) * follow;
        qx[index] = oldX;
        qy[index] = oldY;
        qz[index] = oldZ;
      }
    }

    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
      if (options.dragging) this.pullHandleTowardTarget(options);
      this.solveDistances(
        this.shapeA,
        this.shapeB,
        this.shapeRest,
        this.shapeStiffness,
      );
      this.solveDistances(
        this.structuralA,
        this.structuralB,
        this.structuralRest,
        this.structuralStiffness,
      );
      this.solveCurvatures(1);
      this.pinSpine();
      this.restOnStack();
    }
    this.keepWithinTurnGuide(options.grabY);
    // Finish with coupled in-plane and curvature passes. A structural-only
    // tail can satisfy edge lengths by reintroducing the alternating hinge we
    // just removed, especially as the vertical grid gets denser.
    for (let iteration = 0; iteration < 8; iteration += 1) {
      this.solveDistances(
        this.structuralA,
        this.structuralB,
        this.structuralRest,
        this.structuralStiffness,
      );
      this.solveCurvatures(1);
      this.pinSpine();
      this.restOnStack();
    }
    for (let iteration = 0; iteration < 8; iteration += 1) {
      this.solveDistances(
        this.structuralA,
        this.structuralB,
        this.structuralRest,
        this.structuralStiffness,
      );
      this.pinSpine();
      this.restOnStack();
    }

    this.measureEnergy(dt);
    return this.publish();
  }

  /**
   * The weightless regime for Drift mode. The guide is a rigid transform of
   * the flat sheet (the leaf's floating carrier), so the curvature
   * constraints pull toward flatness while wind and the pointer's current
   * bend the free area against the pinned spine column. There is no stack
   * floor and no turn-guide tether here: the sheet hangs in open air.
   */
  stepDrift(
    target: readonly LeafVertex[],
    options: DriftSheetOptions,
  ): LeafVertex[] {
    if (!this.initialized) this.reset(target);
    this.restScale = options.restScale ?? 1;
    // Nothing is pinned out here: the sheet floats free and bends everywhere.
    this.spinePinned = false;
    this.loadTarget(target);
    const dt = Math.min(1 / 30, Math.max(1 / 240, options.dt));
    const frameScale = dt * 60;
    const damping = Math.pow(options.damping, frameScale);
    const follow = 1 - Math.exp(-options.followRate * dt);
    const dtSquared = dt * dt;
    const radius = Math.max(1, options.puffRadius);
    const curvatureScale = options.curvatureScale ?? 1;
    const flutterX = options.flutterX ?? 0;
    const flutterY = options.flutterY ?? 0;
    const flutterZ = options.flutterZ ?? 0;
    const flutterPhase = options.flutterPhase ?? 0;
    const columns = this.columns;
    const { px, py, pz, qx, qy, qz, tx, ty, tz } = this;

    for (let index = 0; index < this.count; index += 1) {
      let accelX = options.windX;
      let accelY = options.windY;
      let accelZ = options.windZ;

      // Two travelling waves across the sheet, one along each axis, so the
      // ripple crosses the whole page instead of standing still.
      const column = index % columns;
      const u = column / this.segments;
      const v = (index - column) / columns / this.rows;
      const wave =
        Math.sin(u * 5.6 + flutterPhase) * 0.62 +
        Math.sin(v * 4.3 - flutterPhase * 0.83 + 1.7) * 0.38;
      accelX += flutterX * wave;
      accelY += flutterY * wave;
      accelZ += flutterZ * wave;

      const oldX = px[index]!;
      const oldY = py[index]!;
      const oldZ = pz[index]!;
      if (options.puffStrength !== 0) {
        const dx = oldX - options.puffX;
        const dy = oldY - options.puffY;
        const dz = oldZ - options.puffZ;
        const distance = length3(dx, dy, dz);
        if (distance > 1e-3) {
          const falloff =
            (options.puffStrength *
              Math.exp(-(distance * distance) / (radius * radius))) /
            distance;
          accelX += dx * falloff;
          accelY += dy * falloff;
          accelZ += dz * falloff;
        }
      }

      const x = oldX + ((oldX - qx[index]!) * damping + accelX * dtSquared);
      const y = oldY + ((oldY - qy[index]!) * damping + accelY * dtSquared);
      const z = oldZ + ((oldZ - qz[index]!) * damping + accelZ * dtSquared);
      px[index] = x + (tx[index]! - x) * follow;
      py[index] = y + (ty[index]! - y) * follow;
      pz[index] = z + (tz[index]! - z) * follow;
      qx[index] = oldX;
      qy[index] = oldY;
      qz[index] = oldZ;
    }

    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
      this.solveDistances(
        this.shapeA,
        this.shapeB,
        this.shapeRest,
        this.shapeStiffness,
      );
      this.solveDistances(
        this.structuralA,
        this.structuralB,
        this.structuralRest,
        this.structuralStiffness,
      );
      this.solveCurvatures(curvatureScale);
    }

    const maxDeviation = options.maxDeviation ?? 0;
    if (maxDeviation > 0) {
      const maxSquared = maxDeviation * maxDeviation;
      for (let index = 0; index < this.count; index += 1) {
        const dx = px[index]! - tx[index]!;
        const dy = py[index]! - ty[index]!;
        const dz = pz[index]! - tz[index]!;
        const squared = dx * dx + dy * dy + dz * dz;
        if (squared <= maxSquared) continue;
        // Pull the vertex back onto the shell, co-moving `previous` so the
        // correction carries no velocity — the same inelastic handling the
        // stack floor uses, or the clamp would fling the sheet back.
        const shrink = maxDeviation / Math.sqrt(squared) - 1;
        const moveX = dx * shrink;
        const moveY = dy * shrink;
        const moveZ = dz * shrink;
        px[index] += moveX;
        py[index] += moveY;
        pz[index] += moveZ;
        qx[index] += moveX;
        qy[index] += moveY;
        qz[index] += moveZ;
      }
    }

    this.measureEnergy(dt);
    return this.publish();
  }

  private index(row: number, column: number) {
    return row * this.columns + column;
  }

  /** Copies the frame's guide and caches its second differences, which the
      bend constraints compare against on every iteration. */
  private loadTarget(target: readonly LeafVertex[]) {
    const { tx, ty, tz } = this;
    for (let index = 0; index < this.count; index += 1) {
      const guide = target[index]!;
      tx[index] = guide.x;
      ty[index] = guide.y;
      tz[index] = guide.z;
    }
    const { curvatureA, curvatureB, curvatureC, desiredX, desiredY, desiredZ } = this;
    for (let i = 0; i < curvatureA.length; i += 1) {
      const a = curvatureA[i]!;
      const b = curvatureB[i]!;
      const c = curvatureC[i]!;
      desiredX[i] = tx[a]! - 2 * tx[b]! + tx[c]!;
      desiredY[i] = ty[a]! - 2 * ty[b]! + ty[c]!;
      desiredZ[i] = tz[a]! - 2 * tz[b]! + tz[c]!;
    }
  }

  /** Writes the solver state into the caller-facing vertex objects. */
  private publish(): LeafVertex[] {
    const { px, py, pz, vertices } = this;
    for (let index = 0; index < this.count; index += 1) {
      const vertex = vertices[index]!;
      vertex.x = px[index]!;
      vertex.y = py[index]!;
      vertex.z = pz[index]!;
    }
    return vertices;
  }

  private measureEnergy(dt: number) {
    const { px, py, pz, qx, qy, qz } = this;
    let travel = 0;
    for (let index = 0; index < this.count; index += 1) {
      travel += length3(
        px[index]! - qx[index]!,
        py[index]! - qy[index]!,
        pz[index]! - qz[index]!,
      );
    }
    const meanSpeed = travel / this.count / dt;
    this.energy += (meanSpeed / this.width - this.energy) * Math.min(1, dt * 14);
  }

  private pinSpine() {
    const { px, py, pz, qx, qy, qz, tx, ty, tz } = this;
    for (let row = 0; row <= this.rows; row += 1) {
      const index = this.index(row, 0);
      px[index] = tx[index]!;
      py[index] = ty[index]!;
      pz[index] = tz[index]!;
      qx[index] = tx[index]!;
      qy[index] = ty[index]!;
      qz[index] = tz[index]!;
    }
  }

  /** The stacks are solid: z = 0 is a floor, not a suggestion. Contact is
      inelastic — penetrating velocity dies, separating velocity survives.
      Constraint passes co-move `previous` with `positions` (zero-velocity
      corrections), so when both are dragged below the floor the clamp must
      shift them together: restoring only the position half would convert the
      correction into a manufactured upward bounce. */
  private restOnStack() {
    const { pz, qz } = this;
    for (let index = 0; index < this.count; index += 1) {
      const depth = pz[index]!;
      if (depth < 0) {
        pz[index] = 0;
        if (qz[index]! > depth) qz[index] = 0;
        else qz[index] = qz[index]! - depth;
      }
    }
  }

  private pullHandleTowardTarget(options: PaperStepOptions) {
    const { px, py, pz, qx, qy, qz, tx, ty, tz } = this;
    for (let row = 0; row <= this.rows; row += 1) {
      const v = 1 - (row / this.rows) * 2;
      const distance = v - options.grabY;
      const rowWeight = Math.exp(-(distance * distance) / 0.48);
      const rowShear = pullRowWeight(distance);
      for (let column = Math.max(1, this.segments - 3); column <= this.segments; column += 1) {
        const u = column / this.segments;
        const columnShear = pullColumnWeight(u);
        const weight = Math.pow(u, 4) * rowWeight * 0.1;
        const index = this.index(row, column);
        const moveX = (tx[index]! - px[index]!) * weight;
        const moveY =
          (ty[index]! + options.handleOffsetY * columnShear * rowShear - py[index]!) *
          weight;
        const moveZ = (tz[index]! - pz[index]!) * weight;
        px[index] += moveX;
        py[index] += moveY;
        pz[index] += moveZ;
        qx[index] += moveX;
        qy[index] += moveY;
        qz[index] += moveZ;
      }
    }
  }

  private keepWithinTurnGuide(grabY: number) {
    const { px, py, pz, qx, qy, qz, tx, ty, tz } = this;
    for (let row = 0; row <= this.rows; row += 1) {
      const v = 1 - (row / this.rows) * 2;
      const distance = v - grabY;
      const grabWeight = Math.exp(-(distance * distance) / 0.34);
      const tether = 0.16 + (1 - grabWeight) * 0.58;
      for (let column = 1; column <= this.segments; column += 1) {
        const index = this.index(row, column);
        const u = column / this.segments;
        const weight = tether * (0.35 + 0.65 * u);
        const moveX = (tx[index]! - px[index]!) * weight;
        const moveY = (ty[index]! - py[index]!) * weight;
        const moveZ = (tz[index]! - pz[index]!) * weight;
        px[index] += moveX;
        py[index] += moveY;
        pz[index] += moveZ;
        qx[index] += moveX;
        qy[index] += moveY;
        qz[index] += moveZ;
      }
    }
  }

  /** One Gauss-Seidel pass over a distance-constraint table. Corrections
      co-move `previous`, so they reshape the sheet without adding velocity. */
  private solveDistances(
    constraintA: Int32Array,
    constraintB: Int32Array,
    rest: Float64Array,
    stiffness: number,
  ) {
    const { px, py, pz, qx, qy, qz } = this;
    const restScale = this.restScale;
    const pinned = this.spinePinned ? this.spineColumn : null;
    for (let i = 0; i < constraintA.length; i += 1) {
      const a = constraintA[i]!;
      const b = constraintB[i]!;
      const dx = px[b]! - px[a]!;
      const dy = py[b]! - py[a]!;
      const dz = pz[b]! - pz[a]!;
      const length = length3(dx, dy, dz);
      if (length < 1e-6) continue;
      const weightA = pinned !== null && pinned[a] === 1 ? 0 : 1;
      const weightB = pinned !== null && pinned[b] === 1 ? 0 : 1;
      const weight = weightA + weightB;
      if (weight === 0) continue;
      const correction =
        ((length - rest[i]! * restScale) / length) * stiffness / weight;

      if (weightA) {
        const moveX = dx * correction * weightA;
        const moveY = dy * correction * weightA;
        const moveZ = dz * correction * weightA;
        px[a] += moveX;
        py[a] += moveY;
        pz[a] += moveZ;
        qx[a] += moveX;
        qy[a] += moveY;
        qz[a] += moveZ;
      }
      if (weightB) {
        const moveX = dx * correction * weightB;
        const moveY = dy * correction * weightB;
        const moveZ = dz * correction * weightB;
        px[b] -= moveX;
        py[b] -= moveY;
        pz[b] -= moveZ;
        qx[b] -= moveX;
        qy[b] -= moveY;
        qz[b] -= moveZ;
      }
    }
  }

  /**
   * Match the guide's local second derivative rather than the distance between
   * every other point. A distance-only bend can hinge left-right-left while
   * remaining the correct length, which is the accordion mode paper must not
   * have. Curvature matching removes that high-frequency fold while retaining
   * the guide's broad roll and the handle's low-frequency lag.
   */
  private solveCurvatures(scale: number) {
    const { px, py, pz, qx, qy, qz, desiredX, desiredY, desiredZ } = this;
    const { curvatureA, curvatureB, curvatureC } = this;
    const stiffness = this.curvatureStiffness;
    const pinned = this.spinePinned ? this.spineColumn : null;
    for (let i = 0; i < curvatureA.length; i += 1) {
      const a = curvatureA[i]!;
      const b = curvatureB[i]!;
      const c = curvatureC[i]!;
      const weightA = pinned !== null && pinned[a] === 1 ? 0 : 1;
      const weightB = pinned !== null && pinned[b] === 1 ? 0 : 1;
      const weightC = pinned !== null && pinned[c] === 1 ? 0 : 1;
      const denominator = weightA + weightB * 4 + weightC;
      if (denominator === 0) continue;

      let current = px[a]! - 2 * px[b]! + px[c]!;
      let correction =
        ((current - desiredX[i]!) * stiffness * scale) / denominator;
      let moveA = -correction * weightA;
      let moveB = correction * 2 * weightB;
      let moveC = -correction * weightC;
      px[a] += moveA;
      px[b] += moveB;
      px[c] += moveC;
      qx[a] += moveA;
      qx[b] += moveB;
      qx[c] += moveC;

      current = py[a]! - 2 * py[b]! + py[c]!;
      correction = ((current - desiredY[i]!) * stiffness * scale) / denominator;
      moveA = -correction * weightA;
      moveB = correction * 2 * weightB;
      moveC = -correction * weightC;
      py[a] += moveA;
      py[b] += moveB;
      py[c] += moveC;
      qy[a] += moveA;
      qy[b] += moveB;
      qy[c] += moveC;

      current = pz[a]! - 2 * pz[b]! + pz[c]!;
      correction = ((current - desiredZ[i]!) * stiffness * scale) / denominator;
      moveA = -correction * weightA;
      moveB = correction * 2 * weightB;
      moveC = -correction * weightC;
      pz[a] += moveA;
      pz[b] += moveB;
      pz[c] += moveC;
      qz[a] += moveA;
      qz[b] += moveB;
      qz[c] += moveC;
    }
  }
}
