import type { LeafVertex } from "./bend";

export interface PaperStepOptions {
  dt: number;
  dragging: boolean;
  grabY: number;
  handleOffsetY: number;
  velocity: number;
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
const CURVATURE_STIFFNESS = 0.84;
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
  private readonly structuralConstraints: Constraint[] = [];
  private readonly shapeConstraints: Constraint[] = [];
  private readonly curvatureConstraints: CurvatureConstraint[] = [];
  private readonly positions: LeafVertex[];
  private readonly previous: LeafVertex[];
  private initialized = false;

  constructor(
    width: number,
    height: number,
    segments: number,
    rows: number,
  ) {
    this.segments = segments;
    this.rows = rows;
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
    this.initialized = true;
  }

  step(target: readonly LeafVertex[], options: PaperStepOptions): LeafVertex[] {
    if (!this.initialized) this.reset(target);
    const dt = Math.min(1 / 30, Math.max(1 / 240, options.dt));
    const frameScale = dt * 60;
    const damping = Math.pow(
      options.dragging ? DRAG_DAMPING : SETTLE_DAMPING,
      frameScale,
    );

    for (let row = 0; row <= this.rows; row += 1) {
      const v = 1 - (row / this.rows) * 2;
      const rowDistance = v - options.grabY;
      const rowWeight = Math.exp(-(rowDistance * rowDistance) / 0.34);
      for (let column = 0; column <= this.segments; column += 1) {
        const index = this.index(row, column);
        const point = this.positions[index]!;
        const old = copyVertex(point);
        const previous = this.previous[index]!;
        const u = column / this.segments;
        const handleWeight = Math.pow(u, 3.2) * rowWeight;
        const guide = target[index]!;
        const targetY = guide.y + options.handleOffsetY * handleWeight;
        const followRate = options.dragging
          ? BASE_FOLLOW_RATE + HANDLE_FOLLOW_RATE * handleWeight
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
    }
    for (let iteration = 0; iteration < 8; iteration += 1) {
      for (const constraint of this.structuralConstraints) this.solveConstraint(constraint);
      this.pinSpine(target);
    }

    return this.positions;
  }

  private index(row: number, column: number) {
    return row * (this.segments + 1) + column;
  }

  private isPinned(index: number) {
    return index % (this.segments + 1) === 0;
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

  private pullHandleTowardTarget(
    target: readonly LeafVertex[],
    options: PaperStepOptions,
  ) {
    for (let row = 0; row <= this.rows; row += 1) {
      const v = 1 - (row / this.rows) * 2;
      const distance = v - options.grabY;
      const rowWeight = Math.exp(-(distance * distance) / 0.48);
      for (let column = Math.max(1, this.segments - 3); column <= this.segments; column += 1) {
        const u = column / this.segments;
        const weight = Math.pow(u, 4) * rowWeight * 0.1;
        const index = this.index(row, column);
        const point = this.positions[index]!;
        const guide = target[index]!;
        const moveX = (guide.x - point.x) * weight;
        const moveY = (guide.y + options.handleOffsetY * rowWeight - point.y) * weight;
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
      ((length - constraint.rest) / length) * constraint.stiffness / weight;

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
        ((current - desired) * constraint.stiffness) / denominator;
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
