import { describe, expect, it } from "vitest";
import {
  BURN_FIXED_STEP,
  createBurnField,
  igniteBurnField,
  stepBurnField,
} from "@/ignite/burnField";
import {
  advanceCombustionFluid,
  COMBUSTION_FIXED_STEP,
  createCombustionFluid,
  stepCombustionFluid,
  writeCombustionRoots,
  writeCombustionTexture,
} from "@/ignite/combustionFluid";

function seedHotPaper(field: ReturnType<typeof createBurnField>) {
  const centreX = Math.floor(field.width * 0.5);
  const centreY = Math.floor(field.height * 0.38);
  for (let y = centreY - 2; y <= centreY + 2; y += 1) {
    for (let x = centreX - 3; x <= centreX + 3; x += 1) {
      const index = y * field.width + x;
      field.heat[index] = 1.08;
      field.surface[index] = 0.27;
      field.burn[index] = 0.12;
      field.surfaceSeed[index] = 1;
    }
  }
  field.ignited = true;
}

function total(source: Float32Array) {
  let sum = 0;
  for (const value of source) sum += value;
  return sum;
}

function verticalCentre(
  width: number,
  source: Float32Array,
) {
  let weighted = 0;
  let mass = 0;
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index] ?? 0;
    weighted += Math.floor(index / width) * value;
    mass += value;
  }
  return mass > 0 ? weighted / mass : 0;
}

function occupiedFraction(
  flame: Float32Array,
  smoke: Float32Array,
) {
  let occupied = 0;
  for (let index = 0; index < flame.length; index += 1) {
    // These are the inverse-space equivalents of the shader's first visible
    // flame/smoke thresholds after its density exponents.
    if ((flame[index] ?? 0) > 0.22 || (smoke[index] ?? 0) > 0.10) occupied += 1;
  }
  return occupied / flame.length;
}

function connectedComponentCount(
  width: number,
  source: Float32Array,
  threshold: number,
) {
  const seen = new Uint8Array(source.length);
  let components = 0;
  for (let start = 0; start < source.length; start += 1) {
    if (seen[start] === 1 || (source[start] ?? 0) <= threshold) continue;
    const stack = [start];
    seen[start] = 1;
    let size = 0;
    while (stack.length > 0) {
      const index = stack.pop()!;
      size += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      for (const neighbour of [index - 1, index + 1, index - width, index + width]) {
        if (
          neighbour < 0 || neighbour >= source.length ||
          seen[neighbour] === 1 || (source[neighbour] ?? 0) <= threshold
        ) continue;
        const neighbourX = neighbour % width;
        const neighbourY = Math.floor(neighbour / width);
        if (Math.abs(neighbourX - x) + Math.abs(neighbourY - y) !== 1) continue;
        seen[neighbour] = 1;
        stack.push(neighbour);
      }
    }
    if (size >= 2) components += 1;
  }
  return components;
}

describe("combustion fluid", () => {
  it("stays empty without a hot paper source", () => {
    const burn = createBurnField({
      width: 24,
      height: 16,
      leftLayers: 1,
      rightLayers: 1,
      seed: 4,
    });
    const fluid = createCombustionFluid(32, 24);

    for (let step = 0; step < 30; step += 1) {
      stepCombustionFluid(fluid, burn);
    }

    expect(total(fluid.flame)).toBe(0);
    expect(total(fluid.smoke)).toBe(0);
    expect(total(fluid.temperature)).toBe(0);
  });

  it("injects a continuous mass and carries it upward after the paper cools", () => {
    const burn = createBurnField({
      width: 32,
      height: 24,
      leftLayers: 2,
      rightLayers: 2,
      seed: 8,
    });
    seedHotPaper(burn);
    const fluid = createCombustionFluid(48, 36);

    for (let step = 0; step < 18; step += 1) {
      stepCombustionFluid(fluid, burn);
    }
    const initialMass = total(fluid.flame) + total(fluid.smoke);
    const initialCentre = verticalCentre(fluid.width, fluid.temperature);

    burn.heat.fill(0);
    for (let step = 0; step < 30; step += 1) {
      stepCombustionFluid(fluid, burn);
    }
    const risenCentre = verticalCentre(fluid.width, fluid.temperature);

    expect(initialMass).toBeGreaterThan(8);
    expect(risenCentre).toBeGreaterThan(initialCentre + 0.45);
    expect(total(fluid.smoke)).toBeGreaterThan(0.1);
  });

  it("keeps mature burned interiors dark and injects only their active rim", () => {
    const burn = createBurnField({
      width: 48,
      height: 36,
      leftLayers: 1,
      rightLayers: 1,
      seed: 23,
    });
    for (let y = 7; y <= 28; y += 1) {
      for (let x = 9; x <= 38; x += 1) {
        const index = y * burn.width + x;
        const rim = x <= 11 || x >= 36 || y <= 9 || y >= 26;
        burn.surface[index] = rim ? 0.27 : 0.78;
        burn.heat[index] = 1.02;
        burn.burn[index] = 0.18;
        burn.surfaceSeed[index] = 1;
      }
    }
    burn.ignited = true;
    const fluid = createCombustionFluid(64, 48);
    stepCombustionFluid(fluid, burn);

    const sourceCells = Array.from(fluid.source).filter((value) => value > 0.01)
      .length;
    expect(sourceCells).toBeGreaterThan(12);
    expect(sourceCells).toBeLessThan(fluid.source.length * 0.09);
  });

  it("maintains a two-cell zero boundary for every advected channel", () => {
    const burn = createBurnField({
      width: 28,
      height: 20,
      leftLayers: 1,
      rightLayers: 1,
      seed: 14,
    });
    seedHotPaper(burn);
    const fluid = createCombustionFluid(40, 30);
    for (let step = 0; step < 90; step += 1) {
      stepCombustionFluid(fluid, burn);
    }

    const channels = [
      fluid.flame,
      fluid.temperature,
      fluid.smoke,
      fluid.velocityX,
      fluid.velocityY,
    ];
    for (const channel of channels) {
      for (let y = 0; y < fluid.height; y += 1) {
        for (let x = 0; x < fluid.width; x += 1) {
          if (
            x < 2 || x >= fluid.width - 2 ||
            y < 2 || y >= fluid.height - 2
          ) {
            expect(channel[y * fluid.width + x]).toBe(0);
          }
        }
      }
    }
  });

  it("keeps visible gas localized during a real three-to-seven second burn", () => {
    const burn = createBurnField({
      width: 96,
      height: 64,
      leftLayers: 2,
      rightLayers: 2,
      seed: 73,
    });
    igniteBurnField(burn, 0.5, 0.52, 0.032, 0.92);
    const fluid = createCombustionFluid(72, 54);
    let atThreeSeconds = 0;
    let atSevenSeconds = 0;
    let peakAfterThree = 0;
    for (let frame = 1; frame <= 7 / BURN_FIXED_STEP; frame += 1) {
      stepBurnField(burn, BURN_FIXED_STEP);
      stepCombustionFluid(fluid, burn, BURN_FIXED_STEP);
      if (frame === Math.round(3 / BURN_FIXED_STEP)) {
        atThreeSeconds = occupiedFraction(fluid.flame, fluid.smoke);
      }
      if (frame === Math.round(7 / BURN_FIXED_STEP)) {
        atSevenSeconds = occupiedFraction(fluid.flame, fluid.smoke);
      }
      if (frame >= Math.round(3 / BURN_FIXED_STEP)) {
        peakAfterThree = Math.max(
          peakAfterThree,
          occupiedFraction(fluid.flame, fluid.smoke),
        );
      }
    }

    expect(atThreeSeconds).toBeGreaterThan(0.005);
    // The bound tracks the intentionally hotter flame injection (stronger
    // yellow cores); gas must still cover well under a quarter of the domain.
    expect(atThreeSeconds).toBeLessThan(0.235);
    expect(atSevenSeconds).toBeLessThan(0.28);
    expect(peakAfterThree).toBeGreaterThan(0.005);
    expect(peakAfterThree).toBeLessThan(0.28);
  });

  it("builds visible attached gas during the first two seconds after catch", () => {
    const burn = createBurnField({
      width: 96,
      height: 64,
      leftLayers: 2,
      rightLayers: 2,
      seed: 73,
    });
    igniteBurnField(burn, 0.5, 0.52, 0.032, 0.92);
    const fluid = createCombustionFluid(72, 54);
    let atOneSecond = 0;
    let atTwoSeconds = 0;
    let maxFlameAtOneSecond = 0;
    let maxHeatAtOneSecond = 0;
    let maxFlameAtTwoSeconds = 0;
    let maxHeatAtTwoSeconds = 0;
    let packedMaxAtOneSecond = 0;
    let packedMaxAtTwoSeconds = 0;
    let sourceLobesAtOneSecond = 0;
    let sourceCoverageAtOneSecond = 0;
    let riseAtOneSecond = 0;
    for (let frame = 1; frame <= 2 / BURN_FIXED_STEP; frame += 1) {
      stepBurnField(burn, BURN_FIXED_STEP);
      stepCombustionFluid(fluid, burn, BURN_FIXED_STEP);
      if (frame === Math.round(1 / BURN_FIXED_STEP)) {
        atOneSecond = occupiedFraction(fluid.flame, fluid.smoke);
        maxFlameAtOneSecond = Math.max(...fluid.flame);
        maxHeatAtOneSecond = Math.max(...fluid.temperature);
        const bytes = new Uint8Array(fluid.flame.length * 4);
        writeCombustionTexture(fluid, bytes);
        packedMaxAtOneSecond = Math.max(
          ...bytes.filter((_, index) => index % 4 === 0),
        );
        sourceLobesAtOneSecond = connectedComponentCount(
          fluid.width,
          fluid.source,
          0.08,
        );
        sourceCoverageAtOneSecond = Array.from(fluid.source).filter(
          (value) => value > 0.08,
        ).length / fluid.source.length;
        riseAtOneSecond = verticalCentre(fluid.width, fluid.flame) -
          verticalCentre(fluid.width, fluid.source);
      }
      if (frame === Math.round(2 / BURN_FIXED_STEP)) {
        atTwoSeconds = occupiedFraction(fluid.flame, fluid.smoke);
        maxFlameAtTwoSeconds = Math.max(...fluid.flame);
        maxHeatAtTwoSeconds = Math.max(...fluid.temperature);
        const bytes = new Uint8Array(fluid.flame.length * 4);
        writeCombustionTexture(fluid, bytes);
        packedMaxAtTwoSeconds = Math.max(
          ...bytes.filter((_, index) => index % 4 === 0),
        );
      }
    }

    expect(atOneSecond).toBeGreaterThan(0.004);
    expect(atOneSecond).toBeLessThan(0.12);
    expect(atTwoSeconds).toBeGreaterThan(0.008);
    expect(atTwoSeconds).toBeLessThan(0.18);
    expect(maxFlameAtOneSecond).toBeGreaterThan(0.6);
    expect(maxHeatAtOneSecond).toBeGreaterThan(0.6);
    expect(maxFlameAtTwoSeconds).toBeGreaterThan(0.6);
    expect(maxHeatAtTwoSeconds).toBeGreaterThan(0.6);
    expect(packedMaxAtOneSecond).toBeGreaterThan(150);
    expect(packedMaxAtTwoSeconds).toBeGreaterThan(150);
    expect(sourceLobesAtOneSecond).toBeGreaterThanOrEqual(2);
    expect(sourceLobesAtOneSecond).toBeLessThanOrEqual(5);
    expect(sourceCoverageAtOneSecond).toBeLessThan(0.04);
    expect(riseAtOneSecond).toBeGreaterThan(0.7);
  });

  it("selects a small deterministic set of separated hot-front roots", () => {
    const burn = createBurnField({
      width: 96,
      height: 64,
      leftLayers: 2,
      rightLayers: 2,
      seed: 73,
    });
    igniteBurnField(burn, 0.5, 0.52, 0.032, 0.92);
    const fluid = createCombustionFluid(72, 54);
    for (let frame = 0; frame < 1 / BURN_FIXED_STEP; frame += 1) {
      stepBurnField(burn, BURN_FIXED_STEP);
      stepCombustionFluid(fluid, burn, BURN_FIXED_STEP);
    }

    const first = {
      uv: new Float32Array(12),
      strength: new Float32Array(6),
      flow: new Float32Array(6),
      tangent: new Float32Array(12),
    };
    const second = {
      uv: new Float32Array(12),
      strength: new Float32Array(6),
      flow: new Float32Array(6),
      tangent: new Float32Array(12),
    };
    const firstCount = writeCombustionRoots(fluid, first, 6);
    const secondCount = writeCombustionRoots(fluid, second, 6);

    expect(firstCount).toBeGreaterThanOrEqual(3);
    expect(firstCount).toBeLessThanOrEqual(6);
    expect(secondCount).toBe(firstCount);
    expect(Array.from(second.uv)).toEqual(Array.from(first.uv));
    expect(Array.from(second.strength)).toEqual(Array.from(first.strength));
    expect(Array.from(second.flow)).toEqual(Array.from(first.flow));
    expect(Array.from(second.tangent)).toEqual(Array.from(first.tangent));
    for (let root = 0; root < firstCount; root += 1) {
      const x = (first.uv[root * 2] ?? 0) * fluid.width - .5;
      const y = (first.uv[root * 2 + 1] ?? 0) * fluid.height - .5;
      const sourceIndex = Math.round(y) * fluid.width + Math.round(x);
      // Roots must sit on live fuel; the candidate gate admits cells from
      // .035 upward, and faster intermittency legitimately picks some of
      // those quieter-instant cells.
      expect(fluid.source[sourceIndex]).toBeGreaterThan(.03);
      expect(first.strength[root]).toBeGreaterThan(0);
      expect(Math.abs(first.flow[root] ?? 0)).toBeLessThanOrEqual(1);
      expect(Math.hypot(
        first.tangent[root * 2] ?? 0,
        first.tangent[root * 2 + 1] ?? 0,
      )).toBeCloseTo(1, 4);
      for (let prior = 0; prior < root; prior += 1) {
        const priorX = (first.uv[prior * 2] ?? 0) * fluid.width - .5;
        const priorY = (first.uv[prior * 2 + 1] ?? 0) * fluid.height - .5;
        expect(Math.hypot(x - priorX, y - priorY)).toBeGreaterThanOrEqual(3.45);
      }
    }
  });

  it("distributes enough roots along a long mature frontier", () => {
    // Three isolated roots left most of a long contour visibly cold; a
    // mature frontier must expose several separated, span-annotated sources.
    const burn = createBurnField({
      width: 96,
      height: 64,
      leftLayers: 2,
      rightLayers: 2,
      seed: 73,
    });
    igniteBurnField(burn, 0.5, 0.52, 0.032, 0.92);
    const fluid = createCombustionFluid(72, 54);
    for (let frame = 0; frame < 3 / BURN_FIXED_STEP; frame += 1) {
      stepBurnField(burn, BURN_FIXED_STEP);
      stepCombustionFluid(fluid, burn, BURN_FIXED_STEP);
    }

    const targets = {
      uv: new Float32Array(14),
      strength: new Float32Array(7),
      flow: new Float32Array(7),
      tangent: new Float32Array(14),
      span: new Float32Array(7),
    };
    const count = writeCombustionRoots(fluid, targets, 7, burn);
    expect(count).toBeGreaterThanOrEqual(4);

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let root = 0; root < count; root += 1) {
      const x = (targets.uv[root * 2] ?? 0) * fluid.width;
      const y = (targets.uv[root * 2 + 1] ?? 0) * fluid.height;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    // The selected roots wrap a substantial part of the ring instead of
    // crowding one hot corner.
    expect(Math.max(maxX - minX, maxY - minY)).toBeGreaterThan(
      fluid.width * 0.16,
    );
    expect(
      Math.max(...Array.from(targets.span.subarray(0, count))),
    ).toBeGreaterThan(0);
  });

  it("uses fixed steps so equivalent frame schedules remain deterministic", () => {
    const firstBurn = createBurnField({
      width: 28,
      height: 20,
      leftLayers: 1,
      rightLayers: 1,
      seed: 12,
    });
    const secondBurn = createBurnField({
      width: 28,
      height: 20,
      leftLayers: 1,
      rightLayers: 1,
      seed: 12,
    });
    seedHotPaper(firstBurn);
    seedHotPaper(secondBurn);
    const first = createCombustionFluid(40, 30);
    const second = createCombustionFluid(40, 30);
    let firstAccumulator = 0;
    let secondAccumulator = 0;
    let firstSteps = 0;
    let secondSteps = 0;

    for (let frame = 0; frame < 60; frame += 1) {
      const result = advanceCombustionFluid(
        first,
        firstBurn,
        COMBUSTION_FIXED_STEP / 2,
        firstAccumulator,
      );
      firstAccumulator = result.accumulator;
      firstSteps += result.steps;
    }
    for (let frame = 0; frame < 30; frame += 1) {
      const result = advanceCombustionFluid(
        second,
        secondBurn,
        COMBUSTION_FIXED_STEP,
        secondAccumulator,
      );
      secondAccumulator = result.accumulator;
      secondSteps += result.steps;
    }

    expect(firstSteps).toBe(secondSteps);
    expect(Array.from(first.flame)).toEqual(Array.from(second.flame));
    expect(Array.from(first.smoke)).toEqual(Array.from(second.smoke));
    expect(Array.from(first.velocityY)).toEqual(Array.from(second.velocityY));
  });

  it("packs smooth gas channels into an RGBA texture", () => {
    const burn = createBurnField({
      width: 20,
      height: 16,
      leftLayers: 1,
      rightLayers: 1,
      seed: 18,
    });
    seedHotPaper(burn);
    const fluid = createCombustionFluid(24, 20);
    for (let step = 0; step < 12; step += 1) {
      stepCombustionFluid(fluid, burn);
    }
    const bytes = new Uint8Array(fluid.flame.length * 4);
    writeCombustionTexture(fluid, bytes);

    expect(Math.max(...bytes.filter((_, index) => index % 4 === 0))).toBeGreaterThan(0);
    const packedSourceMaximum = Math.max(
      ...bytes.filter((_, index) => index % 4 === 3),
    );
    expect(packedSourceMaximum).toBe(
      Math.round(Math.min(1, Math.max(...fluid.source)) * 255),
    );
    expect(Math.min(...bytes.filter((_, index) => index % 4 === 3))).toBe(0);
    expect(() => writeCombustionTexture(fluid, new Uint8Array(4))).toThrow(
      "wrong size",
    );
  });
});
