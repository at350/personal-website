import { describe, expect, it } from "vitest";
import {
  advanceFlameEnvelope,
  flameClusterProfile,
} from "@/ignite/flameRibbonState";
import { measureMinimumFlameCluster } from "@/ignite/flameClusterContract";

describe("flame ribbon envelope", () => {
  it("catches immediately and leaves a controlled one-to-two second afterburn", () => {
    let intensity = advanceFlameEnvelope(0, 0.2);
    expect(intensity).toBeGreaterThan(0.34);

    for (let frame = 0; frame < 24; frame += 1) {
      intensity = advanceFlameEnvelope(intensity, 0);
    }
    expect(intensity).toBeGreaterThan(0.05);

    for (let frame = 24; frame < 54; frame += 1) {
      intensity = advanceFlameEnvelope(intensity, 0);
    }
    expect(intensity).toBeGreaterThan(0.004);
    expect(intensity).toBeLessThan(0.03);

    for (let frame = 54; frame < 78; frame += 1) {
      intensity = advanceFlameEnvelope(intensity, 0);
    }
    expect(intensity).toBeLessThan(0.002);
  });

  it("gives every visible cluster a distinct non-icon gas profile", () => {
    const profiles = Array.from({ length: 3 }, (_, index) =>
      flameClusterProfile(index));
    const signatures = new Set(profiles.map((profile) =>
      [
        profile.arcWidth.toFixed(3),
        profile.rise.toFixed(3),
        profile.phase.toFixed(3),
        profile.branchBias.toFixed(3),
      ].join(":")));

    expect(signatures.size).toBe(profiles.length);
    expect(Math.min(...profiles.map(({ arcWidth }) => arcWidth)))
      .toBeGreaterThanOrEqual(38);
    expect(Math.max(...profiles.map(({ arcWidth }) => arcWidth)))
      .toBeLessThanOrEqual(50);
    expect(Math.min(...profiles.map(({ rise }) => rise)))
      .toBeGreaterThanOrEqual(112);
    expect(Math.max(...profiles.map(({ rise }) => rise)))
      .toBeLessThanOrEqual(136);
  });

  it("keeps each base topology connected with decisively visible mass", () => {
    for (let index = 0; index < 3; index += 1) {
      const coverage = measureMinimumFlameCluster(flameClusterProfile(index));
      expect(coverage.connectedComponents).toBe(1);
      expect(coverage.visiblePixels).toBeGreaterThan(500);
      expect(coverage.visiblePixels).toBeLessThan(2700);
      expect(coverage.peakAlpha).toBeGreaterThanOrEqual(.63);
      expect(coverage.peakAlpha).toBeLessThanOrEqual(.66);
      expect(coverage.fractionAboveRoot).toBeGreaterThan(.60);
      expect(coverage.centroidRise).toBeGreaterThan(18);
      expect(coverage.centreAlpha).toBeGreaterThanOrEqual(
        coverage.boundaryAlpha,
      );
    }
  });
});
