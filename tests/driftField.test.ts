import { describe, expect, it } from "vitest";
import {
  DRIFT_LAYER_GAP,
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
      // Each leaf has visibly departed its slot in the pile.
      expect(homeDistance(field, leaf.index)).toBeGreaterThan(15);
      // And floated forward, off the stack plane, toward the camera.
      expect(leaf.z).toBeGreaterThan(field.leaves[leaf.index]!.homeZ);
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
      expect(leaf.z).toBeGreaterThan(-40);
      expect(leaf.z).toBeLessThan(PH * 0.7 + 60);
    }
  });

  it("keeps every sheet wobbling near camera-facing instead of knifing", () => {
    const field = makeField();
    run(field, 1800, makeInput()); // 30 seconds: alignment fully settled
    for (const leaf of field.leaves) {
      // Rotate the local normal (0,0,1) by the leaf quaternion; the z
      // component is the cosine of the tilt off the viewing axis.
      const nz =
        1 - 2 * (leaf.qx * leaf.qx + leaf.qy * leaf.qy);
      expect(Math.abs(nz)).toBeGreaterThan(0.85);
    }
  });

  /** Worst pairwise depth deficit among leaves whose footprints overlap on
      screen: positive means every overlapping pair holds real clearance. */
  const worstOverlapClearance = (field: DriftField) => {
    let worst = Infinity;
    for (let i = 0; i < field.leaves.length; i += 1) {
      for (let j = i + 1; j < field.leaves.length; j += 1) {
        const a = field.leaves[i]!;
        const b = field.leaves[j]!;
        const ox = (b.x - a.x) / (PW * 0.9);
        const oy = (b.y - a.y) / (PH * 0.85);
        if (ox * ox + oy * oy >= 1) continue;
        worst = Math.min(worst, Math.abs(b.z - a.z));
      }
    }
    return worst;
  };

  it("guarantees depth clearance between leaves that overlap on screen", () => {
    const field = makeField();
    const input = makeInput();
    run(field, 150, input); // fully adrift
    // The hard projection must hold from the moment the pile is loose,
    // through every frame of a long unattended drift.
    for (let frame = 0; frame < 1650; frame += 1) {
      stepDriftField(field, DT, input);
      expect(worstOverlapClearance(field)).toBeGreaterThan(30);
    }
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
    for (let frame = 0; frame < 240; frame += 1) {
      const swing = Math.sin(frame / 24) * 420;
      stepDriftField(field, DT, { ...grab, screenX: grab.screenX + swing });
      expect(worstOverlapClearance(field)).toBeGreaterThan(24);
    }
  });

  it("caps out-of-plane tilt so no sheet can knife its neighbours", () => {
    const field = makeField();
    const idle = makeInput();
    run(field, 150, idle);
    // Grab a corner and yank hard — grab torque is the strongest tilt
    // source in the field.
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
    const capFloor = Math.cos(0.34); // SWING_CAP plus a numerical whisker
    for (let frame = 0; frame < 300; frame += 1) {
      const jerk = Math.sin(frame / 6) * 500;
      stepDriftField(field, DT, {
        ...grab,
        screenX: grab.screenX + jerk,
        screenY: grab.screenY - jerk / 2,
      });
      for (const each of field.leaves) {
        const nz = 1 - 2 * (each.qx * each.qx + each.qy * each.qy);
        expect(Math.abs(nz)).toBeGreaterThanOrEqual(capFloor);
      }
    }
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

  it("treats a click on open air as a stronger gust", () => {
    const calm = makeField();
    const gusted = makeField();
    const idle = makeInput();
    run(calm, 150, idle);
    run(gusted, 150, idle);

    // Bottom-left viewport corner: far from where the pile loosens.
    const corner = makeInput({ inside: true, screenX: -700, screenY: -430 });
    stepDriftField(gusted, DT, { ...corner, pressed: true });
    expect(gusted.puffed).toBe(true);
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
