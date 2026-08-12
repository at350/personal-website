import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  COVER_HOLOGRAM_PAGE_KEY,
  coverHologramFlipEnvelope,
  coverHologramTiltEnvelope,
  isMovingCoverSheet,
  isTiltableCoverStack,
  normalizeCoverHologramPointer,
} from "@/magazine/coverHologram";
import {
  COVER_HOLOGRAM_CHROMA_GAIN,
  COVER_HOLOGRAM_FRESNEL_GAIN,
  COVER_HOLOGRAM_GLARE_GAIN,
  COVER_HOLOGRAM_MAX_ALPHA,
  COVER_HOLOGRAM_PEAK_WHITE_MIX_MIN,
  createCoverHologramMaterial,
  updateCoverHologramMaterial,
} from "@/book3d/coverHologramMaterial";

describe("cover hologram", () => {
  it("uses a page-sized, plane-only mask instead of drawing a second A", () => {
    const pattern = readFileSync(
      join(process.cwd(), "public", "images", "editorial", "cover-hologram-pattern.svg"),
      "utf8",
    );

    expect(pattern).toContain('viewBox="0 0 640 853"');
    expect(pattern).toContain('id="front-plane"');
    expect(pattern).toContain('id="right-leg"');
    expect(pattern).not.toMatch(/registration|printer|<circle|stroke=/i);
  });

  it("is scoped to the physical front-cover texture", () => {
    expect(COVER_HOLOGRAM_PAGE_KEY).toBe("0:recto");
    expect(["0:verso", "1:recto", "10:recto", "0:recto-extra"]).not.toContain(
      COVER_HOLOGRAM_PAGE_KEY,
    );
  });

  it("scopes moving foil to the front-cover sheet", () => {
    expect(isMovingCoverSheet(null)).toBe(false);
    expect(isMovingCoverSheet(0)).toBe(true);
    expect(isMovingCoverSheet(1)).toBe(false);
    expect(isMovingCoverSheet(-1)).toBe(false);

  });

  it("mounts the tilt skin only on the landed front-cover stack", () => {
    expect(isTiltableCoverStack(0, null, false)).toBe(true);
    expect(isTiltableCoverStack(0, 0, false)).toBe(false);
    expect(isTiltableCoverStack(0, null, true)).toBe(false);
    expect(isTiltableCoverStack(1, null, false)).toBe(false);
  });

  it("clamps invalid pointer input to a finite page-local range", () => {
    expect(normalizeCoverHologramPointer(2, -3)).toEqual({ x: 1, y: -1 });
    expect(normalizeCoverHologramPointer(-2, 3)).toEqual({ x: -1, y: 1 });
    expect(normalizeCoverHologramPointer(Number.NaN, Number.POSITIVE_INFINITY)).toEqual(
      { x: 0, y: 0 },
    );
  });

  it("has an exact, continuous zero flip offset at both render handoffs", () => {
    expect(coverHologramFlipEnvelope(-1)).toBe(0);
    expect(coverHologramFlipEnvelope(0)).toBe(0);
    expect(coverHologramFlipEnvelope(0.5)).toBeCloseTo(1);
    expect(coverHologramFlipEnvelope(1)).toBe(0);
    expect(coverHologramFlipEnvelope(0.25)).toBeCloseTo(
      coverHologramFlipEnvelope(0.75),
    );
    expect(coverHologramFlipEnvelope(2)).toBe(0);
    expect(coverHologramFlipEnvelope(0.000001)).toBeLessThan(0.000004);
    expect(coverHologramFlipEnvelope(0.999999)).toBeLessThan(0.000004);
  });

  it("reveals tilt only after pointer interaction and before the flat handoff", () => {
    expect(coverHologramTiltEnvelope(false, 0)).toBe(0);
    expect(coverHologramTiltEnvelope(false, 0.5)).toBe(0);
    expect(coverHologramTiltEnvelope(true, 0)).toBe(1);
    expect(coverHologramTiltEnvelope(true, 0.89)).toBeGreaterThan(0);
    expect(coverHologramTiltEnvelope(true, 0.97)).toBe(0);
    expect(coverHologramTiltEnvelope(true, 1)).toBe(0);
    expect(coverHologramTiltEnvelope(true, Number.NaN)).toBe(0);
    expect(coverHologramTiltEnvelope(true, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("makes white glare stronger than chroma without becoming opaque", () => {
    expect(COVER_HOLOGRAM_GLARE_GAIN).toBeGreaterThan(
      COVER_HOLOGRAM_CHROMA_GAIN,
    );
    expect(COVER_HOLOGRAM_FRESNEL_GAIN).toBeGreaterThan(
      COVER_HOLOGRAM_CHROMA_GAIN,
    );
    expect(COVER_HOLOGRAM_PEAK_WHITE_MIX_MIN).toBeGreaterThanOrEqual(0.6);
    expect(COVER_HOLOGRAM_MAX_ALPHA).toBeLessThanOrEqual(0.5);
  });

  it("updates WebGL uniforms in place and preserves the material contract", () => {
    const texture = new THREE.Texture();
    const material = createCoverHologramMaterial(texture);
    const pointer = material.uniforms.uPointer.value;
    const uniform = material.uniforms.uPointer;
    const tiltUniform = material.uniforms.uTilt;

    updateCoverHologramMaterial(material, {
      pointerX: 4,
      pointerY: -4,
      progress: 0.5,
      tilt: 3,
      strength: 8,
    });

    expect(material.uniforms.uPattern.value).toBe(texture);
    expect(material.uniforms.uPointer).toBe(uniform);
    expect(material.uniforms.uPointer.value).toBe(pointer);
    expect(pointer.toArray()).toEqual([1, -1]);
    expect(material.uniforms.uFlip.value).toBeCloseTo(1);
    expect(material.uniforms.uTilt).toBe(tiltUniform);
    expect(material.uniforms.uTilt.value).toBe(1);
    expect(material.uniforms.uStrength.value).toBe(1.25);
    expect(material.side).toBe(THREE.FrontSide);
    expect(material.transparent).toBe(true);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.toneMapped).toBe(false);
    expect(material.polygonOffset).toBe(true);
    expect(material.fragmentShader).not.toContain("backgroundFoil");
    expect(material.fragmentShader).toContain("motionVisibility");
    expect(material.fragmentShader).toContain(
      "max(flipVisibility, uTilt)",
    );
    expect(material.fragmentShader).toMatch(
      /uStrength \* edgeFade \* motionVisibility/,
    );

    updateCoverHologramMaterial(material, {
      pointerX: Number.NaN,
      pointerY: Number.POSITIVE_INFINITY,
      progress: 1,
      tilt: Number.NaN,
      strength: Number.NaN,
    });
    expect(pointer.toArray()).toEqual([0, 0]);
    expect(material.uniforms.uFlip.value).toBe(0);
    expect(material.uniforms.uTilt.value).toBe(0);
    expect(material.uniforms.uStrength.value).toBe(1);
    material.dispose();
  });
});
