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

interface Constraint {
  a: number;
  b: number;
  rest: number;
  stiffness: number;
}

interface CurvatureConstraint {
  a: number;
  b: number;
  c: number;
  stiffness: number;
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

const copyVertex = (vertex: LeafVertex): LeafVertex => ({ ...vertex });

/**
 * A small position-based sheet solver. The procedural curl remains the broad
 * turn guide, while Verlet inertia plus structural, shear, and bend
 * constraints supply the local lag and recovery that make thin stock read as
 * a sheet instead of a hinged surface.
 */
export class PaperSheet {
  private readonly segments: number;
  private readonly rows: number;
  private readonly width: number;
  private readonly structuralConstraints: Constraint[] = [];
  private readonly shapeConstraints: Constraint[] = [];
  private readonly curvatureConstraints: CurvatureConstraint[] = [];
  private readonly positions: LeafVertex[];
  private readonly previous: LeafVertex[];
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
    const count = (segments + 1) * (rows + 1);
    this.positions = Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0 }));
    this.previous = Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0 }));

    const dx = width / segments;
    const dy = height / rows;
    const structural = perIterationStiffness(STRUCTURAL_STIFFNESS);
    const shear = perIterationStiffness(SHEAR_STIFFNESS);
    const curvature = perIterationStiffness(CURVATURE_STIFFNESS);
    const addStructural = (a: number, b: number, rest: number) => {
      this.structuralConstraints.push({ a, b, rest, stiffness: structural });
    };
    const addShape = (a: number, b: number, rest: number, stiffness: number) => {
      this.shapeConstraints.push({ a, b, rest, stiffness });
    };

    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= segments; column += 1) {
        const here = this.index(row, column);
        if (column < segments) addStructural(here, this.index(row, column + 1), dx);
        if (row < rows) addStructural(here, this.index(row + 1, column), dy);
        if (column < segments && row < rows) {
          const diagonal = Math.hypot(dx, dy);
          addShape(here, this.index(row + 1, column + 1), diagonal, shear);
          addShape(this.index(row + 1, column), this.index(row, column + 1), diagonal, shear);
        }
        if (column < segments - 1) {
          this.curvatureConstraints.push({
            a: here,
            b: this.index(row, column + 1),
            c: this.index(row, column + 2),
            stiffness: curvature,
          });
        }
        if (row < rows - 1) {
          this.curvatureConstraints.push({
            a: here,
            b: this.index(row + 1, column),
            c: this.index(row + 2, column),
            stiffness: curvature,
          });
        }
      }
    }
  }

  reset(vertices: readonly LeafVertex[]) {
    for (let index = 0; index < this.positions.length; index += 1) {
      const source = vertices[index]!;
      this.positions[index] = copyVertex(source);
      this.previous[index] = copyVertex(source);
    }
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
    const dt = Math.min(1 / 30, Math.max(1 / 240, options.dt));
    const frameScale = dt * 60;
    const damping = Math.pow(
      options.dragging ? DRAG_DAMPING : SETTLE_DAMPING,
      frameScale,
    );

    for (let row = 0; row <= this.rows; row += 1) {
      const v = 1 - (row / this.rows) * 2;
      const rowDistance = v - options.grabY;
      const rowShear = pullRowWeight(rowDistance);
      for (let column = 0; column <= this.segments; column += 1) {
        const index = this.index(row, column);
        const point = this.positions[index]!;
        const old = copyVertex(point);
        const previous = this.previous[index]!;
        const u = column / this.segments;
        const columnShear = pullColumnWeight(u);
        const guide = target[index]!;
        const targetY = guide.y + options.handleOffsetY * columnShear * rowShear;
        const followRate = options.dragging
          ? BASE_FOLLOW_RATE + HANDLE_FOLLOW_RATE * columnShear
          : SETTLE_FOLLOW_RATE;
        const follow = 1 - Math.exp(-followRate * dt);

        point.x += (point.x - previous.x) * damping;
        point.y += (point.y - previous.y) * damping;
        point.z += (point.z - previous.z) * damping;
        point.x += (guide.x - point.x) * follow;
        point.y += (targetY - point.y) * follow;
        point.z += (guide.z - point.z) * follow;
        this.previous[index] = old;
      }
    }

    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
      if (options.dragging) this.pullHandleTowardTarget(target, options);
      for (const constraint of this.shapeConstraints) this.solveConstraint(constraint);
      for (const constraint of this.structuralConstraints) this.solveConstraint(constraint);
      for (const constraint of this.curvatureConstraints) {
        this.solveCurvatureConstraint(constraint, target);
      }
      this.pinSpine(target);
      this.restOnStack();
    }
    this.keepWithinTurnGuide(target, options.grabY);
    // Finish with coupled in-plane and curvature passes. A structural-only
    // tail can satisfy edge lengths by reintroducing the alternating hinge we
    // just removed, especially as the vertical grid gets denser.
    for (let iteration = 0; iteration < 8; iteration += 1) {
      for (const constraint of this.structuralConstraints) this.solveConstraint(constraint);
      for (const constraint of this.curvatureConstraints) {
        this.solveCurvatureConstraint(constraint, target);
      }
      this.pinSpine(target);
      this.restOnStack();
    }
    for (let iteration = 0; iteration < 8; iteration += 1) {
      for (const constraint of this.structuralConstraints) this.solveConstraint(constraint);
      this.pinSpine(target);
      this.restOnStack();
    }

    let travel = 0;
    for (let index = 0; index < this.positions.length; index += 1) {
      const point = this.positions[index]!;
      const previous = this.previous[index]!;
      travel += Math.hypot(
        point.x - previous.x,
        point.y - previous.y,
        point.z - previous.z,
      );
    }
    const meanSpeed = travel / this.positions.length / dt;
    this.energy += (meanSpeed / this.width - this.energy) * Math.min(1, dt * 14);

    return this.positions;
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
    const columns = this.segments + 1;

    for (let index = 0; index < this.positions.length; index += 1) {
      const point = this.positions[index]!;
      const old = copyVertex(point);
      const previous = this.previous[index]!;
      const guide = target[index]!;

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
      if (options.puffStrength !== 0) {
        const dx = point.x - options.puffX;
        const dy = point.y - options.puffY;
        const dz = point.z - options.puffZ;
        const distance = Math.hypot(dx, dy, dz);
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

      point.x += (point.x - previous.x) * damping + accelX * dtSquared;
      point.y += (point.y - previous.y) * damping + accelY * dtSquared;
      point.z += (point.z - previous.z) * damping + accelZ * dtSquared;
      point.x += (guide.x - point.x) * follow;
      point.y += (guide.y - point.y) * follow;
      point.z += (guide.z - point.z) * follow;
      this.previous[index] = old;
    }

    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
      for (const constraint of this.shapeConstraints) this.solveConstraint(constraint);
      for (const constraint of this.structuralConstraints) this.solveConstraint(constraint);
      for (const constraint of this.curvatureConstraints) {
        this.solveCurvatureConstraint(constraint, target, curvatureScale);
      }
    }

    const maxDeviation = options.maxDeviation ?? 0;
    if (maxDeviation > 0) {
      const maxSquared = maxDeviation * maxDeviation;
      for (let index = 0; index < this.positions.length; index += 1) {
        const point = this.positions[index]!;
        const guide = target[index]!;
        const dx = point.x - guide.x;
        const dy = point.y - guide.y;
        const dz = point.z - guide.z;
        const squared = dx * dx + dy * dy + dz * dz;
        if (squared <= maxSquared) continue;
        // Pull the vertex back onto the shell, co-moving `previous` so the
        // correction carries no velocity — the same inelastic handling the
        // stack floor uses, or the clamp would fling the sheet back.
        const shrink = maxDeviation / Math.sqrt(squared) - 1;
        const moveX = dx * shrink;
        const moveY = dy * shrink;
        const moveZ = dz * shrink;
        point.x += moveX;
        point.y += moveY;
        point.z += moveZ;
        const previous = this.previous[index]!;
        previous.x += moveX;
        previous.y += moveY;
        previous.z += moveZ;
      }
    }

    let travel = 0;
    for (let index = 0; index < this.positions.length; index += 1) {
      const point = this.positions[index]!;
      const previous = this.previous[index]!;
      travel += Math.hypot(
        point.x - previous.x,
        point.y - previous.y,
        point.z - previous.z,
      );
    }
    const meanSpeed = travel / this.positions.length / dt;
    this.energy += (meanSpeed / this.width - this.energy) * Math.min(1, dt * 14);

    return this.positions;
  }

  private index(row: number, column: number) {
    return row * (this.segments + 1) + column;
  }

  private isPinned(index: number) {
    return this.spinePinned && index % (this.segments + 1) === 0;
  }

  private pinSpine(target: readonly LeafVertex[]) {
    for (let row = 0; row <= this.rows; row += 1) {
      const index = this.index(row, 0);
      const guide = target[index]!;
      const point = this.positions[index]!;
      point.x = guide.x;
      point.y = guide.y;
      point.z = guide.z;
      const previous = this.previous[index]!;
      previous.x = guide.x;
      previous.y = guide.y;
      previous.z = guide.z;
    }
  }

  /** The stacks are solid: z = 0 is a floor, not a suggestion. Contact is
      inelastic — penetrating velocity dies, separating velocity survives.
      Constraint passes co-move `previous` with `positions` (zero-velocity
      corrections), so when both are dragged below the floor the clamp must
      shift them together: restoring only the position half would convert the
      correction into a manufactured upward bounce. */
  private restOnStack() {
    for (let index = 0; index < this.positions.length; index += 1) {
      const point = this.positions[index]!;
      if (point.z < 0) {
        const depth = point.z;
        point.z = 0;
        const previous = this.previous[index]!;
        if (previous.z > depth) previous.z = 0;
        else previous.z -= depth;
      }
    }
  }

  private pullHandleTowardTarget(
    target: readonly LeafVertex[],
    options: PaperStepOptions,
  ) {
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
        const point = this.positions[index]!;
        const guide = target[index]!;
        const moveX = (guide.x - point.x) * weight;
        const moveY =
          (guide.y + options.handleOffsetY * columnShear * rowShear - point.y) *
          weight;
        const moveZ = (guide.z - point.z) * weight;
        point.x += moveX;
        point.y += moveY;
        point.z += moveZ;
        const previous = this.previous[index]!;
        previous.x += moveX;
        previous.y += moveY;
        previous.z += moveZ;
      }
    }
  }

  private keepWithinTurnGuide(target: readonly LeafVertex[], grabY: number) {
    for (let row = 0; row <= this.rows; row += 1) {
      const v = 1 - (row / this.rows) * 2;
      const distance = v - grabY;
      const grabWeight = Math.exp(-(distance * distance) / 0.34);
      const tether = 0.16 + (1 - grabWeight) * 0.58;
      for (let column = 1; column <= this.segments; column += 1) {
        const index = this.index(row, column);
        const point = this.positions[index]!;
        const guide = target[index]!;
        const u = column / this.segments;
        const weight = tether * (0.35 + 0.65 * u);
        const moveX = (guide.x - point.x) * weight;
        const moveY = (guide.y - point.y) * weight;
        const moveZ = (guide.z - point.z) * weight;
        point.x += moveX;
        point.y += moveY;
        point.z += moveZ;
        const previous = this.previous[index]!;
        previous.x += moveX;
        previous.y += moveY;
        previous.z += moveZ;
      }
    }
  }

  private solveConstraint(constraint: Constraint) {
    const a = this.positions[constraint.a]!;
    const b = this.positions[constraint.b]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return;
    const weightA = this.isPinned(constraint.a) ? 0 : 1;
    const weightB = this.isPinned(constraint.b) ? 0 : 1;
    const weight = weightA + weightB;
    if (weight === 0) return;
    const correction =
      ((length - constraint.rest * this.restScale) / length) *
      constraint.stiffness / weight;

    if (weightA) {
      const moveX = dx * correction * weightA;
      const moveY = dy * correction * weightA;
      const moveZ = dz * correction * weightA;
      a.x += moveX;
      a.y += moveY;
      a.z += moveZ;
      const previous = this.previous[constraint.a]!;
      previous.x += moveX;
      previous.y += moveY;
      previous.z += moveZ;
    }
    if (weightB) {
      const moveX = dx * correction * weightB;
      const moveY = dy * correction * weightB;
      const moveZ = dz * correction * weightB;
      b.x -= moveX;
      b.y -= moveY;
      b.z -= moveZ;
      const previous = this.previous[constraint.b]!;
      previous.x -= moveX;
      previous.y -= moveY;
      previous.z -= moveZ;
    }
  }

  /**
   * Match the guide's local second derivative rather than the distance between
   * every other point. A distance-only bend can hinge left-right-left while
   * remaining the correct length, which is the accordion mode paper must not
   * have. Curvature matching removes that high-frequency fold while retaining
   * the guide's broad roll and the handle's low-frequency lag.
   */
  private solveCurvatureConstraint(
    constraint: CurvatureConstraint,
    target: readonly LeafVertex[],
    scale = 1,
  ) {
    const a = this.positions[constraint.a]!;
    const b = this.positions[constraint.b]!;
    const c = this.positions[constraint.c]!;
    const targetA = target[constraint.a]!;
    const targetB = target[constraint.b]!;
    const targetC = target[constraint.c]!;
    const weightA = this.isPinned(constraint.a) ? 0 : 1;
    const weightB = this.isPinned(constraint.b) ? 0 : 1;
    const weightC = this.isPinned(constraint.c) ? 0 : 1;
    const denominator = weightA + weightB * 4 + weightC;
    if (denominator === 0) return;

    const correctAxis = (axis: "x" | "y" | "z") => {
      const current = a[axis] - 2 * b[axis] + c[axis];
      const desired = targetA[axis] - 2 * targetB[axis] + targetC[axis];
      const correction =
        ((current - desired) * constraint.stiffness * scale) / denominator;
      const moveA = -correction * weightA;
      const moveB = correction * 2 * weightB;
      const moveC = -correction * weightC;
      a[axis] += moveA;
      b[axis] += moveB;
      c[axis] += moveC;
      this.previous[constraint.a]![axis] += moveA;
      this.previous[constraint.b]![axis] += moveB;
      this.previous[constraint.c]![axis] += moveC;
    };

    correctAxis("x");
    correctAxis("y");
    correctAxis("z");
  }
}
