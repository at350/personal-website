import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  MOTION_EPSILON,
  RenderGate,
  SceneSignature,
  recordSceneAppearance,
  recordSceneMotion,
  signatureChanged,
} from "../src/book3d/renderGate";

const clear = { hex: 0x000000 };
const renders = { count: 0 };
const fakeGl = {
  render: () => {
    renders.count += 1;
  },
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
    // 1e-13 rad × 3 × 707 ≈ 2e-10 px, under MOTION_EPSILON.
    expect(phases(scene, camera, () => (mesh.rotation.z = 1e-13)).motion).toBe(false);
    mesh.rotation.z = 0;
    // 1e-10 rad × 3 × 707 ≈ 2e-7 px, over it.
    expect(phases(scene, camera, () => (mesh.rotation.z = 1e-10)).motion).toBe(true);
  });

  it("re-measures reach after the geometry is enlarged", () => {
    const { scene, camera, mesh } = build();
    mesh.geometry = new THREE.PlaneGeometry(1000, 1000);
    mesh.rotation.z = 0;
    expect(phases(scene, camera, () => (mesh.rotation.z = 1e-13)).motion).toBe(false);
    mesh.rotation.z = 0;
    mesh.geometry.scale(100, 100, 1);
    mesh.geometry.attributes.position!.needsUpdate = true;
    snap(scene, camera);
    expect(phases(scene, camera, () => (mesh.rotation.z = 1e-13)).motion).toBe(true);
  });

  it("re-measures reach when interleaved storage is swapped", () => {
    const { scene, camera, mesh } = build();
    const small = new THREE.InterleavedBuffer(new Float32Array([0, 0, 0, 1000, 0, 0]), 3);
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.InterleavedBufferAttribute(small, 3, 0);
    geometry.setAttribute("position", position);
    (mesh as THREE.Mesh<THREE.BufferGeometry, THREE.Material>).geometry = geometry;
    mesh.rotation.z = 0;
    // Reach 1000: 1e-13 rad moves the far vertex ~3e-10 px, under the tolerance.
    expect(phases(scene, camera, () => (mesh.rotation.z = 1e-13)).motion).toBe(false);
    mesh.rotation.z = 0;
    // Same attribute, same count and version, but storage reaching 100× as far.
    position.data = new THREE.InterleavedBuffer(new Float32Array([0, 0, 0, 1e5, 0, 0]), 3);
    snap(scene, camera);
    expect(phases(scene, camera, () => (mesh.rotation.z = 1e-13)).motion).toBe(true);
  });

  it("re-measures reach when an interleaved attribute's offset moves", () => {
    const { scene, camera, mesh } = build();
    // Each vertex stores a near point (offset 0) and a far one (offset 3).
    const data = new THREE.InterleavedBuffer(
      new Float32Array([0, 0, 0, 0, 0, 0, 1000, 0, 0, 1e5, 0, 0]),
      6,
    );
    const position = new THREE.InterleavedBufferAttribute(data, 3, 0);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", position);
    (mesh as THREE.Mesh<THREE.BufferGeometry, THREE.Material>).geometry = geometry;
    mesh.rotation.z = 0;
    expect(phases(scene, camera, () => (mesh.rotation.z = 1e-13)).motion).toBe(false);
    mesh.rotation.z = 0;
    expect(phases(scene, camera, () => (position.offset = 3)).motion).toBe(true);
    expect(phases(scene, camera, () => (mesh.rotation.z = 1e-13)).motion).toBe(true);
  });

  it("treats a swapped buffer of the same size and version as a change", () => {
    const { scene, camera, mesh } = build();
    const position = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const copy = position.clone();
    copy.version = position.version;
    expect(phases(scene, camera, () => mesh.geometry.setAttribute("position", copy)).motion).toBe(true);
    const index = mesh.geometry.index!;
    const indexCopy = index.clone();
    indexCopy.version = index.version;
    expect(phases(scene, camera, () => mesh.geometry.setIndex(indexCopy)).motion).toBe(true);
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

describe("render gate frames", () => {
  function gated() {
    const { scene, camera, mesh } = build();
    const gate = new RenderGate();
    const frame = { gl: fakeGl, scene, camera };
    /** Runs `count` frames, moving the mesh by `step` px before each. */
    const run = (count: number, step = 0) => {
      const drew: boolean[] = [];
      for (let i = 0; i < count; i += 1) {
        mesh.position.x += step;
        drew.push(gate.frame(frame));
      }
      return drew;
    };
    const none = (count: number) => Array<boolean>(count).fill(false);
    // The first draw, then the first quiet frame's, which also records
    // appearance; then nothing.
    expect(run(6)).toEqual([true, true, ...none(4)]);
    return { gate, frame, mesh, run, none };
  }

  it("draws a moved scene and skips an unchanged one", () => {
    const { run, none } = gated();
    const before = renders.count;
    expect([...run(1, 1), ...run(1)]).toEqual([true, true]);
    expect(renders.count).toBe(before + 2);
    expect(run(4)).toEqual(none(4));
  });

  it("skips motion under MOTION_EPSILON until it adds up past it", () => {
    const { run, none } = gated();
    expect(run(3, MOTION_EPSILON * 0.3)).toEqual(none(3));
    expect(run(1, MOTION_EPSILON * 0.3)).toEqual([true]);
    expect(run(3)).toEqual([true, false, false]);
  });

  it("stays quiet under float noise that never adds up", () => {
    const { mesh, run, none } = gated();
    const drew: boolean[] = [];
    for (let i = 0; i < 20; i += 1) {
      const flip = i % 2 ? -MOTION_EPSILON * 0.01 : MOTION_EPSILON * 0.01;
      mesh.position.x += flip;
      drew.push(...run(1));
    }
    expect(drew).toEqual(none(20));
  });

  it("draws every frame in always mode and redraws once gated again", () => {
    const { gate, frame, run } = gated();
    expect([gate.frame(frame, true), gate.frame(frame, true)]).toEqual([true, true]);
    expect(run(3)).toEqual([true, true, false]);
  });

  it("draws after invalidation (a restored context)", () => {
    const { gate, run } = gated();
    gate.invalidate();
    expect(run(3)).toEqual([true, true, false]);
  });
});
