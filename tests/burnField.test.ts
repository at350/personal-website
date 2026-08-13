import { describe, expect, it } from "vitest";
import {
  BURN_FIXED_STEP,
  advanceBurnField,
  burnProgress,
  createBurnField,
  igniteBurnField,
  sampleResidueCell,
  stepBurnField,
  writeBurnTexture,
  upsampleBurnTexture,
} from "@/ignite/burnField";

function run(field: ReturnType<typeof createBurnField>, frames: number) {
  for (let frame = 0; frame < frames; frame += 1) {
    stepBurnField(field, BURN_FIXED_STEP);
  }
}

function fractionAtLeast(source: Float32Array, threshold: number) {
  let matching = 0;
  for (const value of source) {
    if (value >= threshold) matching += 1;
  }
  return matching / source.length;
}

describe("burn field", () => {
  it("starts pristine and respects missing paper on either side", () => {
    const field = createBurnField({
      width: 12,
      height: 8,
      leftLayers: 0,
      rightLayers: 4,
      seed: 42,
    });

    expect(field.ignited).toBe(false);
    expect(field.complete).toBe(false);
    expect(burnProgress(field)).toBe(0);
    expect(Array.from(field.capacity.slice(0, 6))).toEqual(
      Array.from({ length: 6 }, () => 0),
    );
    expect(Array.from(field.capacity.slice(6, 12))).toEqual(
      Array.from({ length: 6 }, () => 4),
    );
    expect(igniteBurnField(field, 0.2, 0.5)).toBe(false);
    expect(field.ignited).toBe(false);
    expect(igniteBurnField(field, 0.78, 0.5)).toBe(true);
    expect(field.ignited).toBe(true);
  });

  it("burns monotonically and propagates beyond the ignition footprint", () => {
    const field = createBurnField({
      width: 48,
      height: 32,
      leftLayers: 3,
      rightLayers: 3,
      seed: 7,
    });
    igniteBurnField(field, 0.5, 0.52, 0.035, 1.2);
    let previous = burnProgress(field);
    let peakHeatedCells = 0;

    for (let batch = 0; batch < 22; batch += 1) {
      run(field, 30);
      const next = burnProgress(field);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
      peakHeatedCells = Math.max(
        peakHeatedCells,
        Array.from(field.heat).filter((value) => value > 0.2).length,
      );
    }

    // A completed field cools back to zero, so retain the peak while it burns.
    expect(peakHeatedCells).toBeGreaterThan(120);
    expect(burnProgress(field)).toBeGreaterThan(0.05);
  });

  it("catches the exposed sheet quickly regardless of stack depth", () => {
    const catchFrames = [1, 5, 10].map((layers) => {
      const field = createBurnField({
        width: 48,
        height: 32,
        leftLayers: layers,
        rightLayers: layers,
        seed: 73,
      });
      igniteBurnField(field, 0.5, 0.52, 0.035, 0.92);
      expect(field.ignited).toBe(true);
      expect(field.caught).toBe(false);

      let frame = 0;
      while (!field.caught && frame < 60) {
        stepBurnField(field, BURN_FIXED_STEP);
        frame += 1;
      }

      expect(field.complete).toBe(false);
      expect(Math.max(...field.burn)).toBeLessThan(0.2);
      return frame;
    });

    // Six to thirteen 30 Hz steps is 0.20-0.43 s: thin paper catches visibly
    // without opening a hole on the very first animation frame.
    expect(Math.min(...catchFrames)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...catchFrames)).toBeLessThanOrEqual(13);
    expect(Math.max(...catchFrames) - Math.min(...catchFrames)).toBeLessThanOrEqual(2);
  });

  it("keeps fast surface topology independent from gradual stack fuel", () => {
    const fields = [1, 5, 10].map((layers) => {
      const field = createBurnField({
        width: 48,
        height: 32,
        leftLayers: layers,
        rightLayers: layers,
        seed: 73,
      });
      igniteBurnField(field, 0.5, 0.52, 0.035, 0.92);
      run(field, 36);
      return field;
    });

    const surfacePeaks = fields.map((field) => Math.max(...field.surface));
    expect(Math.min(...surfacePeaks)).toBeGreaterThan(0.45);
    expect(Math.max(...surfacePeaks)).toBeLessThan(0.72);
    expect(Math.max(...surfacePeaks) - Math.min(...surfacePeaks)).toBeLessThan(
      0.001,
    );
    expect(Math.max(...fields[2]!.burn)).toBeLessThan(0.6);
    expect(burnProgress(fields[2]!)).toBeLessThan(0.04);
  });

  it("meets real-time paper ignition and spread targets at production resolution", () => {
    const field = createBurnField({
      width: 192,
      height: 128,
      leftLayers: 1,
      rightLayers: 1,
      seed: 73,
    });
    igniteBurnField(field, 0.5, 0.52, 0.032, 0.92);

    let caughtAt = 0;
    let firstHoleAt = 0;
    let nearlyOpenAt = 0;
    let visibleAtThreeSeconds = 0;

    for (let frame = 1; frame <= 18 / BURN_FIXED_STEP; frame += 1) {
      stepBurnField(field, BURN_FIXED_STEP);
      const elapsed = frame * BURN_FIXED_STEP;
      if (caughtAt === 0 && field.caught) caughtAt = elapsed;
      if (firstHoleAt === 0 && Math.max(...field.surface) >= 0.31) {
        firstHoleAt = elapsed;
      }
      if (frame === Math.round(3 / BURN_FIXED_STEP)) {
        // 0.08 is the first clearly visible scorch/char response; perforation
        // follows behind it instead of popping the same area away at once.
        visibleAtThreeSeconds = fractionAtLeast(field.surface, 0.08);
      }
      if (nearlyOpenAt === 0 && fractionAtLeast(field.surface, 0.31) >= 0.995) {
        nearlyOpenAt = elapsed;
      }
    }

    expect(caughtAt).toBeGreaterThanOrEqual(0.2);
    expect(caughtAt).toBeLessThanOrEqual(0.45);
    expect(firstHoleAt).toBeGreaterThanOrEqual(0.7);
    expect(firstHoleAt).toBeLessThanOrEqual(1.2);
    expect(visibleAtThreeSeconds).toBeGreaterThanOrEqual(0.15);
    expect(visibleAtThreeSeconds).toBeLessThanOrEqual(0.25);
    expect(nearlyOpenAt).toBeGreaterThanOrEqual(10);
    expect(nearlyOpenAt).toBeLessThanOrEqual(18);
  });

  it("uses coherent paper resistance instead of cell-scale white noise", () => {
    const field = createBurnField({
      width: 72,
      height: 48,
      leftLayers: 2,
      rightLayers: 2,
      seed: 118,
    });
    let neighbourDelta = 0;
    let samples = 0;
    for (let y = 0; y < field.height; y += 1) {
      for (let x = 1; x < field.width; x += 1) {
        const index = y * field.width + x;
        neighbourDelta += Math.abs(
          (field.grain[index] ?? 0) - (field.grain[index - 1] ?? 0),
        );
        samples += 1;
      }
    }

    expect(neighbourDelta / samples).toBeLessThan(0.03);
    expect(Math.max(...field.grain) - Math.min(...field.grain)).toBeGreaterThan(
      0.25,
    );
  });

  it("only ignites cells connected to the previous local burn front", () => {
    const field = createBurnField({
      width: 64,
      height: 40,
      leftLayers: 1,
      rightLayers: 1,
      seed: 21,
    });
    igniteBurnField(field, 0.19, 0.52, 0.035, 1.2);
    for (let frame = 0; frame < 210; frame += 1) {
      const prior = field.burn.slice();
      stepBurnField(field, BURN_FIXED_STEP);
      for (let index = 0; index < field.burn.length; index += 1) {
        if ((prior[index] ?? 0) > 0.001 || (field.burn[index] ?? 0) <= 0.001) {
          continue;
        }
        const x = index % field.width;
        const y = Math.floor(index / field.width);
        const neighbours = [];
        if (x > 0) neighbours.push(index - 1);
        if (x + 1 < field.width) neighbours.push(index + 1);
        if (y > 0) neighbours.push(index - field.width);
        if (y + 1 < field.height) neighbours.push(index + field.width);
        expect(neighbours.some((neighbour) => (prior[neighbour] ?? 0) > 0.001))
          .toBe(true);
      }
    }
  });

  it("is deterministic for a seed and reaches a stable all-ash state", () => {
    const create = () =>
      createBurnField({
        width: 26,
        height: 18,
        leftLayers: 1,
        rightLayers: 1,
        seed: 91,
      });
    const first = create();
    const second = create();
    igniteBurnField(first, 0.5, 0.55, 0.09, 1.35);
    igniteBurnField(second, 0.5, 0.55, 0.09, 1.35);

    for (let frame = 0; frame < 9_000 && !first.complete; frame += 1) {
      stepBurnField(first);
      stepBurnField(second);
    }

    expect(first.complete).toBe(true);
    expect(burnProgress(first)).toBeGreaterThan(0.998);
    expect(Array.from(first.burn)).toEqual(Array.from(second.burn));
    expect(Array.from(first.heat)).toEqual(Array.from(second.heat));
    expect(Array.from(first.residue)).toEqual(Array.from(second.residue));

    const settledBurn = Array.from(first.burn);
    run(first, 60);
    expect(Array.from(first.burn)).toEqual(settledBurn);
  });

  it("finishes without snapping a visible final fraction to ash", () => {
    const field = createBurnField({
      width: 26,
      height: 18,
      leftLayers: 1,
      rightLayers: 1,
      seed: 91,
    });
    igniteBurnField(field, 0.5, 0.55, 0.09, 1.35);
    let maximumCellDelta = 0;
    let progressBeforeCompletion = 0;

    for (let frame = 0; frame < 12_000 && !field.complete; frame += 1) {
      const prior = field.burn.slice();
      progressBeforeCompletion = burnProgress(field);
      stepBurnField(field);
      for (let index = 0; index < field.burn.length; index += 1) {
        maximumCellDelta = Math.max(
          maximumCellDelta,
          (field.burn[index] ?? 0) - (prior[index] ?? 0),
        );
      }
    }

    expect(field.complete).toBe(true);
    expect(progressBeforeCompletion).toBeGreaterThan(0.9999);
    expect(maximumCellDelta).toBeLessThan(0.016);
  });

  it("produces identical state through fixed-step accumulation", () => {
    const create = () =>
      createBurnField({
        width: 42,
        height: 28,
        leftLayers: 3,
        rightLayers: 3,
        seed: 119,
      });
    const direct = create();
    const accumulated = create();
    igniteBurnField(direct, 0.43, 0.57, 0.04, 1.1);
    igniteBurnField(accumulated, 0.43, 0.57, 0.04, 1.1);

    run(direct, 180);
    let accumulator = 0;
    let steps = 0;
    for (let tick = 0; tick < 360; tick += 1) {
      const advanced = advanceBurnField(
        accumulated,
        BURN_FIXED_STEP / 2,
        accumulator,
      );
      accumulator = advanced.accumulator;
      steps += advanced.steps;
    }

    expect(steps).toBe(180);
    expect(Array.from(accumulated.burn)).toEqual(Array.from(direct.burn));
    expect(Array.from(accumulated.heat)).toEqual(Array.from(direct.heat));
    expect(Array.from(accumulated.surface)).toEqual(Array.from(direct.surface));
    expect(Array.from(accumulated.residue)).toEqual(Array.from(direct.residue));
  });

  it("conserves only sparse ash residue as paper mass is consumed", () => {
    const field = createBurnField({
      width: 32,
      height: 22,
      leftLayers: 2,
      rightLayers: 2,
      seed: 44,
    });
    igniteBurnField(field, 0.5, 0.5, 0.08, 1.3);
    run(field, 1_500);

    const residueMass = Array.from(field.residue).reduce(
      (total, value) => total + value,
      0,
    );
    expect(residueMass).toBeGreaterThan(0);
    expect(residueMass).toBeLessThan(field.burnedFuel * 0.11);
    for (let index = 0; index < field.residue.length; index += 1) {
      expect(field.residue[index] ?? 0).toBeLessThanOrEqual(
        (field.capacity[index] ?? 0) * 0.13 + 1e-6,
      );
    }
  });

  it("samples settled ash only from residue-bearing paper cells", () => {
    const field = createBurnField({
      width: 32,
      height: 22,
      leftLayers: 0,
      rightLayers: 2,
      seed: 44,
    });
    expect(sampleResidueCell(field, 0.5)).toBeNull();

    igniteBurnField(field, 0.76, 0.5, 0.08, 1.3);
    run(field, 240);
    const cell = sampleResidueCell(field, 0.37);

    expect(cell).not.toBeNull();
    expect(cell?.u).toBeGreaterThan(0.5);
    expect(cell?.u).toBeLessThanOrEqual(1);
    expect(cell?.v).toBeGreaterThan(0);
    expect(cell?.v).toBeLessThan(1);
    expect(cell?.capacity).toBe(2);
    expect(cell?.residue).toBeGreaterThan(0);
    expect(sampleResidueCell(field, 0.37)).toEqual(cell);
  });

  it("uses a bounded fixed-step accumulator for irregular frame times", () => {
    const field = createBurnField({
      width: 20,
      height: 12,
      leftLayers: 2,
      rightLayers: 2,
      seed: 3,
    });
    igniteBurnField(field, 0.5, 0.5);

    const advanced = advanceBurnField(field, 2, 0.02);
    expect(advanced.steps).toBe(4);
    expect(advanced.accumulator).toBeLessThan(BURN_FIXED_STEP);
  });

  it("packs burn state into RGBA texture bytes", () => {
    const field = createBurnField({
      width: 4,
      height: 3,
      leftLayers: 2,
      rightLayers: 5,
      seed: 5,
    });
    const bytes = new Uint8Array(field.burn.length * 4);
    igniteBurnField(field, 0.75, 0.5, 0.2, 1.2);
    run(field, 30);
    writeBurnTexture(field, bytes);

    expect(bytes).toHaveLength(48);
    expect(bytes.some((value, index) => index % 4 === 1 && value > 0)).toBe(true);
    expect(bytes.some((value, index) => index % 4 === 2 && value > 0)).toBe(true);
    expect(bytes[3]).toBe(Math.round((2 / 5) * 255));
    expect(bytes.at(-1)).toBe(255);
  });

  it("packs exact physical layer depth instead of estimating it from ash", () => {
    const field = createBurnField({
      width: 4,
      height: 3,
      leftLayers: 5,
      rightLayers: 5,
      seed: 5,
    });
    field.burn.fill(2.25);
    // Deliberately unrelated residue proves B is physical fuel depth.
    field.residue.fill(0.01);
    const bytes = new Uint8Array(field.burn.length * 4);
    writeBurnTexture(field, bytes);

    for (let index = 0; index < field.burn.length; index += 1) {
      expect(bytes[index * 4 + 2]).toBe(Math.round((2.25 / 5) * 255));
      expect(bytes[index * 4 + 3]).toBe(255);
    }
  });

  it("packs an edge-preserving surface mask for sub-pixel reconstruction", () => {
    const field = createBurnField({
      width: 6,
      height: 4,
      leftLayers: 2,
      rightLayers: 2,
      seed: 9,
    });
    for (let y = 0; y < field.height; y += 1) {
      for (let x = 3; x < field.width; x += 1) {
        field.surface[y * field.width + x] = 1;
      }
    }
    const bytes = new Uint8Array(field.surface.length * 4);
    writeBurnTexture(field, bytes);

    const row = 2;
    const intactBoundary = bytes[(row * field.width + 2) * 4] ?? 255;
    const openBoundary = bytes[(row * field.width + 3) * 4] ?? 0;
    expect(intactBoundary).toBeLessThan(32);
    expect(openBoundary).toBeGreaterThan(223);
  });

  it("upsamples the visual mask smoothly without crossing the magazine spine", () => {
    const source = new Uint8Array(4 * 2 * 4);
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const offset = (y * 4 + x) * 4;
        source[offset] = x < 2 ? x * 180 : 240;
        source[offset + 3] = x < 2 ? 64 : 255;
      }
    }
    const target = new Uint8Array(8 * 4 * 4);
    upsampleBurnTexture(source, 4, 2, target, 8, 4);

    const leftValues = [0, 1, 2, 3].map((x) => target[(2 * 8 + x) * 4]);
    expect(leftValues[0]).toBeLessThan(leftValues[2] ?? 0);
    expect(leftValues[1]).toBeGreaterThan(0);
    expect(leftValues[2]).toBeLessThan(180);
    // The right side remains its own constant stack instead of borrowing the
    // left edge's lower values across x=.5.
    for (let x = 4; x < 8; x += 1) {
      expect(target[(2 * 8 + x) * 4]).toBe(240);
      expect(target[(2 * 8 + x) * 4 + 3]).toBe(255);
    }
  });
});
