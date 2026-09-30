/* Draw only the frames that differ. At rest the reader is looking at the live
   DOM spread, and the canvas underneath would otherwise redraw an unchanged
   scene — shadow pass, physical paper, multisampling — at display rate.

   Every frame the gate records what three.js reads when it draws, in two
   phases. The first is cheap and catches motion: the drawing surface's size,
   the camera, and every visible object's world transform, render flags and
   geometry versions. When it changes, the frame is drawn at once. Only when
   nothing moved does the gate record the second phase — the renderer's
   output state, material properties, shader uniforms (including the paper
   material's injected accent), textures, lights, the scene's background —
   and it draws when that changed too.

   Appearance is compared exactly. Motion is compared against the last frame
   actually drawn with a tolerance of MOTION_EPSILON (1e-9) CSS px. It is
   not zero because a converged spring keeps flipping the last bits of its
   value (under 1e-11 px of vertex motion here, and it never adds up), so
   exact equality would never let a resting book stop drawing. The
   tolerance bounds how far a vertex moves, not how far a number does: a
   mesh's matrix coefficients are recorded scaled by three times its
   geometry's reach (its farthest vertex from its origin), the camera's by
   three times its far plane. Every frame of a spring's sub-pixel tail that
   moves anything further than that is drawn, so a skipped frame's vertices
   lie within about 1e-8 CSS px of where an unconditional draw would put
   them — thousands of times finer than the float32 coordinates the GPU
   draws with.
   The imperative frame logic (springs, physics, handoff reporting) still
   runs every frame; only the redundant draws are skipped. */

import { useEffect, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

/** Motion tolerance, in CSS px (world units): how far any one recorded
    coefficient may have moved vertices since the last draw before a frame
    is drawn. Over 100× the float noise measured on a resting book, and
    far below what the GPU's float32 vertex math can resolve. */
export const MOTION_EPSILON = 1e-9;
/** Reach used for lights, whose placement moves light rather than vertices. */
const LIGHT_REACH_PX = 1e4;

const NONE = -1;
const scratchColor = new THREE.Color();

/** Stable numbers for objects three.js does not number itself (buffer
    attributes and their interleaved storage), so swapping one buffer for
    another of the same size and version still reads as a change. */
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
function objectId(value: object): number {
  let id = objectIds.get(value);
  if (id === undefined) {
    id = nextObjectId;
    nextObjectId += 1;
    objectIds.set(value, id);
  }
  return id;
}

/** Uniform names three.js owns. The renderer refreshes them from material
    properties, lights, and the camera on every draw, so the properties that
    feed them are what the gate records; only uniforms a material injects for
    itself (e.g. the paper's motion accent) need recording from the program. */
let builtInUniforms: Set<string> | null = null;
function isBuiltInUniform(name: string) {
  if (!builtInUniforms) {
    builtInUniforms = new Set();
    for (const shader of Object.values(THREE.ShaderLib)) {
      for (const key of Object.keys(shader.uniforms)) builtInUniforms.add(key);
    }
  }
  return builtInUniforms.has(name);
}

/** three.js gives every material a numeric id at runtime; the typings only
    declare its uuid. */
const materialId = (material: THREE.Material) =>
  (material as unknown as { id: number }).id;

/** A flat record of values a draw depends on. */
export class SceneSignature {
  values: number[] = [];
  private readonly strings = new Map<string, number>();
  /** Materials recorded this pass; a material shared by many meshes needs
      recording once. */
  readonly seen = new Set<THREE.Material>();

  reset() {
    this.values.length = 0;
    this.seen.clear();
  }

  push(value: number) {
    this.values.push(value);
  }

  string(value: string) {
    let id = this.strings.get(value);
    if (id === undefined) {
      id = this.strings.size + 1;
      this.strings.set(value, id);
    }
    this.values.push(id);
  }
}

function writeTexture(out: SceneSignature, texture: THREE.Texture) {
  out.push(texture.id);
  out.push(texture.version);
  out.push(texture.source.version);
  out.push(texture.offset.x);
  out.push(texture.offset.y);
  out.push(texture.repeat.x);
  out.push(texture.repeat.y);
  out.push(texture.rotation);
  out.push(texture.center.x);
  out.push(texture.center.y);
  out.push(texture.flipY ? 1 : 0);
}

/** Numbers, flags, strings, colors, vectors, matrices, textures, arrays, and
    uniform wrappers. Anything else (functions, option bags) cannot change a
    draw without also bumping a version, so it is skipped. */
function writeValue(out: SceneSignature, value: unknown, depth = 0) {
  if (typeof value === "number") {
    out.push(value);
    return;
  }
  if (typeof value === "boolean") {
    out.push(value ? 1 : 0);
    return;
  }
  if (typeof value === "string") {
    out.string(value);
    return;
  }
  if (value === null || value === undefined) {
    out.push(NONE);
    return;
  }
  if (typeof value !== "object" || depth > 3) return;
  const v = value as Record<string, unknown> & {
    isColor?: boolean;
    isVector2?: boolean;
    isVector3?: boolean;
    isVector4?: boolean;
    isQuaternion?: boolean;
    isEuler?: boolean;
    isMatrix3?: boolean;
    isMatrix4?: boolean;
    isTexture?: boolean;
  };
  if (v.isColor) {
    const color = value as THREE.Color;
    out.push(color.r);
    out.push(color.g);
    out.push(color.b);
  } else if (v.isVector2) {
    const vector = value as THREE.Vector2;
    out.push(vector.x);
    out.push(vector.y);
  } else if (v.isVector3 || v.isEuler) {
    const vector = value as THREE.Vector3;
    out.push(vector.x);
    out.push(vector.y);
    out.push(vector.z);
  } else if (v.isVector4 || v.isQuaternion) {
    const vector = value as THREE.Vector4;
    out.push(vector.x);
    out.push(vector.y);
    out.push(vector.z);
    out.push(vector.w);
  } else if (v.isMatrix3 || v.isMatrix4) {
    const elements = (value as THREE.Matrix4).elements;
    for (let i = 0; i < elements.length; i += 1) out.push(elements[i]!);
  } else if (v.isTexture) {
    writeTexture(out, value as THREE.Texture);
  } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const list = value as ArrayLike<unknown>;
    out.push(list.length);
    for (let i = 0; i < list.length; i += 1) writeValue(out, list[i], depth + 1);
  } else if ("value" in v) {
    // A shader uniform.
    writeValue(out, v.value, depth + 1);
  }
}

function writeUniforms(
  out: SceneSignature,
  uniforms: unknown,
  injectedOnly: boolean,
) {
  if (!uniforms || typeof uniforms !== "object") return;
  const record = uniforms as Record<string, { value?: unknown } | undefined>;
  for (const key of Object.keys(record)) {
    if (injectedOnly && isBuiltInUniform(key)) continue;
    writeValue(out, record[key]?.value);
  }
}

function writeMaterial(out: SceneSignature, material: THREE.Material) {
  out.push(materialId(material));
  if (out.seen.has(material)) return;
  out.seen.add(material);
  out.push(material.version);
  const record = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === "uniforms") {
      // A ShaderMaterial's uniforms are all its own.
      writeUniforms(out, record.uniforms, false);
      continue;
    }
    if (key === "userData") {
      // The paper material keeps its motion accent in userData and in the
      // compiled program's uniforms (captured at onBeforeCompile).
      const userData = record.userData as Record<string, unknown>;
      for (const dataKey of Object.keys(userData)) {
        const data = userData[dataKey];
        if (data && typeof data === "object" && "uniforms" in data) {
          writeUniforms(out, (data as { uniforms: unknown }).uniforms, true);
        } else {
          writeValue(out, data);
        }
      }
      continue;
    }
    writeValue(out, record[key]);
  }
}

function writeGeometry(out: SceneSignature, geometry: THREE.BufferGeometry) {
  out.push(geometry.id);
  const index = geometry.index;
  if (index) {
    out.push(objectId(index));
    out.push(index.version);
    out.push(index.count);
  } else {
    out.push(NONE);
  }
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.attributes[name] as
      | THREE.BufferAttribute
      | THREE.InterleavedBufferAttribute;
    out.string(name);
    out.push(objectId(attribute));
    if ("isInterleavedBufferAttribute" in attribute) {
      out.push(objectId(attribute.data));
      out.push(attribute.data.version);
      out.push(attribute.data.stride);
      out.push(attribute.offset);
    } else {
      out.push(attribute.version);
    }
    out.push(attribute.count);
    out.push(attribute.itemSize);
    out.push(attribute.normalized ? 1 : 0);
  }
  out.push(geometry.drawRange.start);
  out.push(geometry.drawRange.count);
  out.push(geometry.groups.length);
  for (const group of geometry.groups) {
    out.push(group.start);
    out.push(group.count);
    out.push(group.materialIndex ?? 0);
  }
}

/** A world or projection matrix. The translation column (elements 12–14)
    is in CSS px already; every other coefficient multiplies coordinates of
    at most `reach` px, so it is recorded multiplied by `reach`: its change,
    like a translation's, then reads as distance moved. */
function writeMatrix(out: SceneSignature, matrix: THREE.Matrix4, reach: number) {
  const elements = matrix.elements;
  const scale = Math.max(1, reach);
  for (let i = 0; i < 16; i += 1) {
    out.push(i >= 12 && i <= 14 ? elements[i]! : elements[i]! * scale);
  }
}

/** How far a geometry's farthest vertex lies from its origin, re-measured
    whenever anything its position reads change: the attribute, the storage
    it interleaves into, their layout, or an upload. */
interface Reach {
  position: object;
  storage: object;
  version: number;
  count: number;
  itemSize: number;
  normalized: boolean;
  offset: number;
  stride: number;
  reach: number;
}
const reaches = new WeakMap<THREE.BufferGeometry, Reach>();
function geometryReach(geometry: THREE.BufferGeometry): number {
  const position = geometry.attributes.position as
    | THREE.BufferAttribute
    | THREE.InterleavedBufferAttribute
    | undefined;
  if (!position) return 0;
  const interleaved = "isInterleavedBufferAttribute" in position;
  const storage = interleaved ? position.data : position;
  const layout = {
    position,
    storage,
    version: storage.version,
    count: position.count,
    itemSize: position.itemSize,
    normalized: position.normalized,
    offset: interleaved ? position.offset : 0,
    stride: interleaved ? position.data.stride : position.itemSize,
  };
  const known = reaches.get(geometry);
  if (
    known &&
    known.position === layout.position &&
    known.storage === layout.storage &&
    known.version === layout.version &&
    known.count === layout.count &&
    known.itemSize === layout.itemSize &&
    known.normalized === layout.normalized &&
    known.offset === layout.offset &&
    known.stride === layout.stride
  ) {
    return known.reach;
  }
  let farthest = 0;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const squared = x * x + y * y + z * z;
    if (squared > farthest) farthest = squared;
  }
  const reach = Math.sqrt(farthest);
  reaches.set(geometry, { ...layout, reach });
  return reach;
}

type Drawable = THREE.Mesh & {
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
  count?: number;
  instanceMatrix?: THREE.BufferAttribute;
  instanceColor?: THREE.BufferAttribute | null;
};

const isDrawable = (object: THREE.Object3D): object is Drawable => {
  const drawable = object as Drawable;
  return Boolean(
    drawable.isMesh || drawable.isLine || drawable.isPoints || drawable.isSprite,
  );
};

/** Phase one: what moves. Invisible subtrees are neither drawn nor cast
    shadows, so only visible objects are recorded; one appearing or vanishing
    changes the record's shape. A group's own transform needs no record: it
    reaches the screen only through its children's world matrices. */
function writeMotion(out: SceneSignature, object: THREE.Object3D) {
  out.push(object.id);
  out.push(object.renderOrder);
  out.push(object.frustumCulled ? 1 : 0);
  out.push(object.castShadow ? 1 : 0);
  out.push(object.receiveShadow ? 1 : 0);
  out.push(object.layers.mask);
  if ((object as THREE.Light).isLight) {
    writeMatrix(out, object.matrixWorld, LIGHT_REACH_PX);
    return;
  }
  if (!isDrawable(object)) return;
  // |ΔM·v| ≤ 3 · max|Δm| · |v| for the 3×3 part.
  writeMatrix(
    out,
    object.matrixWorld,
    object.geometry ? 3 * geometryReach(object.geometry) : 0,
  );
  if (object.geometry) writeGeometry(out, object.geometry);
  if (object.morphTargetInfluences) writeValue(out, object.morphTargetInfluences);
  if (object.instanceMatrix) {
    out.push(object.instanceMatrix.version);
    out.push(object.count ?? 0);
    out.push(object.instanceColor ? object.instanceColor.version : NONE);
  }
}

/** Phase two: how it looks. */
function writeAppearance(out: SceneSignature, object: THREE.Object3D) {
  if (isDrawable(object)) {
    const material = object.material;
    if (Array.isArray(material)) {
      out.push(material.length);
      for (const entry of material) writeMaterial(out, entry);
    } else if (material) {
      writeMaterial(out, material);
    }
  }

  const light = object as THREE.Light & {
    isRectAreaLight?: boolean;
    width?: number;
    height?: number;
    target?: THREE.Object3D;
    shadow?: THREE.LightShadow<THREE.Camera>;
  };
  if (!light.isLight) return;
  out.push(light.id);
  out.push(light.intensity);
  writeValue(out, light.color);
  if (light.isRectAreaLight) {
    out.push(light.width ?? 0);
    out.push(light.height ?? 0);
  }
  if (light.target) writeValue(out, light.target.position);
  const shadow = light.shadow;
  if (shadow) {
    out.push(shadow.bias);
    out.push(shadow.normalBias);
    out.push(shadow.radius);
    out.push(shadow.blurSamples);
    out.push(shadow.mapSize.x);
    out.push(shadow.mapSize.y);
    const camera = shadow.camera as THREE.OrthographicCamera &
      THREE.PerspectiveCamera;
    writeValue(out, camera.projectionMatrix);
    out.push(camera.left ?? 0);
    out.push(camera.right ?? 0);
    out.push(camera.top ?? 0);
    out.push(camera.bottom ?? 0);
    out.push(camera.near);
    out.push(camera.far);
  }
}

/** Records phase one — the drawing surface, the camera, and visible
    objects' transforms and geometry — into `out`, updating world matrices
    exactly as a draw would first. */
export function recordSceneMotion(
  out: SceneSignature,
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
) {
  out.reset();
  out.push(gl.getPixelRatio());
  out.push(gl.domElement.width);
  out.push(gl.domElement.height);
  out.push(gl.localClippingEnabled ? 1 : 0);
  out.push(gl.clippingPlanes.length);

  if (camera.parent === null && camera.matrixWorldAutoUpdate) {
    camera.updateMatrixWorld();
  }
  // Everything drawn lies within the far plane of the camera.
  const far = (camera as THREE.PerspectiveCamera).far ?? 0;
  const cameraReach = Number.isFinite(far) && far > 0 ? 3 * far : 1e6;
  writeMatrix(out, camera.matrixWorld, cameraReach);
  writeMatrix(out, camera.projectionMatrix, cameraReach);

  if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
  scene.traverseVisible((object) => writeMotion(out, object));
}

/** Records phase two — renderer output state, scene backdrop, materials,
    uniforms, lights. */
export function recordSceneAppearance(
  out: SceneSignature,
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
) {
  out.reset();
  out.push(gl.toneMapping);
  out.push(gl.toneMappingExposure);
  out.string(gl.outputColorSpace);
  out.push(gl.getClearAlpha());
  gl.getClearColor(scratchColor);
  writeValue(out, scratchColor);
  out.push(gl.shadowMap.enabled ? 1 : 0);
  out.push(gl.shadowMap.type);
  writeValue(out, scene.background);
  writeValue(out, scene.environment);
  writeValue(out, scene.overrideMaterial ? materialId(scene.overrideMaterial) : null);
  const fog = scene.fog as (THREE.Fog & THREE.FogExp2) | null;
  if (fog) {
    writeValue(out, fog.color);
    writeValue(out, fog.near);
    writeValue(out, fog.far);
    writeValue(out, fog.density);
  }
  scene.traverseVisible((object) => writeAppearance(out, object));
}

/** True when `next` differs from `previous[offset…]` anywhere by more than
    `tolerance` (0: exactly; NaN matches NaN; a length change is a difference). */
export function signatureChanged(
  previous: Float64Array,
  offset: number,
  previousLength: number,
  next: readonly number[],
  tolerance = 0,
): boolean {
  if (previousLength !== next.length) return true;
  for (let i = 0; i < previousLength; i += 1) {
    const a = previous[offset + i]!;
    const b = next[i]!;
    if (a === b) continue;
    if (a !== a && b !== b) continue;
    if (!(Math.abs(a - b) <= tolerance)) return true;
  }
  return false;
}

/** Draws a frame whose world matrices recordSceneMotion just refreshed.
    `gl.render` would recompose every matrix again first; nothing has moved
    since, so that second pass is switched off for this one draw. */
function drawRecorded(state: {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}) {
  const { gl, scene, camera } = state;
  const sceneAuto = scene.matrixWorldAutoUpdate;
  const cameraAuto = camera.matrixWorldAutoUpdate;
  scene.matrixWorldAutoUpdate = false;
  camera.matrixWorldAutoUpdate = false;
  try {
    gl.render(scene, camera);
  } finally {
    scene.matrixWorldAutoUpdate = sceneAuto;
    camera.matrixWorldAutoUpdate = cameraAuto;
  }
}

interface DrawnFrame {
  /** Phase-one values, then (when `appearanceLength` ≥ 0) phase-two values. */
  values: Float64Array;
  motionLength: number;
  /** -1 when the frame was drawn on phase one alone. */
  appearanceLength: number;
}

function store(frame: DrawnFrame, motion: number[], appearance: number[] | null) {
  const total = motion.length + (appearance ? appearance.length : 0);
  if (frame.values.length < total) {
    frame.values = new Float64Array(Math.ceil(total * 1.25));
  }
  for (let i = 0; i < motion.length; i += 1) frame.values[i] = motion[i]!;
  if (appearance) {
    for (let i = 0; i < appearance.length; i += 1) {
      frame.values[motion.length + i] = appearance[i]!;
    }
  }
  frame.motionLength = motion.length;
  frame.appearanceLength = appearance ? appearance.length : -1;
}

/** What a frame draws with. */
export interface GateFrame {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

/** Decides, frame by frame, whether the canvas needs drawing, and draws it. */
export class RenderGate {
  private readonly motion = new SceneSignature();
  private readonly appearance = new SceneSignature();
  private readonly drawn: DrawnFrame = {
    values: new Float64Array(0),
    motionLength: -1,
    appearanceLength: -1,
  };

  /** Draws on the next frame, whatever it records: after a context restore
      the drawing buffer no longer holds the last frame drawn. */
  invalidate() {
    this.drawn.motionLength = -1;
  }

  /** Runs one frame; true when it drew. `always` draws unconditionally, for
      continuously animated modes, where there is never a frame to skip. */
  frame(state: GateFrame, always = false): boolean {
    const last = this.drawn;
    if (always) {
      state.gl.render(state.scene, state.camera);
      last.motionLength = -1;
      return true;
    }

    const moved = this.motion;
    recordSceneMotion(moved, state.gl, state.scene, state.camera);
    if (
      last.motionLength < 0 ||
      signatureChanged(
        last.values,
        0,
        last.motionLength,
        moved.values,
        MOTION_EPSILON,
      )
    ) {
      drawRecorded(state);
      store(last, moved.values, null);
      return true;
    }

    const looks = this.appearance;
    recordSceneAppearance(looks, state.gl, state.scene);
    if (
      last.appearanceLength < 0 ||
      signatureChanged(
        last.values,
        last.motionLength,
        last.appearanceLength,
        looks.values,
      )
    ) {
      drawRecorded(state);
      store(last, moved.values, looks.values);
      return true;
    }
    return false;
  }
}

/** Owns the canvas draw and renders only when the scene's inputs changed. A
    positive useFrame priority tells R3F to leave rendering to this callback;
    every other frame callback (priority ≤ 0) still runs first, every frame.
    `always` restores an unconditional draw for continuously animated modes. */
export function RenderOnChange({ always = false }: { always?: boolean }) {
  const gl = useThree((state) => state.gl);
  const [gate] = useState(() => new RenderGate());

  useEffect(() => {
    const canvas = gl.domElement;
    const invalidate = () => gate.invalidate();
    canvas.addEventListener("webglcontextrestored", invalidate);
    return () => canvas.removeEventListener("webglcontextrestored", invalidate);
  }, [gate, gl]);

  useFrame((state) => {
    gate.frame(state, always);
  }, 1);

  return null;
}
