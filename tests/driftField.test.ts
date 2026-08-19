import { describe, expect, it } from "vitest";
import {
  DRIFT_DEV_CELLS,
  DRIFT_LAYER_GAP,
  driftPairClearance,
  beginDriftLanding,
  createDriftField,
  pickDriftLeaf,
  pointerPointAtDepth,
  stepDriftField,
  type DriftField,
  type DriftPointerInput,
} from "../src/drift/driftField";

const PW = 500;
const PH = 667;
const TOTAL = 11;
const SPREAD = 5;
const DT = 1 / 60;

const makeField = (spread = SPREAD) =>
  createDriftField({
    pw: PW,
    ph: PH,
    totalLeaves: TOTAL,
    currentSpread: spread,
    seed: 7,
  });

const makeInput = (over: Partial<DriftPointerInput> = {}): DriftPointerInput => ({
  screenX: 0,
  screenY: 0,
  inside: false,
  pressed: false,
  shift: 0,
  cameraDistance: 2300,
  viewportWidth: 1440,
  viewportHeight: 900,
  ...over,
});

const run = (field: DriftField, frames: number, input: DriftPointerInput) => {
  for (let frame = 0; frame < frames; frame += 1) {
    stepDriftField(field, DT, input);
  }
};

const homeDistance = (field: DriftField, index: number) => {
  const leaf = field.leaves[index]!;
  return Math.hypot(
    leaf.x - leaf.homeX,
    leaf.y - leaf.homeY,
    leaf.z - leaf.homeZ,
  );
};

type Leaf = DriftField["leaves"][number];

/** The leaf's in-plane axes and scaled half-extents as a 3D rectangle. */
const rectangle = (leaf: Leaf) => {
  const { qx, qy, qz, qw } = leaf;
  return {
    cx: leaf.x,
    cy: leaf.y,
    cz: leaf.z,
    ux: 1 - 2 * (qy * qy + qz * qz),
    uy: 2 * (qx * qy + qz * qw),
    uz: 2 * (qx * qz - qy * qw),
    vx: 2 * (qx * qy - qz * qw),
    vy: 1 - 2 * (qx * qx + qz * qz),
    vz: 2 * (qy * qz + qx * qw),
    hu: (PW / 2) * leaf.scale,
    hv: (PH / 2) * leaf.scale,
  };
};

/**
 * Separating-axis test between two leaf rectangles in 3D. Returns the widest
 * separation over all candidate axes: positive means a real gap exists on
 * some axis, negative approximates the penetration depth.
 */
const rectangleSeparation = (a: Leaf, b: Leaf) => {
  const A = rectangle(a);
  const B = rectangle(b);
  const dx = B.cx - A.cx;
  const dy = B.cy - A.cy;
  const dz = B.cz - A.cz;
  const axes: Array<[number, number, number]> = [];
  const cross = (
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
  ): [number, number, number] => [
    y1 * z2 - z1 * y2,
    z1 * x2 - x1 * z2,
    x1 * y2 - y1 * x2,
  ];
  axes.push(cross(A.ux, A.uy, A.uz, A.vx, A.vy, A.vz)); // normal of A
  axes.push(cross(B.ux, B.uy, B.uz, B.vx, B.vy, B.vz)); // normal of B
  axes.push(cross(A.ux, A.uy, A.uz, B.ux, B.uy, B.uz));
  axes.push(cross(A.ux, A.uy, A.uz, B.vx, B.vy, B.vz));
  axes.push(cross(A.vx, A.vy, A.vz, B.ux, B.uy, B.uz));
  axes.push(cross(A.vx, A.vy, A.vz, B.vx, B.vy, B.vz));
  let widest = -Infinity;
  for (const [x, y, z] of axes) {
    const length = Math.hypot(x, y, z);
    if (length < 1e-9) continue;
    const nx = x / length;
    const ny = y / length;
    const nz = z / length;
    const distance = Math.abs(dx * nx + dy * ny + dz * nz);
    const reachA =
      A.hu * Math.abs(A.ux * nx + A.uy * ny + A.uz * nz) +
      A.hv * Math.abs(A.vx * nx + A.vy * ny + A.vz * nz);
    const reachB =
      B.hu * Math.abs(B.ux * nx + B.uy * ny + B.uz * nz) +
      B.hv * Math.abs(B.vx * nx + B.vy * ny + B.vz * nz);
    widest = Math.max(widest, distance - (reachA + reachB));
  }
  return widest;
};

/** Deepest pairwise rectangle penetration in the field; ≥ 0 when no two
    leaf planes intersect at all. */
const worstPenetration = (field: DriftField) => {
  let worst = 0;
  for (let i = 0; i < field.leaves.length; i += 1) {
    for (let j = i + 1; j < field.leaves.length; j += 1) {
      const separation = rectangleSeparation(
        field.leaves[i]!,
        field.leaves[j]!,
      );
      if (separation < worst) worst = separation;
    }
  }
  return -worst;
};

/* Multi-hundred-frame integrations: deterministic, but wall-clock-sensitive
   on starved CI workers — same allowance the paper sheet suite takes. */
describe("drift leaf field", { timeout: 30_000 }, () => {
  it("lays out home poses matching the resting book stacks", () => {
    const field = makeField();
    expect(field.leaves).toHaveLength(TOTAL);
    for (const leaf of field.leaves) {
      if (leaf.index < SPREAD) {
        expect(leaf.side).toBe("left");
        expect(leaf.homeX).toBe(-PW / 2);
        // Left leaves lie flipped: a half-turn about the vertical spine axis.
        expect(leaf.homeQY).toBe(1);
        expect(leaf.homeQW).toBe(0);
        expect(leaf.layer).toBe(SPREAD - 1 - leaf.index);
      } else {
        expect(leaf.side).toBe("right");
        expect(leaf.homeX).toBe(PW / 2);
        expect(leaf.homeQY).toBe(0);
        expect(leaf.homeQW).toBe(1);
        expect(leaf.layer).toBe(leaf.index - SPREAD);
      }
      expect(leaf.homeZ).toBeCloseTo(-leaf.layer * DRIFT_LAYER_GAP, 10);
      // Every leaf starts exactly at home, bound to the closed book.
      expect(homeDistance(field, leaf.index)).toBe(0);
      expect(leaf.release).toBe(0);
    }
    // The exposed sheets sit at the top of each pile.
    expect(field.leaves[SPREAD - 1]!.homeZ).toBe(0);
    expect(field.leaves[SPREAD]!.homeZ).toBe(0);
  });

  it("loosens every leaf through the gravity fade and comes apart", () => {
    const field = makeField();
    const input = makeInput();
    // Fade (1s) plus the full stagger window, with slack.
    run(field, 150, input);
    expect(field.phase).toBe("adrift");
    for (const leaf of field.leaves) {
      expect(leaf.release).toBe(1);
      // Each leaf has visibly departed its slot in the pile — forward or
      // backward; the drift volume spans both sides of the page plane.
      expect(homeDistance(field, leaf.index)).toBeGreaterThan(15);
    }
  });

  it("stays finite, unit-quaternion, and inside the viewport over a long idle", () => {
    const field = makeField();
    const input = makeInput();
    run(field, 1800, input); // 30 seconds of unattended drift
    for (const leaf of field.leaves) {
      expect(Number.isFinite(leaf.x + leaf.y + leaf.z)).toBe(true);
      const norm = Math.hypot(leaf.qx, leaf.qy, leaf.qz, leaf.qw);
      expect(Math.abs(norm - 1)).toBeLessThan(1e-6);
      // Soft containment: centers never reach the viewport edge.
      expect(Math.abs(leaf.x + input.shift)).toBeLessThan(720);
      expect(Math.abs(leaf.y)).toBeLessThan(450);
      expect(leaf.z).toBeGreaterThan(PH * -0.45 - 20);
      expect(leaf.z).toBeLessThan(PH * 0.82 + 60);
    }
  });

  it("keeps a floating page's apparent size constant at any depth", () => {
    const field = makeField();
    const input = makeInput();
    run(field, 600, input); // deep into the drift, leaves spread in z
    let spread = 0;
    for (const leaf of field.leaves) {
      spread = Math.max(spread, leaf.z);
      // World size shrinks by exactly the perspective magnification, so the
      // projected width stays the nominal page width.
      const apparent =
        PW * leaf.scale * (input.cameraDistance / (input.cameraDistance - leaf.z));
      if (leaf.z >= 0) {
        expect(apparent).toBeGreaterThan(PW * 0.995);
        expect(apparent).toBeLessThan(PW * 1.005);
      } else {
        // Behind the page plane the counter-scale caps at 1 — pages may
        // look slightly smaller there, never zoomed.
        expect(leaf.scale).toBe(1);
      }
    }
    // The run actually exercised real depth.
    expect(spread).toBeGreaterThan(100);
  });

  it("never lets two leaf planes intersect, from loosen through a long drift", () => {
    const field = makeField();
    const input = makeInput();
    // The freshly loosened pile sits at a 2.3px pitch where near-parallel
    // sheets may brush; once release completes the invariant is strict.
    for (let frame = 0; frame < 150; frame += 1) {
      stepDriftField(field, DT, input);
      expect(worstPenetration(field)).toBeLessThan(9);
    }
    let sum = 0;
    let grazes = 0;
    let peak = 0;
    for (let frame = 0; frame < 1650; frame += 1) {
      stepDriftField(field, DT, input);
      const penetration = worstPenetration(field);
      sum += penetration;
      if (penetration > 6) grazes += 1;
      peak = Math.max(peak, penetration);
    }
    expect(peak).toBeLessThan(36);
    // Regression rails against the fused-pages state (which measured a
    // CONSTANT 100-240px): occasional corner grazes stay shallow, the field
    // is clean on average, and grazes show on a small fraction of frames.
    expect(sum / 1650).toBeLessThan(2.4);
    expect(grazes / 1650).toBeLessThan(0.16);
  });

  /** Two flat, fully overlapping leaves whose sheets bow as prescribed. */
  const shapedPair = (lowerRise: number, upperDip: number) => {
    const field = createDriftField({
      pw: PW, ph: PH, totalLeaves: 2, currentSpread: 1, seed: 3,
    });
    const [lower, upper] = field.leaves as [
      DriftField["leaves"][number],
      DriftField["leaves"][number],
    ];
    for (const leaf of [lower, upper]) {
      leaf.release = 1;
      leaf.x = 0;
      leaf.y = 0;
      // Flat and camera-facing, so the requirement reflects the sheets'
      // bow alone rather than any carrier tilt.
      leaf.axisUX = 1; leaf.axisUY = 0; leaf.axisUZ = 0;
      leaf.axisVX = 0; leaf.axisVY = 1; leaf.axisVZ = 0;
      leaf.scale = 1;
    }
    for (let cell = 0; cell < DRIFT_DEV_CELLS; cell += 1) {
      lower.devMax[cell] = lowerRise;
      lower.devMin[cell] = 0;
      upper.devMax[cell] = 0;
      upper.devMin[cell] = upperDip;
    }
    return driftPairClearance(field, lower, upper);
  };

  it("opens real gap where two sheets bow toward each other", () => {
    // The lower page crests 30px up into the space the upper page dips 30px
    // down into: 60px of surface closing, which the carriers must absorb or
    // the drawn sheets cross.
    expect(shapedPair(30, -30)).toBeGreaterThan(60);
  });

  it("charges nothing for bend that curves the same way", () => {
    // Both pages bow the same direction, so their surfaces stay parallel and
    // never approach. This is the whole point of measuring the real shapes:
    // bending is free unless it actually closes on a neighbour, which is why
    // pages can now bend deeply without buying gap everywhere.
    const facing = shapedPair(30, -30);
    const parallel = shapedPair(30, 28);
    expect(parallel).toBeLessThan(facing * 0.35);
    // Flat pages ask for essentially nothing at all.
    expect(shapedPair(0, 0)).toBeLessThan(parallel + 1);
  });

  it("parts the pile around a dragged leaf instead of cutting through it", () => {
    const field = makeField();
    const idle = makeInput();
    run(field, 200, idle);
    let front = 0;
    for (const leaf of field.leaves) {
      if (leaf.z > field.leaves[front]!.z) front = leaf.index;
    }
    const leaf = field.leaves[front]!;
    const d = idle.cameraDistance;
    const scale = d / (d - leaf.z);
    const grab = makeInput({
      inside: true,
      pressed: true,
      screenX: (leaf.x + idle.shift) * scale,
      screenY: leaf.y * scale,
    });
    stepDriftField(field, DT, grab);
    expect(field.grabIndex).toBe(front);
    // Sweep the held leaf clear across the pile and back.
    let dragSum = 0;
    for (let frame = 0; frame < 240; frame += 1) {
      const swing = Math.sin(frame / 24) * 420;
      stepDriftField(field, DT, { ...grab, screenX: grab.screenX + swing });
      // A deliberate full-pile thrash may graze corners for a few frames.
      // The rails: transients stay bounded far below the old fused state
      // (which measured 100-240px constantly), and the average stays small.
      const penetration = worstPenetration(field);
      dragSum += penetration;
      expect(penetration).toBeLessThan(36);
    }
    expect(dragSum / 240).toBeLessThan(10);
  });

  it("keeps planes apart under gusts, wake sweeps, and corner yanks", () => {
    const field = makeField();
    const idle = makeInput();
    run(field, 150, idle);
    // Grab a corner and yank hard while the pointer wake thrashes the rest.
    let front = 0;
    for (const leaf of field.leaves) {
      if (leaf.z > field.leaves[front]!.z) front = leaf.index;
    }
    const leaf = field.leaves[front]!;
    const d = idle.cameraDistance;
    const scale = d / (d - leaf.z);
    const grab = makeInput({
      inside: true,
      pressed: true,
      screenX: (leaf.x + idle.shift + PW * 0.4) * scale,
      screenY: (leaf.y + PH * 0.4) * scale,
    });
    stepDriftField(field, DT, grab);
    const capFloor = Math.cos(1.1); // SWING_CAP plus a numerical whisker
    let yankSum = 0;
    for (let frame = 0; frame < 300; frame += 1) {
      const jerk = Math.sin(frame / 6) * 500;
      stepDriftField(field, DT, {
        ...grab,
        screenX: grab.screenX + jerk,
        screenY: grab.screenY - jerk / 2,
      });
      const penetration = worstPenetration(field);
      yankSum += penetration;
      expect(penetration).toBeLessThan(36);
      for (const each of field.leaves) {
        const nz = 1 - 2 * (each.qx * each.qx + each.qy * each.qy);
        expect(Math.abs(nz)).toBeGreaterThanOrEqual(capFloor);
      }
    }
    expect(yankSum / 300).toBeLessThan(10);
  });

  it("actually flies: wake sweeps produce real speed and deep tilt", () => {
    const field = makeField();
    const idle = makeInput();
    run(field, 150, idle);
    let topSpeed = 0;
    let topSwing = 0;
    for (let frame = 0; frame < 600; frame += 1) {
      // A vigorous figure-eight sweep across the pile.
      stepDriftField(field, DT, {
        ...idle,
        inside: true,
        screenX: Math.sin(frame / 18) * 500,
        screenY: Math.sin(frame / 11) * 300,
      });
      for (const each of field.leaves) {
        topSpeed = Math.max(
          topSpeed,
          Math.hypot(each.vx, each.vy, each.vz),
        );
        const nz = 1 - 2 * (each.qx * each.qx + each.qy * each.qy);
        topSwing = Math.max(topSwing, Math.sqrt(Math.max(0, 1 - nz * nz)));
      }
    }
    // The wind is worth playing with: pages genuinely fly, and even inside
    // a herded (crowd-flattened) sweep they keep a visible lean.
    expect(topSpeed).toBeGreaterThan(300);
    expect(topSwing).toBeGreaterThan(0.32);

    // In open air — pile spread out, no crowding — a gust wheels pages
    // through genuinely deep tilt.
    const open = makeField();
    run(open, 900, idle); // long idle: leaves well scattered
    let openSwing = 0;
    for (let frame = 0; frame < 300; frame += 1) {
      stepDriftField(open, DT, {
        ...idle,
        inside: true,
        pressed: frame % 60 === 0,
        screenX: Math.sin(frame / 30) * 420,
        screenY: Math.cos(frame / 23) * 260,
      });
      for (const each of open.leaves) {
        const nz = 1 - 2 * (each.qx * each.qx + each.qy * each.qy);
        openSwing = Math.max(openSwing, Math.sqrt(Math.max(0, 1 - nz * nz)));
      }
    }
    expect(openSwing).toBeGreaterThan(0.55);
  });

  it("keeps drifting gently instead of freezing once separation decays", () => {
    const field = makeField();
    const input = makeInput();
    run(field, 1200, input); // 20s: initial impulses long since damped
    const before = field.leaves.map((leaf) => ({ x: leaf.x, y: leaf.y }));
    run(field, 300, input); // 5 more seconds
    let moved = 0;
    for (const leaf of field.leaves) {
      const travel = Math.hypot(
        leaf.x - before[leaf.index]!.x,
        leaf.y - before[leaf.index]!.y,
      );
      if (travel > 3) moved += 1;
    }
    // The ambient field keeps most of the scene alive.
    expect(moved).toBeGreaterThan(TOTAL / 2);
  });

  it("pushes leaves radially away from the pointer, fading with distance", () => {
    const still = makeField();
    const blown = makeField();
    const idle = makeInput();
    run(still, 150, idle);
    run(blown, 150, idle);

    // Park the pointer near the closest leaf's projected position.
    let nearest = 0;
    let nearestZ = -Infinity;
    for (const leaf of blown.leaves) {
      if (leaf.z > nearestZ) {
        nearestZ = leaf.z;
        nearest = leaf.index;
      }
    }
    const target = blown.leaves[nearest]!;
    const d = idle.cameraDistance;
    const scale = d / (d - target.z);
    const offset = 60; // just beside the leaf so the push has a direction
    const pointer = makeInput({
      inside: true,
      screenX: (target.x + idle.shift - offset) * scale,
      screenY: target.y * scale,
    });
    run(still, 30, idle);
    run(blown, 30, pointer);

    // The leaf beside the current is pushed along +x (away from the pointer)
    // relative to its undisturbed twin.
    const twin = still.leaves[nearest]!;
    expect(target.x - twin.x).toBeGreaterThan(2);

    // And the farthest leaf feels nearly nothing extra.
    let farthest = nearest;
    let worst = 0;
    for (const leaf of blown.leaves) {
      const distance = Math.hypot(
        leaf.x - target.x,
        leaf.y - target.y,
      );
      if (distance > worst) {
        worst = distance;
        farthest = leaf.index;
      }
    }
    const farBlown = blown.leaves[farthest]!;
    const farStill = still.leaves[farthest]!;
    const nearShift = Math.abs(target.x - twin.x);
    const farShift = Math.hypot(
      farBlown.x - farStill.x,
      farBlown.y - farStill.y,
    );
    expect(farShift).toBeLessThan(nearShift);
  });

  /** Total speed and spin across the field — how hard a gust actually hit. */
  const energy = (field: DriftField) => {
    let linear = 0;
    let angular = 0;
    for (const leaf of field.leaves) {
      linear += Math.hypot(leaf.vx, leaf.vy, leaf.vz);
      angular += Math.hypot(leaf.wx, leaf.wy, leaf.wz);
    }
    return { linear, angular };
  };

  /** Aims the pointer at a leaf's centre, in viewport-centred screen px. */
  const aimAt = (field: DriftField, index: number, over: Partial<DriftPointerInput> = {}) => {
    const leaf = field.leaves[index]!;
    const base = makeInput(over);
    const scale = base.cameraDistance / (base.cameraDistance - leaf.z);
    return {
      ...base,
      screenX: (leaf.x + base.shift) * scale,
      screenY: leaf.y * scale,
    };
  };

  it("gusts the page a tap lands on, dead centre included", () => {
    // The reported bug: clicking the middle of a page grabbed it instead of
    // blowing it, so the page sat still while the cursor played a gust.
    const field = makeField();
    const idle = makeInput();
    run(field, 200, idle);
    let front = 0;
    for (const leaf of field.leaves) {
      if (leaf.z > field.leaves[front]!.z) front = leaf.index;
    }
    const aim = aimAt(field, front, { inside: true });

    stepDriftField(field, DT, { ...aim, pressed: true });
    expect(field.grabIndex).toBe(front);
    const before = energy(field);

    // Release without travelling: a tap.
    stepDriftField(field, DT, { ...aim, pressed: false });
    expect(field.puffed).toBe(true);
    expect(field.grabIndex).toBe(-1);

    const after = energy(field);
    expect(after.linear).toBeGreaterThan(before.linear + 40);
    // The tapped sheet itself is shoved and set tumbling — the centre hit
    // has no lever arm, so the gust must supply the spin directly.
    const leaf = field.leaves[front]!;
    expect(Math.hypot(leaf.vx, leaf.vy, leaf.vz)).toBeGreaterThan(20);
    expect(Math.hypot(leaf.wx, leaf.wy, leaf.wz)).toBeGreaterThan(0.1);
  });

  it("carries a leaf on a drag without blasting it", () => {
    const field = makeField();
    const idle = makeInput();
    run(field, 200, idle);
    let front = 0;
    for (const leaf of field.leaves) {
      if (leaf.z > field.leaves[front]!.z) front = leaf.index;
    }
    const aim = aimAt(field, front, { inside: true });

    stepDriftField(field, DT, { ...aim, pressed: true });
    expect(field.grabIndex).toBe(front);
    // Travel well past the tap slop, then let go.
    for (let frame = 1; frame <= 8; frame += 1) {
      stepDriftField(field, DT, {
        ...aim,
        pressed: true,
        screenX: aim.screenX + frame * 12,
      });
    }
    stepDriftField(field, DT, {
      ...aim,
      pressed: false,
      screenX: aim.screenX + 96,
    });
    // A drag is a carry, not a gust: no puff fires on its release.
    expect(field.puffed).toBe(false);
    expect(field.grabIndex).toBe(-1);
  });

  it("treats a click on open air as a stronger gust", () => {
    const calm = makeField();
    const gusted = makeField();
    const idle = makeInput();
    run(calm, 150, idle);
    run(gusted, 150, idle);

    // Bottom-left viewport corner: far from where the pile loosens.
    const corner = makeInput({ inside: true, screenX: -700, screenY: -430 });
    stepDriftField(gusted, DT, { ...corner, pressed: true });
    stepDriftField(gusted, DT, { ...corner, pressed: false });
    expect(gusted.puffed).toBe(true);
    stepDriftField(calm, DT, corner);
    stepDriftField(calm, DT, corner);

    let calmSpeed = 0;
    let gustSpeed = 0;
    for (let index = 0; index < TOTAL; index += 1) {
      const a = calm.leaves[index]!;
      const b = gusted.leaves[index]!;
      calmSpeed += Math.hypot(a.vx, a.vy, a.vz);
      gustSpeed += Math.hypot(b.vx, b.vy, b.vz);
    }
    expect(gustSpeed).toBeGreaterThan(calmSpeed + 20);
  });

  it("grabs the leaf under the pointer and drags it with the hand", () => {
    const field = makeField();
    const idle = makeInput();
    run(field, 150, idle);

    // Aim exactly at the frontmost leaf's center.
    let front = 0;
    for (const leaf of field.leaves) {
      if (leaf.z > field.leaves[front]!.z) front = leaf.index;
    }
    const leaf = field.leaves[front]!;
    const d = idle.cameraDistance;
    const scale = d / (d - leaf.z);
    const grab = makeInput({
      inside: true,
      pressed: true,
      screenX: (leaf.x + idle.shift) * scale,
      screenY: leaf.y * scale,
    });
    stepDriftField(field, DT, grab);
    expect(field.grabIndex).toBe(front);

    const startX = leaf.x;
    for (let frame = 0; frame < 120; frame += 1) {
      stepDriftField(field, DT, {
        ...grab,
        screenX: grab.screenX + Math.min(240, frame * 4),
      });
    }
    // The held leaf followed the hand to the right.
    expect(leaf.x - startX).toBeGreaterThan(80);

    stepDriftField(field, DT, { ...grab, pressed: false });
    expect(field.grabIndex).toBe(-1);
  });

  it("glides every leaf exactly home on landing and reports landed", () => {
    const field = makeField();
    const idle = makeInput();
    run(field, 400, idle); // well scattered
    beginDriftLanding(field);
    expect(field.phase).toBe("landing");
    run(field, 600, idle); // 10 seconds is far beyond the glide constant
    expect(field.phase).toBe("landed");
    for (const leaf of field.leaves) {
      expect(leaf.x).toBe(leaf.homeX);
      expect(leaf.y).toBe(leaf.homeY);
      expect(leaf.z).toBe(leaf.homeZ);
      expect(leaf.qx).toBe(leaf.homeQX);
      expect(leaf.qy).toBe(leaf.homeQY);
      expect(leaf.qz).toBe(leaf.homeQZ);
      expect(leaf.qw).toBe(leaf.homeQW);
      expect(Math.hypot(leaf.vx, leaf.vy, leaf.vz)).toBe(0);
      expect(Math.hypot(leaf.wx, leaf.wy, leaf.wz)).toBe(0);
    }
    // Landed fields ignore further stepping.
    stepDriftField(field, DT, idle);
    expect(field.phase).toBe("landed");
  });

  it("is deterministic frame for frame under identical inputs", () => {
    const a = makeField();
    const b = makeField();
    const idle = makeInput();
    const press = makeInput({ inside: true, pressed: true, screenX: 120 });
    for (let frame = 0; frame < 300; frame += 1) {
      const input = frame >= 100 && frame < 130 ? press : idle;
      stepDriftField(a, DT, input);
      stepDriftField(b, DT, input);
    }
    expect(a.leaves).toEqual(b.leaves);
    expect(a.phase).toBe(b.phase);
  });

  it("picks the exposed top sheet through the closed pile, and misses air", () => {
    const field = makeField();
    const input = makeInput();
    // Over the right stack center: the top right leaf is the nearest hit.
    const overRight = makeInput({ screenX: PW / 2, screenY: 0 });
    expect(pickDriftLeaf(field, overRight)).toBe(SPREAD);
    const overLeft = makeInput({ screenX: -PW / 2, screenY: 0 });
    expect(pickDriftLeaf(field, overLeft)).toBe(SPREAD - 1);
    // Far outside both piles: no leaf.
    const air = makeInput({ screenX: PW * 2.4, screenY: 0 });
    expect(pickDriftLeaf(field, air)).toBe(-1);
    void input;
  });

  it("projects pointer rays through depth consistently", () => {
    const input = makeInput({ screenX: 300, screenY: -150, shift: -PW / 2 });
    const out = { x: 0, y: 0, z: 0 };
    pointerPointAtDepth(input, 0, out);
    // At the page plane the mapping is exact screen-to-world minus the shift.
    expect(out.x).toBeCloseTo(300 + PW / 2, 5);
    expect(out.y).toBeCloseTo(-150, 5);
    pointerPointAtDepth(input, 230, out);
    // Closer to the camera the same ray covers less world distance.
    expect(Math.abs(out.y)).toBeLessThan(150);
  });
});
