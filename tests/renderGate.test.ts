import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  MOTION_EPSILON,
  SceneSignature,
  recordSceneAppearance,
  recordSceneMotion,
  signatureChanged,
} from "../src/book3d/renderGate";

const clear = { hex: 0x000000 };
const fakeGl = {
  getPixelRatio: () => 2,
  domElement: { width: 800, height: 600 },
  toneMapping: 0,
  toneMappingExposure: 1,
  outputColorSpace: "srgb",
  getClearAlpha: () => 0,
  getClearColor: (c: THREE.Color) => c.set(clear.hex),
  shadowMap: { enabled: true, type: 1 },
  localClippingEnabled: false,
  clippingPlanes: [],
} as unknown as THREE.WebGLRenderer;

function build() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.z = 5;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  scene.add(mesh);
  return { scene, camera, mesh };
}

/** Snapshot of both phases, as the gate stores them. */
function snap(scene: THREE.Scene, camera: THREE.Camera) {
  const m = new SceneSignature();
  recordSceneMotion(m, fakeGl, scene, camera);
  const a = new SceneSignature();
  recordSceneAppearance(a, fakeGl, scene);
  return { motion: m.values.slice(), look: a.values.slice() };
}

const changed = (prev: number[], next: number[], tolerance = 0) =>
  signatureChanged(Float64Array.from(prev), 0, prev.length, next, tolerance);

function phases(scene: THREE.Scene, camera: THREE.Camera, mutate: () => void) {
  const before = snap(scene, camera);
  mutate();
  const after = snap(scene, camera);
  return {
    motion: changed(before.motion, after.motion, MOTION_EPSILON),
    look: changed(before.look, after.look),
  };
}

describe("render gate signatures", () => {
  it("records identical values for an unchanged scene", () => {
    const { scene, camera } = build();
    const a = snap(scene, camera);
    const b = snap(scene, camera);
    expect(b.motion).toEqual(a.motion);
    expect(b.look).toEqual(a.look);
    expect(changed(a.motion, b.motion)).toBe(false);
    expect(changed(a.look, b.look)).toBe(false);
  });

  it("treats movement beyond the epsilon as a change and less as none", () => {
    const { scene, camera, mesh } = build();
    expect(phases(scene, camera, () => (mesh.position.x += MOTION_EPSILON * 100)).motion).toBe(true);
    expect(phases(scene, camera, () => (mesh.position.x += MOTION_EPSILON / 10)).motion).toBe(false);
  });

  it("detects visibility, geometry and texture updates and material swaps", () => {
    const { scene, camera, mesh } = build();
    expect(phases(scene, camera, () => (mesh.visible = false)).motion).toBe(true);
    mesh.visible = true;
    expect(
      phases(scene, camera, () => {
        mesh.geometry.attributes.position!.needsUpdate = true;
      }).motion,
    ).toBe(true);

    const texture = new THREE.Texture();
    (mesh.material as THREE.MeshStandardMaterial).map = texture;
    expect(phases(scene, camera, () => (texture.needsUpdate = true)).look).toBe(true);
    expect(
      phases(scene, camera, () => {
        mesh.material = new THREE.MeshStandardMaterial();
      }).look,
    ).toBe(true);
  });

  it("sees ShaderMaterial uniforms and injected paper uniforms as appearance", () => {
    const { scene, camera, mesh } = build();
    const shader = new THREE.ShaderMaterial({ uniforms: { uAmount: { value: 0 } } });
    (mesh as THREE.Mesh<THREE.BufferGeometry, THREE.Material>).material = shader;
    expect(phases(scene, camera, () => (shader.uniforms.uAmount!.value = 1)).look).toBe(true);

    const paper = new THREE.MeshStandardMaterial();
    paper.userData.paperShader = { uniforms: { paperActivity: { value: 0 } } };
    mesh.material = paper;
    const r = phases(scene, camera, () => {
      paper.userData.paperShader.uniforms.paperActivity.value = 0.5;
    });
    expect(r.look).toBe(true);
    expect(r.motion).toBe(false);
  });

  it("ignores changes inside invisible subtrees", () => {
    const { scene, camera } = build();
    const group = new THREE.Group();
    group.visible = false;
    const hidden = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    group.add(hidden);
    scene.add(group);
    const r = phases(scene, camera, () => {
      hidden.position.x = 50;
      (hidden.material as THREE.MeshBasicMaterial).color.set(0xff0000);
      hidden.geometry.attributes.position!.needsUpdate = true;
    });
    expect(r).toEqual({ motion: false, look: false });
  });

  it("ignores built-in uniform names under userData.paperShader.uniforms", () => {
    const { scene, camera, mesh } = build();
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.userData.paperShader = { uniforms: { diffuse: { value: 0 } } };
    expect(phases(scene, camera, () => (mat.userData.paperShader.uniforms.diffuse.value = 9)).look).toBe(false);
  });

  it("matches NaN with NaN", () => {
    expect(signatureChanged(Float64Array.from([NaN, 1]), 0, 2, [NaN, 1])).toBe(false);
    expect(signatureChanged(Float64Array.from([NaN, 1]), 0, 2, [0, 1])).toBe(true);
    expect(signatureChanged(Float64Array.from([1]), 0, 1, [1, 1])).toBe(true);
  });

  it("compares rotation by vertex displacement (angle × reach)", () => {
    const { scene, camera, mesh } = build();
    mesh.geometry = new THREE.PlaneGeometry(1000, 1000); // reach ≈ 707
    // 5e-10 rad × 707 ≈ 3.5e-7 px, well under MOTION_EPSILON.
    expect(phases(scene, camera, () => (mesh.rotation.z = 5e-10)).motion).toBe(false);
    mesh.rotation.z = 0;
    // 1e-7 rad × 707 ≈ 7e-5 px, over it.
    expect(phases(scene, camera, () => (mesh.rotation.z = 1e-7)).motion).toBe(true);
  });

  it("re-measures reach after the geometry is enlarged", () => {
    const { scene, camera, mesh } = build();
    mesh.geometry = new THREE.PlaneGeometry(1000, 1000);
    mesh.rotation.z = 0;
    expect(phases(scene, camera, () => (mesh.rotation.z = 5e-10)).motion).toBe(false);
    mesh.rotation.z = 0;
    mesh.geometry.scale(100, 100, 1);
    mesh.geometry.attributes.position!.needsUpdate = true;
    snap(scene, camera);
    expect(phases(scene, camera, () => (mesh.rotation.z = 5e-10)).motion).toBe(true);
  });

  it("compares appearance exactly", () => {
    const { scene, camera, mesh } = build();
    const shader = new THREE.ShaderMaterial({ uniforms: { uAmount: { value: 0 } } });
    (mesh as THREE.Mesh<THREE.BufferGeometry, THREE.Material>).material = shader;
    expect(phases(scene, camera, () => (shader.uniforms.uAmount!.value = 1e-12)).look).toBe(true);
  });

  it("carries a parent group's motion into its child's record", () => {
    const { scene, camera, mesh } = build();
    const group = new THREE.Group();
    scene.add(group);
    group.add(mesh);
    expect(phases(scene, camera, () => (group.position.x = 3)).motion).toBe(true);
  });

  it("detects geometry group ranges, fog parameters and the clear color", () => {
    const { scene, camera, mesh } = build();
    mesh.geometry.addGroup(0, 3, 0);
    expect(phases(scene, camera, () => (mesh.geometry.groups[0]!.count = 6)).motion).toBe(true);
    expect(phases(scene, camera, () => (mesh.geometry.groups[0]!.materialIndex = 1)).motion).toBe(true);

    const fog = new THREE.Fog(0xffffff, 1, 10);
    scene.fog = fog;
    expect(phases(scene, camera, () => (fog.near = 2)).look).toBe(true);
    expect(phases(scene, camera, () => (fog.far = 20)).look).toBe(true);
    const exp = new THREE.FogExp2(0xffffff, 0.1);
    scene.fog = exp;
    expect(phases(scene, camera, () => (exp.density = 0.2)).look).toBe(true);

    expect(phases(scene, camera, () => (clear.hex = 0x102030)).look).toBe(true);
    clear.hex = 0;
  });
});
