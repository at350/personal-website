import { describe, expect, it } from "vitest";
import { ShaderLib } from "three";
import {
  fadeSettlingActivity,
  injectPaperActivity,
  PAPER_BASE_RESPONSE,
  paperGleamActivity,
  paperOpticalResponse,
  paperTurnActivity,
} from "../src/book3d/paperMaterial";
import { SETTLE_HOLD_MAX, SHEET_REST_ENERGY } from "../src/book3d/settle";

describe("moving paper material", () => {
  it("keeps the same low optical response at both landing frames", () => {
    expect(paperTurnActivity(0)).toBe(0);
    expect(paperTurnActivity(1)).toBe(0);
    expect(paperOpticalResponse(paperTurnActivity(0))).toBe(PAPER_BASE_RESPONSE);
    expect(paperOpticalResponse(paperTurnActivity(1))).toBe(PAPER_BASE_RESPONSE);
    expect(paperOpticalResponse(1)).toBe(1);
  });

  it("reaches full glossy response while the leaf is airborne", () => {
    expect(paperTurnActivity(0.5)).toBeCloseTo(1, 6);
  });

  it("eases the turn boost symmetrically without an endpoint jump", () => {
    expect(paperTurnActivity(0.2)).toBeCloseTo(paperTurnActivity(0.8), 6);
    expect(paperTurnActivity(0.001) - paperTurnActivity(0)).toBeLessThan(0.00002);
    expect(paperTurnActivity(1) - paperTurnActivity(0.999)).toBeLessThan(0.00002);
  });
});

describe("paper fragment shader injection", () => {
  // three's meshphysical template applies sheen and clearcoat AFTER the base
  // outgoingLight line. Keep them on the same baseline-plus-motion response
  // as the custom paper gleam so no term switches independently at a landing.
  const patched = injectPaperActivity(ShaderLib.physical.fragmentShader);

  it("replaces the base lighting line with the activity-gated paper model", () => {
    expect(patched).not.toContain(
      "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
    );
    expect(patched).toContain(
      `float paperResponse = mix(${PAPER_BASE_RESPONSE.toFixed(3)}, 1.0, paperActivity);`,
    );
    expect(patched).toContain("paperGleam");
  });

  it("gates the sheen and clearcoat post-mixes through the shared response", () => {
    expect(patched).not.toContain(
      "outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;",
    );
    expect(patched).toContain(
      "( sheenSpecularDirect + sheenSpecularIndirect ) * paperResponse",
    );
    expect(patched).not.toContain("* material.clearcoat;");
    expect(patched).toContain("material.clearcoat * Fcc * paperResponse");
  });

  it("declares the paperActivity uniform exactly once", () => {
    expect(patched.match(/uniform float paperActivity;/g)).toHaveLength(1);
  });
});

describe("gleam envelope", () => {
  it("drops only the motion boost once the sheet truly rests", () => {
    expect(paperGleamActivity(0, 0)).toBe(0);
    expect(paperGleamActivity(1, 0)).toBe(0);
    expect(paperOpticalResponse(paperGleamActivity(0, 0))).toBe(PAPER_BASE_RESPONSE);
    expect(paperOpticalResponse(paperGleamActivity(1, 0))).toBe(PAPER_BASE_RESPONSE);
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
    // it fires on, the motion term must already be zero so both layers show
    // only the same resting sheen at and below that threshold.
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

  it("fades residual motion to zero before the settle timeout swaps layers", () => {
    const decay = [0, 0.25, 0.5, 0.75, 1].map((fraction) =>
      fadeSettlingActivity(0.5, SETTLE_HOLD_MAX * fraction, SETTLE_HOLD_MAX),
    );

    expect(decay[0]).toBe(0.5);
    expect(decay.at(-1)).toBe(0);
    for (let index = 1; index < decay.length; index += 1) {
      expect(decay[index]!).toBeLessThan(decay[index - 1]!);
    }
  });
});
