import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ATTACHED_REMNANT_COUNT,
  DEFAULT_SETTLED_ASH_COUNT,
  DEFAULT_SETTLED_FIBRE_COUNT,
  MAX_SETTLED_ASH_COUNT,
  MAX_SETTLED_FIBRE_COUNT,
  createResidueTextureState,
  createAttachedRemnantLayout,
  createClusteredAshLayout,
  createSettledFibreLayout,
  makeSettledAshGeometry,
  makeSettledFibreGeometry,
  updateResidueTextureState,
} from "@/ignite/IgniteDebris";
import {
  IGNITE_LAYER_GAP,
  IGNITE_CHAR_ZONE_MAX_TEXELS,
  IGNITE_CURL_INSET_RATIO,
  IGNITE_MAX_CURL_RATIO,
  IGNITE_PAGE_SEGMENTS_X,
  IGNITE_PAGE_SEGMENTS_Y,
  IGNITE_TOTAL_LEAVES,
  createBurnPagePlan,
  resolveBurnPageVisibility,
  resolvePaperCurl,
  resolvePreviousLayerExposure,
  resolveBurnLayerPhase,
  resolveUnderlayerDiscoloration,
  shouldRefreshBurnTexture,
} from "@/ignite/IgniteBook";
import {
  BURN_FIXED_STEP,
  createBurnField,
  igniteBurnField,
  stepBurnField,
} from "@/ignite/burnField";

describe("ignite material conservation", () => {
  it("uses a bounded deterministic set of clustered settled ash", () => {
    const first = createClusteredAshLayout();
    const second = createClusteredAshLayout();

    expect(DEFAULT_SETTLED_ASH_COUNT).toBeLessThanOrEqual(
      MAX_SETTLED_ASH_COUNT,
    );
    expect(first.sourceUv).toHaveLength(DEFAULT_SETTLED_ASH_COUNT * 2);
    expect(Array.from(first.sourceUv)).toEqual(Array.from(second.sourceUv));
    expect(Array.from(new Set(first.cluster)).length).toBeGreaterThanOrEqual(14);
    // Fragments trail the fine powder: none pop out at first perforation,
    // yet a solid share has revealed by mid-consumption of the local stack.
    expect(Math.min(...first.threshold)).toBeGreaterThanOrEqual(0.05);
    expect(first.threshold.filter((gate) => gate < 0.2).length)
      .toBeGreaterThanOrEqual(DEFAULT_SETTLED_ASH_COUNT * 0.25);
    expect(Math.max(...first.scale)).toBeLessThanOrEqual(0.029);

    for (const cluster of new Set(first.cluster)) {
      const points: Array<[number, number]> = [];
      for (let index = 0; index < first.cluster.length; index += 1) {
        if (first.cluster[index] !== cluster) continue;
        points.push([
          first.sourceUv[index * 2] ?? 0,
          first.sourceUv[index * 2 + 1] ?? 0,
        ]);
      }
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.09);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.085);
    }

    const geometry = makeSettledAshGeometry(DEFAULT_SETTLED_ASH_COUNT);
    expect(geometry.instanceCount).toBe(DEFAULT_SETTLED_ASH_COUNT);
    expect(geometry.getAttribute("aSourceUv").count).toBe(
      DEFAULT_SETTLED_ASH_COUNT,
    );
    expect(geometry.getAttribute("aCorner").count).toBe(7);
    geometry.dispose();

    const boundedGeometry = makeSettledAshGeometry(620);
    expect(boundedGeometry.instanceCount).toBe(MAX_SETTLED_ASH_COUNT);
    boundedGeometry.dispose();
  });

  it("builds bounded deterministic fibrous ribbons between the ash clumps", () => {
    const first = createSettledFibreLayout();
    const second = createSettledFibreLayout();

    expect(DEFAULT_SETTLED_FIBRE_COUNT).toBeLessThanOrEqual(
      MAX_SETTLED_FIBRE_COUNT,
    );
    expect(first.sourceUv).toHaveLength(DEFAULT_SETTLED_FIBRE_COUNT * 2);
    expect(Array.from(first.sourceUv)).toEqual(Array.from(second.sourceUv));
    expect(Math.min(...first.scale.filter((_, index) => index % 2 === 0)))
      .toBeGreaterThanOrEqual(0.015);
    expect(Math.max(...first.scale.filter((_, index) => index % 2 === 1)))
      .toBeLessThan(0.0062);

    const geometry = makeSettledFibreGeometry(DEFAULT_SETTLED_FIBRE_COUNT);
    expect(geometry.instanceCount).toBe(DEFAULT_SETTLED_FIBRE_COUNT);
    expect(geometry.getAttribute("aAlong").count).toBeGreaterThanOrEqual(16);
    expect(geometry.getAttribute("aBend").count).toBe(
      DEFAULT_SETTLED_FIBRE_COUNT,
    );
    geometry.dispose();

    const bounded = makeSettledFibreGeometry(900);
    expect(bounded.instanceCount).toBe(MAX_SETTLED_FIBRE_COUNT);
    bounded.dispose();
  });

  it("keeps attached char folds sparse even before the boundary gate", () => {
    const layout = createAttachedRemnantLayout();
    const eligible = Array.from(layout.gate).filter((value) => value > 0).length;

    expect(DEFAULT_ATTACHED_REMNANT_COUNT).toBeLessThanOrEqual(96);
    expect(eligible).toBeGreaterThanOrEqual(16);
    expect(eligible).toBeLessThanOrEqual(40);
    expect(eligible).toBeLessThanOrEqual(DEFAULT_ATTACHED_REMNANT_COUNT / 3);
  });

  it("conserves residue in an overscanned tabletop density texture", () => {
    const residue = new Float32Array([0.04, 0.08, 0.01, 0.06]);
    const field = {
      width: 2,
      height: 2,
      capacity: new Float32Array([1, 1, 1, 1]),
      residue,
      grain: new Float32Array([0.3, 0.8, 0.5, 0.7]),
    } as never;
    const state = createResidueTextureState(24, 18);
    updateResidueTextureState(state, field);
    const first = state.density.slice();
    expect(Math.max(...first)).toBeGreaterThan(0.5);
    const occupied = Array.from(first).filter((density) => density > 0.08).length;
    expect(occupied).toBeGreaterThan(40);
    residue.fill(0);
    updateResidueTextureState(state, field);
    expect(Array.from(state.density)).toEqual(Array.from(first));
    expect(Math.max(...state.bytes)).toBeGreaterThan(120);
  });

  it("maps every physical leaf to its successive printed page", () => {
    const cover = createBurnPagePlan(0);
    expect(cover.left).toHaveLength(0);
    expect(cover.right).toHaveLength(IGNITE_TOTAL_LEAVES);
    expect(cover.right[0]).toMatchObject({
      textureKey: "0:recto",
      side: "right",
      layer: 0,
    });
    expect(cover.right.at(-1)).toMatchObject({
      textureKey: "9:recto",
      side: "right",
      layer: 9,
    });

    const middle = createBurnPagePlan(5);
    expect(middle.left.map((page) => page.textureKey)).toEqual([
      "5:verso",
      "4:verso",
      "3:verso",
      "2:verso",
      "1:verso",
    ]);
    expect(middle.right.map((page) => page.textureKey)).toEqual([
      "5:recto",
      "6:recto",
      "7:recto",
      "8:recto",
      "9:recto",
    ]);
    expect(middle.left.length + middle.right.length).toBe(IGNITE_TOTAL_LEAVES);

    const back = createBurnPagePlan(IGNITE_TOTAL_LEAVES);
    expect(back.right).toHaveLength(0);
    expect(back.left[0]?.textureKey).toBe("10:verso");
    expect(back.left.at(-1)?.textureKey).toBe("1:verso");
  });

  it("delays each underlying cut by exact physical page depth", () => {
    expect(resolveBurnLayerPhase(0.36, 0.12, 0)).toBeCloseTo(0.36);
    expect(resolveBurnLayerPhase(1, 0.95, 1)).toBe(0);
    expect(resolveBurnLayerPhase(1, 1.25, 1)).toBeCloseTo(0.25);
    expect(resolveBurnLayerPhase(1, 1.25, 2)).toBe(0);
    expect(resolveBurnLayerPhase(1, 2.7, 1)).toBe(1);
    expect(resolveBurnLayerPhase(1, 2.7, 2)).toBeCloseTo(0.7);
    expect(resolveBurnLayerPhase(1, 10, 9)).toBe(1);
  });

  it("discolors a revealed sheet before permitting its own cut", () => {
    // The top sheet has opened, but physical depth has not reached page one.
    expect(resolveBurnLayerPhase(0.5, 0.2, 1)).toBe(0);
    expect(resolvePreviousLayerExposure(0.5, 0.2, 1)).toBe(1);
    const firstUnderlayer = resolveUnderlayerDiscoloration(0.5, 0.2, 1, 1);
    expect(firstUnderlayer).toBeGreaterThanOrEqual(0.1);
    expect(firstUnderlayer).toBeLessThanOrEqual(0.19);

    // Page two remains clean until page one reaches its own perforation.
    expect(resolvePreviousLayerExposure(0.5, 1.2, 2)).toBe(0);
    expect(resolveUnderlayerDiscoloration(0.5, 1.2, 1, 2)).toBe(0);
    expect(resolvePreviousLayerExposure(0.5, 1.7, 2)).toBe(1);
    expect(resolveUnderlayerDiscoloration(0.5, 1.7, 0.8, 2)).toBeGreaterThan(
      firstUnderlayer,
    );
  });

  it("curls only the intact hot lip of the currently burning layer", () => {
    const activeCurl = resolvePaperCurl(0.49, 0.61, 0.54, 0.9, 1.42, 1, 0.7);
    expect(activeCurl).toBeGreaterThan(0.45);
    expect(activeCurl).toBeLessThanOrEqual(1);

    expect(resolvePaperCurl(0.49, 0.61, 0.54, 0.2, 1.42, 1, 0.7)).toBe(0);
    expect(resolvePaperCurl(0.62, 0.7, 0.54, 0.9, 1.42, 1, 0.7)).toBe(0);
    expect(resolvePaperCurl(0.49, 0.61, 0.54, 0.9, 2.2, 1, 0.7)).toBe(0);
    expect(resolvePaperCurl(0.1, 0.1, 0.54, 0.9, 1.42, 1, 0.7)).toBe(0);
  });

  it("mounts the full progressive stack without underbed or contour bowls", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "ignite", "IgniteBook.tsx"),
      "utf8",
    );
    expect(IGNITE_LAYER_GAP).toBeLessThanOrEqual(0.1);
    expect(IGNITE_PAGE_SEGMENTS_X).toBeGreaterThanOrEqual(80);
    expect(IGNITE_PAGE_SEGMENTS_Y).toBeGreaterThanOrEqual(100);
    expect(source).toContain("ignite-progressive-paper-v7");
    expect(source).toContain("state.b * igniteMaxLayers");
    expect(source).toContain("physicalDepth - layerIndex");
    expect(source).toContain("igniteUpperHole");
    expect(source).toContain("igniteUnderClump");
    expect(source).toContain("igniteUnderShade");
    expect(source).toContain("igniteUnderTone");
    expect(source).toContain("igniteMacro");
    expect(source).toContain("igniteWidthVariation");
    expect(source).toContain("igniteCarbonCore");
    expect(source).toContain("igniteBrownReach");
    expect(source).toContain("igniteTanReach");
    expect(source).toContain("igniteIntactEdge");
    expect(source).toContain("igniteEmberMacro");
    expect(source).toContain("igniteCutSignalForLayer");
    expect(source).toContain("fwidth(signal) * 1.35");
    expect(source).toContain("alphaToCoverage: true");
    expect(source).toContain("tornFibre");
    expect(source).toContain("igniteCurlLift");
    expect(source).toContain("igniteFibreCorrugation");
    expect(source).toContain("igniteBoundaryDistanceTexels");
    expect(source).toContain("igniteFoldNormal");
    expect(source).toContain("igniteCharredUnderside");
    expect(source).toContain("IGNITE_PAGE_SEGMENTS_X");
    expect(source).toContain("smoothstep(.625, .71, igniteEmberMacro)");
    expect(source).toContain("vec3(1.0, .085, .002) * igniteEmber * .92");
    expect(source).toContain("pages.map((entry)");
    expect(source).not.toContain("BurnUnderbed");
    expect(source).toContain("transformed.z += igniteCurlLift");
    expect(source).toContain("igniteVertexDepth - igniteLayer");
    expect(IGNITE_MAX_CURL_RATIO).toBeGreaterThanOrEqual(0.03);
    expect(IGNITE_MAX_CURL_RATIO).toBeLessThanOrEqual(0.055);
    expect(IGNITE_CURL_INSET_RATIO).toBeGreaterThanOrEqual(0.2);
    expect(IGNITE_CHAR_ZONE_MAX_TEXELS).toBeLessThanOrEqual(5);
    expect(source).not.toMatch(/fragmentCount=\{(?:420|620)\}/);
  });

  it("regenerates and uploads the burn texture only after state changes", () => {
    // Idle render frames between fixed simulation steps must not refilter,
    // upsample, or upload anything.
    expect(shouldRefreshBurnTexture(0, false, false, false)).toBe(false);
    // A fixed step ran, or the pointer injected fresh heat.
    expect(shouldRefreshBurnTexture(1, false, false, false)).toBe(true);
    expect(shouldRefreshBurnTexture(0, true, false, false)).toBe(true);
    // Completion flushes exactly one terminal refresh, then stays silent.
    expect(shouldRefreshBurnTexture(0, false, true, false)).toBe(true);
    expect(shouldRefreshBurnTexture(0, false, true, true)).toBe(false);
    expect(shouldRefreshBurnTexture(3, true, true, true)).toBe(false);
  });

  it("renders only leaves the fire can expose and skips consumed ones", () => {
    // The exposed sheet renders until its half is fully consumed.
    expect(resolveBurnPageVisibility(0, 0, 0)).toBe(true);
    expect(resolveBurnPageVisibility(0, 3, 1.2)).toBe(false);
    // A deep leaf stays skipped while combustion is still sheets above it.
    expect(resolveBurnPageVisibility(3, 1.2, 0)).toBe(false);
    expect(resolveBurnPageVisibility(3, 2.5, 0)).toBe(true);
    // Fully burned-through leaves stop rendering entirely.
    expect(resolveBurnPageVisibility(1, 5, 2.2)).toBe(false);
    expect(resolveBurnPageVisibility(2, 5, 2.2)).toBe(true);
  });

  it("keeps deposit mass correlated with actually consumed paper", () => {
    const field = createBurnField({
      width: 48,
      height: 32,
      leftLayers: 2,
      rightLayers: 2,
      seed: 11,
    });
    const state = createResidueTextureState(64, 44);
    const densitySum = () => {
      let total = 0;
      for (const value of state.density) total += value;
      return total;
    };

    updateResidueTextureState(state, field);
    expect(densitySum()).toBe(0);

    igniteBurnField(field, 0.5, 0.5, 0.06, 1.2);
    for (let frame = 0; frame < 60; frame += 1) {
      stepBurnField(field, BURN_FIXED_STEP);
    }
    updateResidueTextureState(state, field);
    const midSum = densitySum();
    const midFuel = field.burnedFuel;
    expect(midSum).toBeGreaterThan(0);

    for (let frame = 0; frame < 120; frame += 1) {
      stepBurnField(field, BURN_FIXED_STEP);
    }
    updateResidueTextureState(state, field);
    expect(field.burnedFuel).toBeGreaterThan(midFuel);
    expect(densitySum()).toBeGreaterThan(midSum);
  });
});
