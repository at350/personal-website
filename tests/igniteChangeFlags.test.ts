import { describe, expect, it } from "vitest";
import {
  BURN_FIXED_STEP,
  createBurnField,
  igniteBurnField,
  stepBurnField,
  writeBurnTexture,
} from "@/ignite/burnField";
import { RESIDUE_YIELD_PER_LAYER, createResidueTextureState, updateResidueTextureState } from "@/ignite/IgniteDebris";

function burning() {
  const field = createBurnField({ width: 16, height: 12, leftLayers: 3, rightLayers: 3, seed: 7 });
  igniteBurnField(field, 0.5, 0.5, 0.2, 1.2);
  return field;
}

describe("writeBurnTexture change flag", () => {
  it("is false on a repeat with no step and true after the field changes", () => {
    const field = burning();
    const bytes = new Uint8Array(field.burn.length * 4);
    for (let i = 0; i < 40; i += 1) stepBurnField(field, BURN_FIXED_STEP);
    expect(writeBurnTexture(field, bytes)).toBe(true);
    expect(writeBurnTexture(field, bytes)).toBe(false);
    for (let i = 0; i < 40; i += 1) stepBurnField(field, BURN_FIXED_STEP);
    expect(writeBurnTexture(field, bytes)).toBe(true);
  });
});

describe("updateResidueTextureState change flag", () => {
  it("is false on a repeat with no step and true after residue grows", () => {
    const field = burning();
    const state = createResidueTextureState(24, 18);
    for (let i = 0; i < 200; i += 1) stepBurnField(field, BURN_FIXED_STEP);
    expect(updateResidueTextureState(state, field)).toBe(true);
    expect(updateResidueTextureState(state, field)).toBe(false);
    // More paper turns to ash.
    for (let i = 0; i < field.residue.length; i += 1) {
      field.residue[i] = (field.capacity[i] ?? 0) * RESIDUE_YIELD_PER_LAYER;
    }
    expect(updateResidueTextureState(state, field)).toBe(true);
    expect(updateResidueTextureState(state, field)).toBe(false);
  });
});
