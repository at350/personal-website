import { afterEach, describe, expect, it, vi } from "vitest";
import { leafSurface } from "../src/book3d/bend";
import { PaperSheet, hypot3 } from "../src/book3d/paperPhysics";
import { PaperSheet as Reference } from "./fixtures/paperPhysicsReference";

/* The solver was rewritten onto typed arrays and must stay bit-identical to
   the frozen original in fixtures/paperPhysicsReference.ts. */

function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

type V = { x: number; y: number; z: number };
function expectSame(a: V[], b: V[], ea: number, eb: number, ctx: string) {
  expect(b.length, ctx).toBe(a.length);
  for (let i = 0; i < a.length; i += 1) {
    for (const k of ["x", "y", "z"] as const) {
      if (!Object.is(a[i]![k], b[i]![k])) {
        throw new Error(`${ctx}: vertex ${i}.${k} ${a[i]![k]} vs ${b[i]![k]}`);
      }
    }
  }
  if (!Object.is(ea, eb)) throw new Error(`${ctx}: energy ${ea} vs ${eb}`);
}

// Each case replays 640 frames through both solvers, and the frozen
// reference is the slow original. On the shared GitHub runner the 594×792
// case took ten seconds, past vitest's five-second default, and took the
// deploy down with it. The budget below is for that runner, not a licence
// for either solver to get slower.
describe("paper solver parity with the pre-optimization reference", { timeout: 60_000 }, () => {
  const sizes: [number, number, number, number][] = [
    [594, 792, 28, 16],
    [300, 400, 5, 3],
  ];

  it.each(sizes)("is bit-identical across turn, drift, reset (%d×%d)", (pw, ph, seg, rows) => {
    const rnd = lcg(987654321 + pw);
    for (let trial = 0; trial < 2; trial += 1) {
      const ref = new Reference(pw, ph, seg, rows);
      const sheet = new PaperSheet(pw, ph, seg, rows);
      let progress = rnd() < 0.5 ? 0 : 1;
      let velocity = 0;
      const grabY = rnd() * 2 - 1;
      const direction = rnd() < 0.5 ? 1 : -1;
      for (let f = 0; f < 320; f += 1) {
        const regime = Math.floor(f / 80) % 4;
        const dt = rnd() < 0.1 ? rnd() * 0.08 : 1 / 60 + (rnd() - 0.5) * 0.004;
        if (f % 111 === 0 && f > 0) {
          const t = leafSurface(rnd(), pw, ph, 0, 0, 1, seg, rows);
          ref.reset(t);
          sheet.reset(t);
        }
        if (regime % 2 === 0) {
          const dragging = f % 80 < 40;
          const target = dragging ? rnd() : direction === 1 ? 1 : 0;
          velocity += (target - progress) * 0.3 - velocity * 0.1;
          progress = Math.min(1, Math.max(0, progress + velocity * 0.05));
          const guide = leafSurface(progress, pw, ph, velocity, grabY, direction as 1 | -1, seg, rows);
          const opts = { dt, dragging, grabY, handleOffsetY: (rnd() - 0.5) * ph * 0.4, velocity };
          const a = ref.step(guide, opts);
          const b = sheet.step(guide, opts);
          expectSame(a, b, ref.motionEnergy(), sheet.motionEnergy(), `turn f=${f}`);
        } else {
          const ang = f * 0.03 + trial;
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          const tilt = Math.sin(f * 0.05) * 0.6;
          const guide: V[] = [];
          for (let row = 0; row <= rows; row += 1) {
            for (let col = 0; col <= seg; col += 1) {
              const lx = -pw / 2 + (col / seg) * pw;
              const ly = (1 - (2 * row) / rows) * (ph / 2);
              guide.push({
                x: lx * c - ly * s + 30 * Math.sin(f * 0.01),
                y: lx * s + ly * c,
                z: lx * tilt * 0.2 + 5,
              });
            }
          }
          const opts = {
            dt,
            windX: (rnd() - 0.5) * 800,
            windY: (rnd() - 0.5) * 800,
            windZ: (rnd() - 0.5) * 800,
            puffX: (rnd() - 0.5) * pw,
            puffY: (rnd() - 0.5) * ph,
            puffZ: rnd() * 50,
            puffStrength: rnd() < 0.3 ? 0 : rnd() * 5000,
            puffRadius: rnd() < 0.1 ? 0.5 : rnd() * pw,
            followRate: 0.9 + rnd() * 3,
            damping: 0.9 + rnd() * 0.09,
            curvatureScale: rnd() < 0.2 ? undefined : rnd(),
            restScale: rnd() < 0.2 ? undefined : 0.8 + rnd() * 0.4,
            flutterX: rnd() < 0.2 ? undefined : (rnd() - 0.5) * 400,
            flutterY: (rnd() - 0.5) * 400,
            flutterZ: (rnd() - 0.5) * 400,
            flutterPhase: rnd() < 0.2 ? undefined : rnd() * 20,
            maxDeviation: rnd() < 0.3 ? undefined : rnd() * 40,
          };
          const a = ref.stepDrift(guide, opts);
          const b = sheet.stepDrift(guide, opts);
          expectSame(a, b, ref.motionEnergy(), sheet.motionEnergy(), `drift f=${f}`);
        }
      }
    }
  });
});

describe("hypot3", () => {
  const same = (x: number, y: number, z: number) =>
    expect(Object.is(hypot3(x, y, z), Math.hypot(x, y, z)), `${x},${y},${z}`).toBe(true);

  it("matches Math.hypot on edge cases", () => {
    const specials = [
      0, -0, NaN, Infinity, -Infinity, 5e-324, -5e-324, 1e-310, 1e308, -1e308,
      1e-300, 1e300, 1, -1, 3, 4, Number.MAX_VALUE, Number.MIN_VALUE,
    ];
    for (const x of specials) {
      for (const y of specials) {
        for (const z of specials) same(x, y, z);
      }
    }
  });

  it("matches Math.hypot on seeded random triples", () => {
    const rnd = lcg(42);
    for (let i = 0; i < 20000; i += 1) {
      const scale = () => 10 ** Math.floor((rnd() - 0.5) * 60);
      same((rnd() - 0.5) * scale(), (rnd() - 0.5) * scale(), (rnd() - 0.5) * scale());
    }
  });
});

describe("solver on an engine whose Math.hypot rounds differently", () => {
  const realHypot = Math.hypot;
  afterEach(() => {
    Math.hypot = realHypot;
    vi.resetModules();
  });

  it("falls back to Math.hypot and matches the reference under the same stub", async () => {
    Math.hypot = (...v: number[]) => Math.sqrt(v.reduce((a, b) => a + b * b, 0));
    vi.resetModules();
    const { PaperSheet: Sheet } = await import("../src/book3d/paperPhysics");
    const [pw, ph, seg, rows] = [200, 280, 8, 5];
    const ref = new Reference(pw, ph, seg, rows);
    const sheet = new Sheet(pw, ph, seg, rows);
    const rnd = lcg(7);
    for (let f = 0; f < 60; f += 1) {
      const dt = 1 / 60;
      if (f < 30) {
        const p = f / 30;
        const guide = leafSurface(p, pw, ph, 1, 0.3, 1, seg, rows);
        const opts = { dt, dragging: f % 2 === 0, grabY: 0.3, handleOffsetY: 10, velocity: 1 };
        expectSame(ref.step(guide, opts), sheet.step(guide, opts), ref.motionEnergy(), sheet.motionEnergy(), `turn f=${f}`);
      } else {
        const guide: V[] = [];
        for (let row = 0; row <= rows; row += 1) {
          for (let col = 0; col <= seg; col += 1) {
            guide.push({ x: -pw / 2 + (col / seg) * pw + f, y: (1 - (2 * row) / rows) * (ph / 2), z: 5 });
          }
        }
        const opts = {
          dt, windX: (rnd() - 0.5) * 800, windY: 100, windZ: 50, puffX: 10, puffY: 10, puffZ: 5,
          puffStrength: 3000, puffRadius: 100, followRate: 1.5, damping: 0.95,
        };
        expectSame(ref.stepDrift(guide, opts), sheet.stepDrift(guide, opts), ref.motionEnergy(), sheet.motionEnergy(), `drift f=${f}`);
      }
    }
  });
});
