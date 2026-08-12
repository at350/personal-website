import { describe, expect, it } from "vitest";
import { ShaderLib } from "three";
import {
  injectPaperActivity,
  paperGleamActivity,
  paperTurnActivity,
} from "../src/book3d/paperMaterial";
import { SHEET_REST_ENERGY } from "../src/book3d/settle";

describe("moving paper material", () => {
  it("removes lighting response at both landing frames", () => {
    expect(paperTurnActivity(0)).toBe(0);
    expect(paperTurnActivity(1)).toBe(0);
  });

  it("reaches full glossy response while the leaf is airborne", () => {
    expect(paperTurnActivity(0.5)).toBeCloseTo(1, 6);
  });
});

describe("paper fragment shader injection", () => {
  // three's meshphysical template applies sheen and clearcoat AFTER the base
  // outgoingLight line. If those post-mixes are not gated by paperActivity,
  // a "resting" page still carries ~2% clearcoat dimming plus ungated gloss —
  // the landing frame can never match the unlit stack pixel-for-pixel.
  const patched = injectPaperActivity(ShaderLib.physical.fragmentShader);

  it("replaces the base lighting line with the activity-gated paper model", () => {
    expect(patched).not.toContain(
      "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
    );
    expect(patched).toContain("paperGleam");
  });

  it("gates the sheen and clearcoat post-mixes down to zero at rest", () => {
    expect(patched).not.toContain(
      "outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;",
    );
    expect(patched).toContain(
      "( sheenSpecularDirect + sheenSpecularIndirect ) * paperActivity",
    );
    expect(patched).not.toContain("* material.clearcoat;");
    expect(patched).toContain("material.clearcoat * Fcc * paperActivity");
  });

  it("declares the paperActivity uniform exactly once", () => {
    expect(patched.match(/uniform float paperActivity;/g)).toHaveLength(1);
  });
});

describe("gleam envelope", () => {
  it("is exactly zero once the sheet truly rests on either stack", () => {
    expect(paperGleamActivity(0, 0)).toBe(0);
    expect(paperGleamActivity(1, 0)).toBe(0);
  });

  it("keeps full response mid-flight", () => {
    expect(paperGleamActivity(0.5, 0)).toBeCloseTo(1, 6);
  });

  it("stays alive at nominal completion while the paper still moves", () => {
    // The old sin(π·p) envelope killed the gleam while the under-damped sheet
    // was still visibly waving — the "gleam just disappears" pop.
    expect(paperGleamActivity(0.999, 0.3)).toBeGreaterThan(0.2);
  });

  it("carries zero motion gleam at any energy the settle gate can swap on", () => {
    // The gate completes when sheetEnergy < SHEET_REST_ENERGY. Whatever frame
    // it fires on, the mesh must already match the unlit stack pixel-for-pixel
    // — so the motion term must be exactly zero at and below that threshold.
    for (const energy of [0, SHEET_REST_ENERGY / 2, SHEET_REST_ENERGY]) {
      expect(paperGleamActivity(1, energy)).toBe(0);
      expect(paperGleamActivity(0, energy)).toBe(0);
    }
  });

  it("dies continuously with the motion, not in one step", () => {
    const decay = [0.3, 0.2, 0.12, 0.06, 0.02, 0].map((energy) =>
      paperGleamActivity(1, energy),
    );
    for (let i = 1; i < decay.length; i += 1) {
      expect(decay[i]!).toBeLessThanOrEqual(decay[i - 1]!);
    }
    expect(decay.at(-1)).toBe(0);
    expect(decay[0]!).toBeLessThanOrEqual(0.55);
  });
});
