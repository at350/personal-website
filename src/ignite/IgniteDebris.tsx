import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { BurnField } from "./burnField";

export const DEFAULT_SETTLED_ASH_COUNT = 500;
export const MAX_SETTLED_ASH_COUNT = 560;
export const DEFAULT_SETTLED_FIBRE_COUNT = 176;
export const MAX_SETTLED_FIBRE_COUNT = 176;
export const DEFAULT_ATTACHED_REMNANT_COUNT = 96;
export const MAX_LATENT_REMNANT_FRACTION = 0.25;

const RESIDUE_WIDTH = 256;
const RESIDUE_HEIGHT = 170;
// Settled residue changes on the timescale of whole sheets charring, not
// frames. Ten hertz is indistinguishable on a static deposit and cuts the
// reconstruction pass and its texture upload to a third.
const RESIDUE_FIXED_STEP = 1 / 10;

export interface IgniteDebrisProps {
  field: BurnField;
  burnMap: THREE.DataTexture;
  pw: number;
  ph: number;
  tableZ: number;
  reducedMotion: boolean;
  fragmentCount?: number;
}

export interface ClusteredAshLayout {
  sourceUv: Float32Array;
  scatter: Float32Array;
  scale: Float32Array;
  rotation: Float32Array;
  threshold: Float32Array;
  seed: Float32Array;
  tone: Float32Array;
  lift: Float32Array;
  cluster: Uint8Array;
}

export interface AttachedRemnantLayout {
  sourceUv: Float32Array;
  scale: Float32Array;
  seed: Float32Array;
  tone: Float32Array;
  gate: Float32Array;
}

export interface ResidueTextureState {
  width: number;
  height: number;
  density: Float32Array;
  bytes: Uint8Array;
  /** Reused working buffers keep the 30 Hz residue pass allocation-free. */
  target: Float32Array;
  scratch: Float32Array;
}

export interface SettledFibreLayout {
  sourceUv: Float32Array;
  scale: Float32Array;
  rotation: Float32Array;
  bend: Float32Array;
  threshold: Float32Array;
  seed: Float32Array;
  tone: Float32Array;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    let value = (state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deterministic overscanned tabletop layout. Source positions cover the
 * magazine but land in broad clusters with a few fragments beyond its former
 * silhouette. The GPU reveals them only when local conserved residue exists.
 */
export function createClusteredAshLayout(
  requestedCount = DEFAULT_SETTLED_ASH_COUNT,
  randomSeed = 0x1a71de8,
): ClusteredAshLayout {
  const count = Math.min(
    MAX_SETTLED_ASH_COUNT,
    Math.max(0, Math.floor(requestedCount)),
  );
  const sourceUv = new Float32Array(count * 2);
  const scatter = new Float32Array(count * 2);
  const scale = new Float32Array(count * 2);
  const rotation = new Float32Array(count);
  const threshold = new Float32Array(count);
  const seed = new Float32Array(count);
  const tone = new Float32Array(count);
  const lift = new Float32Array(count);
  const cluster = new Uint8Array(count);
  const random = mulberry32(randomSeed);
  const clusterCount = 15;

  for (let index = 0; index < count; index += 1) {
    const clusterIndex = index % clusterCount;
    // Keep the source anchors inside the original magazine footprint. Their
    // landing offsets can spill beyond it, but every clump is backed by actual
    // conserved residue instead of a random screen-space emitter.
    const clusterU = 0.12 +
      ((clusterIndex * 0.61803398875 + 0.09) % 1) * 0.76;
    const clusterV = 0.1 +
      ((clusterIndex * 0.41421356237 + 0.13) % 1) * 0.8;
    const offset = index * 2;
    sourceUv[offset] = THREE.MathUtils.clamp(
      clusterU + (random() + random() + random() - 1.5) * 0.036,
      0.105,
      0.895,
    );
    sourceUv[offset + 1] = THREE.MathUtils.clamp(
      clusterV + (random() + random() + random() - 1.5) * 0.034,
      0.085,
      0.915,
    );
    const angle = random() * Math.PI * 2;
    const distance = Math.pow(random(), 2.2) * (0.004 + random() * 0.025);
    scatter[offset] = Math.cos(angle) * distance;
    scatter[offset + 1] = Math.sin(angle) * distance;
    // Most of the deposit is fine grit; a short tail of larger, curled carbon
    // pieces keeps it recognisably made from paper rather than dust alone.
    const size = 0.003 + Math.pow(random(), 2.0) * 0.0252;
    scale[offset] = size;
    scale[offset + 1] = size * (0.28 + random() * 0.67);
    rotation[index] = random() * Math.PI * 2;
    // Fragments accumulate across the whole burn: the first pieces settle
    // shortly after a spot's first sheet is consumed and the tail keeps
    // arriving as deeper leaves go, so the deposit visibly grows with the
    // fire instead of appearing all at once at the terminal state. The
    // non-zero floor still keeps chips off freshly singed paper.
    threshold[index] = 0.02 + Math.pow(random(), 1.8) * 0.46;
    seed[index] = random();
    tone[index] = random();
    lift[index] = 0.0008 + random() * 0.005;
    cluster[index] = clusterIndex;
  }
  return {
    sourceUv,
    scatter,
    scale,
    rotation,
    threshold,
    seed,
    tone,
    lift,
    cluster,
  };
}

export function createSettledFibreLayout(
  requestedCount = DEFAULT_SETTLED_FIBRE_COUNT,
  randomSeed = 0xf1b3a51,
): SettledFibreLayout {
  const count = Math.min(
    MAX_SETTLED_FIBRE_COUNT,
    Math.max(0, Math.floor(requestedCount)),
  );
  const sourceUv = new Float32Array(count * 2);
  const scale = new Float32Array(count * 2);
  const rotation = new Float32Array(count);
  const bend = new Float32Array(count);
  const threshold = new Float32Array(count);
  const seed = new Float32Array(count);
  const tone = new Float32Array(count);
  const random = mulberry32(randomSeed);
  const clusterCount = 13;

  for (let index = 0; index < count; index += 1) {
    const clusterIndex = index % clusterCount;
    const clusterU = 0.13 +
      ((clusterIndex * 0.754877666 + 0.07) % 1) * 0.74;
    const clusterV = 0.105 +
      ((clusterIndex * 0.569840296 + 0.19) % 1) * 0.79;
    const offset = index * 2;
    sourceUv[offset] = THREE.MathUtils.clamp(
      clusterU + (random() + random() - 1) * 0.048,
      0.105,
      0.895,
    );
    sourceUv[offset + 1] = THREE.MathUtils.clamp(
      clusterV + (random() + random() - 1) * 0.045,
      0.085,
      0.915,
    );
    scale[offset] = 0.019 + Math.pow(random(), 1.4) * 0.066;
    scale[offset + 1] = 0.0016 + random() * 0.0045;
    rotation[index] = random() * Math.PI * 2;
    bend[index] = (random() * 2 - 1) * (0.16 + random() * 0.34);
    threshold[index] = 0.02 + Math.pow(random(), 1.6) * 0.46;
    seed[index] = random();
    tone[index] = random();
  }
  return { sourceUv, scale, rotation, bend, threshold, seed, tone };
}

export function createAttachedRemnantLayout(
  requestedCount = DEFAULT_ATTACHED_REMNANT_COUNT,
  randomSeed = 0x71c4a12,
): AttachedRemnantLayout {
  const count = Math.max(0, Math.floor(requestedCount));
  const sourceUv = new Float32Array(count * 2);
  const scale = new Float32Array(count * 2);
  const seed = new Float32Array(count);
  const tone = new Float32Array(count);
  const gate = new Float32Array(count);
  const random = mulberry32(randomSeed);
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * 1.5)));
  const rows = Math.max(1, Math.ceil(count / columns));
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const offset = index * 2;
    sourceUv[offset] = (column + 0.18 + random() * 0.64) / columns;
    sourceUv[offset + 1] = (row + 0.18 + random() * 0.64) / rows;
    scale[offset] = 0.018 + Math.pow(random(), 1.3) * 0.052;
    scale[offset + 1] = 0.003 + random() * 0.011;
    seed[index] = random();
    tone[index] = random();
    gate[index] = random() < MAX_LATENT_REMNANT_FRACTION ? 1 : 0;
  }
  return { sourceUv, scale, seed, tone, gate };
}

export function createResidueTextureState(
  width = RESIDUE_WIDTH,
  height = RESIDUE_HEIGHT,
): ResidueTextureState {
  return {
    width,
    height,
    density: new Float32Array(width * height),
    bytes: new Uint8Array(width * height),
    target: new Float32Array(width * height),
    scratch: new Float32Array(width * height),
  };
}

function sampleResidueRatio(field: BurnField, u: number, v: number) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const x = u * (field.width - 1);
  const y = v * (field.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(field.width - 1, x0 + 1);
  const y1 = Math.min(field.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const ratioAt = (sampleX: number, sampleY: number) => {
    const index = sampleY * field.width + sampleX;
    const capacity = field.capacity[index] ?? 0;
    return capacity > 0 ? (field.residue[index] ?? 0) / capacity : 0;
  };
  const top = THREE.MathUtils.lerp(ratioAt(x0, y0), ratioAt(x1, y0), tx);
  const bottom = THREE.MathUtils.lerp(ratioAt(x0, y1), ratioAt(x1, y1), tx);
  return THREE.MathUtils.lerp(top, bottom, ty);
}

/**
 * Conserved residue is reconstructed as a persistent tabletop deposit. A
 * bilinear gather removes simulation-cell stair steps; one compact dilation
 * joins neighbouring fibres into clumps without inventing drifting particles.
 */
export function updateResidueTextureState(
  state: ResidueTextureState,
  field: BurnField,
) {
  state.target.fill(0);
  for (let y = 0; y < state.height; y += 1) {
    const v = (y + 0.5) / state.height;
    const sourceV = (v - 0.5) * 1.22 + 0.5;
    for (let x = 0; x < state.width; x += 1) {
      const u = (x + 0.5) / state.width;
      const sourceU = (u - 0.5) * 1.275 + 0.5;
      const index = y * state.width + x;
      const ratio = sampleResidueRatio(field, sourceU, sourceV);
      // Capacity spans the entire local stack while residue yield is only a
      // few percent per sheet, so the raw ratio is deliberately tiny. Lift it
      // into a useful visual range without flattening it; the shader's island
      // mask, not saturation, is what prevents a page-shaped deposit.
      state.target[index] = THREE.MathUtils.clamp(ratio * 92, 0, 1);
    }
  }

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const index = y * state.width + x;
      let weighted = (state.target[index] ?? 0) * 0.56;
      let strongest = state.target[index] ?? 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        const sy = Math.min(state.height - 1, Math.max(0, y + oy));
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) continue;
          const sx = Math.min(state.width - 1, Math.max(0, x + ox));
          const sample = state.target[sy * state.width + sx] ?? 0;
          weighted += sample * (ox === 0 || oy === 0 ? 0.055 : 0.0275);
          strongest = Math.max(strongest, sample);
        }
      }
      state.scratch[index] = Math.max(weighted, strongest * 0.62);
    }
  }

  for (let index = 0; index < state.density.length; index += 1) {
    const prior = state.density[index] ?? 0;
    // Settled ash is persistent. It does not fade or fall off the screen.
    const next = Math.max(prior, state.scratch[index] ?? 0);
    state.density[index] = next;
    state.bytes[index] = Math.round(THREE.MathUtils.clamp(next, 0, 1) * 255);
  }
}

export function makeSettledAshGeometry(count: number) {
  const boundedCount = Math.min(
    MAX_SETTLED_ASH_COUNT,
    Math.max(0, Math.floor(count)),
  );
  const layout = createClusteredAshLayout(boundedCount);
  const geometry = new THREE.InstancedBufferGeometry();
  const positions = new Float32Array([
    0, 0, 0,
    -0.75, -0.12, 0.05,
    -0.28, -0.82, -0.04,
    0.48, -0.7, 0.03,
    0.82, -0.08, -0.03,
    0.31, 0.76, 0.06,
    -0.56, 0.61, -0.02,
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute(
    "aCorner",
    new THREE.BufferAttribute(new Float32Array([0.5, 1, 2, 3, 4, 5, 6]), 1),
  );
  geometry.setIndex([
    0, 1, 2, 0, 2, 3, 0, 3, 4,
    0, 4, 5, 0, 5, 6, 0, 6, 1,
  ]);
  geometry.setAttribute(
    "aSourceUv",
    new THREE.InstancedBufferAttribute(layout.sourceUv, 2),
  );
  geometry.setAttribute(
    "aScatter",
    new THREE.InstancedBufferAttribute(layout.scatter, 2),
  );
  geometry.setAttribute(
    "aScale",
    new THREE.InstancedBufferAttribute(layout.scale, 2),
  );
  geometry.setAttribute(
    "aRotation",
    new THREE.InstancedBufferAttribute(layout.rotation, 1),
  );
  geometry.setAttribute(
    "aThreshold",
    new THREE.InstancedBufferAttribute(layout.threshold, 1),
  );
  geometry.setAttribute(
    "aSeed",
    new THREE.InstancedBufferAttribute(layout.seed, 1),
  );
  geometry.setAttribute(
    "aTone",
    new THREE.InstancedBufferAttribute(layout.tone, 1),
  );
  geometry.setAttribute(
    "aLift",
    new THREE.InstancedBufferAttribute(layout.lift, 1),
  );
  geometry.instanceCount = boundedCount;
  geometry.computeBoundingSphere();
  return geometry;
}

export function makeSettledFibreGeometry(
  count = DEFAULT_SETTLED_FIBRE_COUNT,
) {
  const boundedCount = Math.min(
    MAX_SETTLED_FIBRE_COUNT,
    Math.max(0, Math.floor(count)),
  );
  const layout = createSettledFibreLayout(boundedCount);
  const geometry = new THREE.InstancedBufferGeometry();
  const segments = 9;
  const positions = new Float32Array(segments * 2 * 3);
  const along = new Float32Array(segments * 2);
  const across = new Float32Array(segments * 2);
  const indices: number[] = [];
  for (let segment = 0; segment < segments; segment += 1) {
    const progress = segment / (segments - 1);
    for (let side = 0; side < 2; side += 1) {
      const vertex = segment * 2 + side;
      positions[vertex * 3] = progress - 0.5;
      positions[vertex * 3 + 1] = side === 0 ? -0.5 : 0.5;
      along[vertex] = progress;
      across[vertex] = side === 0 ? -1 : 1;
    }
    if (segment + 1 < segments) {
      const a = segment * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aAlong", new THREE.BufferAttribute(along, 1));
  geometry.setAttribute("aAcross", new THREE.BufferAttribute(across, 1));
  geometry.setIndex(indices);
  geometry.setAttribute(
    "aSourceUv",
    new THREE.InstancedBufferAttribute(layout.sourceUv, 2),
  );
  geometry.setAttribute(
    "aScale",
    new THREE.InstancedBufferAttribute(layout.scale, 2),
  );
  geometry.setAttribute(
    "aRotation",
    new THREE.InstancedBufferAttribute(layout.rotation, 1),
  );
  geometry.setAttribute(
    "aBend",
    new THREE.InstancedBufferAttribute(layout.bend, 1),
  );
  geometry.setAttribute(
    "aThreshold",
    new THREE.InstancedBufferAttribute(layout.threshold, 1),
  );
  geometry.setAttribute(
    "aSeed",
    new THREE.InstancedBufferAttribute(layout.seed, 1),
  );
  geometry.setAttribute(
    "aTone",
    new THREE.InstancedBufferAttribute(layout.tone, 1),
  );
  geometry.instanceCount = boundedCount;
  geometry.computeBoundingSphere();
  return geometry;
}

function makeAttachedRemnantGeometry(count: number) {
  const layout = createAttachedRemnantLayout(count);
  const geometry = new THREE.InstancedBufferGeometry();
  const segments = 8;
  const positions = new Float32Array(segments * 2 * 3);
  const along = new Float32Array(segments * 2);
  const across = new Float32Array(segments * 2);
  const indices: number[] = [];
  for (let segment = 0; segment < segments; segment += 1) {
    const progress = segment / (segments - 1);
    for (let side = 0; side < 2; side += 1) {
      const vertex = segment * 2 + side;
      positions[vertex * 3] = progress - 0.5;
      positions[vertex * 3 + 1] = side === 0 ? -0.5 : 0.5;
      along[vertex] = progress;
      across[vertex] = side === 0 ? -1 : 1;
    }
    if (segment + 1 < segments) {
      const a = segment * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aAlong", new THREE.BufferAttribute(along, 1));
  geometry.setAttribute("aAcross", new THREE.BufferAttribute(across, 1));
  geometry.setIndex(indices);
  geometry.setAttribute(
    "aSourceUv",
    new THREE.InstancedBufferAttribute(layout.sourceUv, 2),
  );
  geometry.setAttribute(
    "aScale",
    new THREE.InstancedBufferAttribute(layout.scale, 2),
  );
  geometry.setAttribute(
    "aSeed",
    new THREE.InstancedBufferAttribute(layout.seed, 1),
  );
  geometry.setAttribute(
    "aTone",
    new THREE.InstancedBufferAttribute(layout.tone, 1),
  );
  geometry.setAttribute(
    "aGate",
    new THREE.InstancedBufferAttribute(layout.gate, 1),
  );
  geometry.instanceCount = count;
  geometry.computeBoundingSphere();
  return geometry;
}

const ASH_VERTEX = /* glsl */ `
  attribute float aCorner;
  attribute vec2 aSourceUv;
  attribute vec2 aScatter;
  attribute vec2 aScale;
  attribute float aRotation;
  attribute float aThreshold;
  attribute float aSeed;
  attribute float aTone;
  attribute float aLift;
  uniform sampler2D uResidue;
  uniform vec2 uPageSize;
  uniform float uTableZ;
  uniform float uReducedMotion;
  uniform float uTime;
  varying float vPresence;
  varying float vTone;
  varying float vFibre;

  float ashHash(float value) {
    return fract(sin(value * 91.713 + 17.31) * 43758.5453);
  }

  void main() {
    float residue = texture2D(uResidue, aSourceUv).r;
    float presence = smoothstep(aThreshold, min(.985, aThreshold + .085), residue);
    float pageUnit = min(uPageSize.x, uPageSize.y);
    vec2 local = position.xy;
    float corner = ashHash(aSeed * 83.0 + aCorner * 4.7);
    // Wide per-corner variance keeps the brittle fragments visibly irregular
    // rather than reading as one repeated hexagonal die-cut.
    local *= aScale * pageUnit * (.5 + corner * .95) * smoothstep(0.0, .13, presence);

    // One low toss, a damped tumble, then a stable table-aligned fragment.
    float birth = aThreshold + aSeed * .045;
    float age = max(0.0, residue - birth);
    // A sub-second lift as the supporting fibre fails, then permanent rest.
    // The low arc reads as material collapsing onto a table, never confetti.
    float flight = min(1.0, age * 17.0) * (1.0 - uReducedMotion);
    float hop = sin(flight * 3.14159265) * (1.0 - flight) *
      (0.8 + aSeed * 2.4);
    float spin = aRotation + flight * (0.35 + aSeed * 1.4) +
      sin(uTime * 1.7 + aSeed * 17.0) * (1.0 - flight) * .025;
    mat2 rotate = mat2(cos(spin), -sin(spin), sin(spin), cos(spin));
    local = rotate * local;
    vec2 source = vec2(
      (aSourceUv.x * 2.0 - 1.0) * uPageSize.x * 1.22,
      (aSourceUv.y - .5) * uPageSize.y * 1.16
    );
    vec2 landing = source + aScatter * uPageSize;
    vec2 centre = mix(source, landing, smoothstep(.04, .74, flight));
    float fold = sin((position.x + .75) * 2.1) * aLift * pageUnit;
    vec3 transformed = vec3(
      centre + local,
      uTableZ + .14 + hop + abs(fold) * presence
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    vPresence = presence;
    vTone = aTone;
    vFibre = corner;
  }
`;

const ASH_FRAGMENT = /* glsl */ `
  varying float vPresence;
  varying float vTone;
  varying float vFibre;
  void main() {
    if (vPresence < .025) discard;
    vec3 blackChar = vec3(.028, .023, .019);
    vec3 brownChar = vec3(.22, .17, .135);
    vec3 greyAsh = vec3(.48, .455, .42);
    float pale = smoothstep(.24, .94, vTone * .7 + vFibre * .3);
    vec3 color = mix(blackChar, brownChar, smoothstep(.04, .56, vTone));
    color = mix(color, greyAsh, pale * pale * .72);
    gl_FragColor = vec4(color, vPresence);
  }
`;

const FIBRE_VERTEX = /* glsl */ `
  attribute float aAlong;
  attribute float aAcross;
  attribute vec2 aSourceUv;
  attribute vec2 aScale;
  attribute float aRotation;
  attribute float aBend;
  attribute float aThreshold;
  attribute float aSeed;
  attribute float aTone;
  uniform sampler2D uResidue;
  uniform vec2 uPageSize;
  uniform float uTableZ;
  varying float vPresence;
  varying float vTone;
  varying float vAlong;
  varying float vAcross;

  void main() {
    float residue = texture2D(uResidue, aSourceUv).r;
    float presence = smoothstep(aThreshold, min(.985, aThreshold + .09), residue);
    float pageUnit = min(uPageSize.x, uPageSize.y);
    float taper = .22 + .78 * sin(aAlong * 3.14159265);
    float torn = 1.0 + sin(aAlong * 41.0 + aSeed * 23.0) * .22;
    vec2 local = vec2(
      (aAlong - .5) * aScale.x,
      aAcross * aScale.y * taper * torn +
        aBend * (aAlong - .5) * (aAlong - .5) * aScale.x
    ) * pageUnit;
    float angle = aRotation + sin(aAlong * 8.0 + aSeed * 13.0) * .065;
    mat2 rotate = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    local = rotate * local;
    vec2 centre = vec2(
      (aSourceUv.x * 2.0 - 1.0) * uPageSize.x * 1.275,
      (aSourceUv.y - .5) * uPageSize.y * 1.22
    );
    float arch = sin(aAlong * 3.14159265) * aScale.y * pageUnit *
      (.34 + aSeed * .36);
    vec3 transformed = vec3(
      centre + local * smoothstep(0.0, .12, presence),
      uTableZ + .19 + arch * presence
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    vPresence = presence;
    vTone = aTone;
    vAlong = aAlong;
    vAcross = aAcross;
  }
`;

const FIBRE_FRAGMENT = /* glsl */ `
  varying float vPresence;
  varying float vTone;
  varying float vAlong;
  varying float vAcross;
  void main() {
    if (vPresence < .025) discard;
    float rag = .75 + .25 * sin(vAlong * 63.0 + vAcross * 7.0);
    vec3 carbon = mix(vec3(.025, .021, .017), vec3(.42, .39, .35),
      vTone * .62 + rag * .16);
    gl_FragColor = vec4(carbon, vPresence * .96);
  }
`;

const REMNANT_VERTEX = /* glsl */ `
  attribute float aAlong;
  attribute float aAcross;
  attribute vec2 aSourceUv;
  attribute vec2 aScale;
  attribute float aSeed;
  attribute float aTone;
  attribute float aGate;
  uniform sampler2D uBurnMap;
  uniform vec2 uPageSize;
  uniform vec2 uFieldSize;
  varying float vPresence;
  varying float vTone;
  varying float vHeat;
  varying float vFold;
  void main() {
    vec2 texel = 1.0 / uFieldSize;
    vec4 centreBurn = texture2D(uBurnMap, aSourceUv);
    float left = texture2D(uBurnMap, aSourceUv - vec2(texel.x, 0.0)).r;
    float right = texture2D(uBurnMap, aSourceUv + vec2(texel.x, 0.0)).r;
    float down = texture2D(uBurnMap, aSourceUv - vec2(0.0, texel.y)).r;
    float up = texture2D(uBurnMap, aSourceUv + vec2(0.0, texel.y)).r;
    vec2 gradient = vec2(right - left, up - down);
    float gradientStrength = length(gradient);
    vec2 normal = gradientStrength > .0001 ? normalize(gradient) : vec2(0.0, 1.0);
    vec2 tangent = vec2(-normal.y, normal.x);
    float activeAge = smoothstep(.24, .34, centreBurn.r) *
      (1.0 - smoothstep(.54, .69, centreBurn.r));
    // The burn map is simulation resolution, so one-texel gradients span
    // twice the material distance they used to; the gate rises to match or
    // loose chips scatter over every mild slope of the field.
    float presence = aGate * activeAge * smoothstep(.014, .085, gradientStrength) *
      smoothstep(.01, .07, centreBurn.a) * .85;
    float pageUnit = min(uPageSize.x, uPageSize.y);
    float tornWidth = aScale.y * (1.0 - .38 * abs(aAlong * 2.0 - 1.0));
    float fibre = sin(aAlong * 31.0 + aSeed * 19.0) * aScale.y * .22;
    vec2 local = tangent * ((aAlong - .5) * aScale.x * pageUnit) +
      normal * ((aAcross * tornWidth + fibre) * pageUnit);
    float arch = pow(sin(aAlong * 3.14159265), 1.25);
    local += normal * arch * aScale.y * pageUnit * (.8 + aSeed);
    vec2 source = vec2(
      (aSourceUv.x * 2.0 - 1.0) * uPageSize.x,
      (aSourceUv.y - .5) * uPageSize.y
    );
    vec3 transformed = vec3(
      source + local * smoothstep(.02, .34, presence),
      .035 + arch * aScale.x * pageUnit * (.09 + aSeed * .14) * presence
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    vPresence = presence;
    vTone = aTone;
    vHeat = centreBurn.g;
    vFold = arch;
  }
`;

const REMNANT_FRAGMENT = /* glsl */ `
  varying float vPresence;
  varying float vTone;
  varying float vHeat;
  varying float vFold;
  void main() {
    if (vPresence < .03) discard;
    vec3 carbon = mix(vec3(.018, .014, .011), vec3(.21, .185, .15),
      vTone * .34 + vFold * .18);
    carbon += vec3(.72, .095, .003) * smoothstep(.65, .94, vHeat) * .18;
    gl_FragColor = vec4(carbon, 1.0);
  }
`;

function makeShaderMaterial(
  vertexShader: string,
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
  opaque = false,
) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: !opaque,
    depthTest: true,
    depthWrite: opaque,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
}

export function IgniteDebris({
  field,
  burnMap,
  pw,
  ph,
  tableZ,
  reducedMotion,
  fragmentCount = DEFAULT_SETTLED_ASH_COUNT,
}: IgniteDebrisProps) {
  // Fine char lands on the exposed upper sheet as soon as fibres perforate.
  // Keeping the deposit plane just above the stack makes first-sheet ash
  // visible instead of hiding every fragment beneath all remaining leaves.
  const depositPlaneZ = Math.max(tableZ, -0.07);
  const residueState = useMemo(() => createResidueTextureState(), []);
  const residueTexture = useMemo(() => {
    const texture = new THREE.DataTexture(
      residueState.bytes,
      residueState.width,
      residueState.height,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }, [residueState]);
  const accumulator = useRef(0);
  const lastResidueFuel = useRef(-1);
  const residueTextureRef = useRef(residueTexture);
  const ashGeometry = useMemo(
    () => makeSettledAshGeometry(fragmentCount),
    [fragmentCount],
  );
  const ashMaterial = useMemo(
    () => makeShaderMaterial(ASH_VERTEX, ASH_FRAGMENT, {
      uResidue: { value: residueTexture },
      uPageSize: { value: new THREE.Vector2(pw, ph) },
      uTableZ: { value: depositPlaneZ },
      uReducedMotion: { value: reducedMotion ? 1 : 0 },
      uTime: { value: 0 },
    }),
    [depositPlaneZ, ph, pw, reducedMotion, residueTexture],
  );
  const fibreGeometry = useMemo(
    () => makeSettledFibreGeometry(),
    [],
  );
  const fibreMaterial = useMemo(
    () => makeShaderMaterial(FIBRE_VERTEX, FIBRE_FRAGMENT, {
      uResidue: { value: residueTexture },
      uPageSize: { value: new THREE.Vector2(pw, ph) },
      uTableZ: { value: depositPlaneZ },
    }),
    [depositPlaneZ, ph, pw, residueTexture],
  );
  const remnantGeometry = useMemo(
    () => makeAttachedRemnantGeometry(DEFAULT_ATTACHED_REMNANT_COUNT),
    [],
  );
  const remnantMaterial = useMemo(
    () => makeShaderMaterial(REMNANT_VERTEX, REMNANT_FRAGMENT, {
      uBurnMap: { value: burnMap },
      uPageSize: { value: new THREE.Vector2(pw, ph) },
      uFieldSize: { value: new THREE.Vector2(
        burnMap.image.width,
        burnMap.image.height,
      ) },
    }, true),
    [burnMap, ph, pw],
  );
  const ashMaterialRef = useRef(ashMaterial);

  useEffect(() => {
    residueTextureRef.current = residueTexture;
    ashMaterialRef.current = ashMaterial;
  }, [ashMaterial, residueTexture]);

  useFrame(({ clock }, delta) => {
    ashMaterialRef.current.uniforms.uTime.value = clock.elapsedTime;
    accumulator.current += Math.min(delta, 0.1);
    if (accumulator.current < RESIDUE_FIXED_STEP || !field.ignited) return;
    accumulator.current %= RESIDUE_FIXED_STEP;
    // Residue only grows when paper is actually consumed; a settled deposit
    // needs no reconstruction and no re-upload at all.
    if (field.burnedFuel === lastResidueFuel.current) return;
    lastResidueFuel.current = field.burnedFuel;
    updateResidueTextureState(residueState, field);
    residueTextureRef.current.needsUpdate = true;
  });

  useEffect(() => () => {
    ashGeometry.dispose();
    ashMaterial.dispose();
    fibreGeometry.dispose();
    fibreMaterial.dispose();
    remnantGeometry.dispose();
    remnantMaterial.dispose();
    residueTexture.dispose();
  }, [
    ashGeometry,
    ashMaterial,
    fibreGeometry,
    fibreMaterial,
    remnantGeometry,
    remnantMaterial,
    residueTexture,
  ]);

  return (
    <>
      <mesh
        geometry={ashGeometry}
        material={ashMaterial}
        renderOrder={41}
        frustumCulled={false}
      />
      <mesh
        geometry={fibreGeometry}
        material={fibreMaterial}
        renderOrder={42}
        frustumCulled={false}
      />
      <mesh
        geometry={remnantGeometry}
        material={remnantMaterial}
        renderOrder={43}
        frustumCulled={false}
      />
    </>
  );
}
