import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyCoverHologramPointer,
  COVER_HOLOGRAM_PAGE_KEY,
  coverHologramCssVariables,
  coverHologramFlipEnvelope,
  normalizeCoverHologramPointer,
} from "@/magazine/coverHologram";
import {
  createCoverHologramMaterial,
  updateCoverHologramMaterial,
} from "@/book3d/coverHologramMaterial";

describe("cover hologram", () => {
  it("is scoped to the physical front-cover texture", () => {
    expect(COVER_HOLOGRAM_PAGE_KEY).toBe("0:recto");
    expect(["0:verso", "1:recto", "10:recto", "0:recto-extra"]).not.toContain(
      COVER_HOLOGRAM_PAGE_KEY,
    );
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
    expect(coverHologramFlipEnvelope(2)).toBe(0);
    expect(coverHologramFlipEnvelope(0.000001)).toBeLessThan(0.000004);
    expect(coverHologramFlipEnvelope(0.999999)).toBeLessThan(0.000004);
  });

  it("produces bounded CSS variables without invalid values", () => {
    expect(coverHologramCssVariables(1, -1)).toEqual({
      shiftX: "26.00%",
      shiftY: "-22.00%",
      glareX: "84.00%",
      glareY: "16.00%",
      angle: "130.00deg",
    });
    const invalid = JSON.stringify(
      coverHologramCssVariables(Number.NaN, Number.NEGATIVE_INFINITY),
    );
    expect(invalid).not.toMatch(/NaN|Infinity/);
  });

  it("applies all live-cover variables through stable DOM style properties", () => {
    const element = document.createElement("div");
    applyCoverHologramPointer(element, -1, 1);
    expect(element.style.getPropertyValue("--holo-shift-x")).toBe("-26.00%");
    expect(element.style.getPropertyValue("--holo-shift-y")).toBe("22.00%");
    expect(element.style.getPropertyValue("--holo-glare-x")).toBe("16.00%");
    expect(element.style.getPropertyValue("--holo-glare-y")).toBe("84.00%");
    expect(element.style.getPropertyValue("--holo-angle")).toBe("106.00deg");
  });

  it("updates WebGL uniforms in place and preserves the material contract", () => {
    const texture = new THREE.Texture();
    const material = createCoverHologramMaterial(texture);
    const pointer = material.uniforms.uPointer.value;
    const uniform = material.uniforms.uPointer;

    updateCoverHologramMaterial(material, {
      pointerX: 4,
      pointerY: -4,
      progress: 0.5,
      strength: 8,
    });

    expect(material.uniforms.uPattern.value).toBe(texture);
    expect(material.uniforms.uPointer).toBe(uniform);
    expect(material.uniforms.uPointer.value).toBe(pointer);
    expect(pointer.toArray()).toEqual([1, -1]);
    expect(material.uniforms.uFlip.value).toBeCloseTo(1);
    expect(material.uniforms.uStrength.value).toBe(1.25);
    expect(material.side).toBe(THREE.FrontSide);
    expect(material.transparent).toBe(true);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.toneMapped).toBe(false);
    expect(material.polygonOffset).toBe(true);

    updateCoverHologramMaterial(material, {
      pointerX: Number.NaN,
      pointerY: Number.POSITIVE_INFINITY,
      progress: 1,
      strength: Number.NaN,
    });
    expect(pointer.toArray()).toEqual([0, 0]);
    expect(material.uniforms.uFlip.value).toBe(0);
    expect(material.uniforms.uStrength.value).toBe(1);
    material.dispose();
  });
});
