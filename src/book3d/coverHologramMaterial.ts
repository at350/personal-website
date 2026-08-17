import * as THREE from "three";
import {
  coverHologramFlipEnvelope,
  normalizeCoverHologramPointer,
} from "@/magazine/coverHologram";

export interface CoverHologramMaterial extends THREE.ShaderMaterial {
  uniforms: {
    uPattern: THREE.IUniform<THREE.Texture>;
    uPointer: THREE.IUniform<THREE.Vector2>;
    uFlip: THREE.IUniform<number>;
    uTilt: THREE.IUniform<number>;
    uStrength: THREE.IUniform<number>;
  };
}

export interface CoverHologramMaterialState {
  pointerX: number;
  pointerY: number;
  progress: number;
  tilt?: number;
  strength?: number;
}

/**
 * Visual contract: the foil is a moving rainbow gradient (TiltHologramCard),
 * with white glare as a specular highlight rather than the whole coating.
 *
 * Stops match the reference linear gradient:
 * #ff3b30, #ff9500, #ffcc00, #4cd964, #34aadc, #5856d6, #ff3b30
 */
export const COVER_HOLOGRAM_RAINBOW_STOPS = [
  [1.0, 0.231, 0.188],
  [1.0, 0.584, 0.0],
  [1.0, 0.8, 0.0],
  [0.298, 0.851, 0.392],
  [0.204, 0.667, 0.863],
  [0.345, 0.337, 0.839],
] as const;
export const COVER_HOLOGRAM_CHROMA_GAIN = 0.28;
export const COVER_HOLOGRAM_GLARE_GAIN = 0.16;
export const COVER_HOLOGRAM_PEAK_WHITE_MIX_MAX = 0.42;
export const COVER_HOLOGRAM_MAX_ALPHA = 0.48;
export const COVER_HOLOGRAM_FRESNEL_GAIN = 0.12;

const glslVec3 = (rgb: readonly number[]) =>
  `vec3(${rgb.map((channel) => channel.toFixed(3)).join(", ")})`;
const RAINBOW_GLSL = COVER_HOLOGRAM_RAINBOW_STOPS.map(glslVec3);

export const COVER_HOLOGRAM_VERTEX_SHADER = /* glsl */ `
  varying vec2 vHoloUv;
  varying vec3 vHoloNormal;
  varying vec3 vHoloViewPosition;

  void main() {
    vHoloUv = uv;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vHoloNormal = normalize(normalMatrix * normal);
    vHoloViewPosition = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export const COVER_HOLOGRAM_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uPattern;
  uniform vec2 uPointer;
  uniform float uFlip;
  uniform float uTilt;
  uniform float uStrength;

  varying vec2 vHoloUv;
  varying vec3 vHoloNormal;
  varying vec3 vHoloViewPosition;

  float holoBell(float distanceFromCenter, float width) {
    float x = distanceFromCenter / width;
    return exp(-(x * x));
  }

  // One looping rainbow gradient, the same stops as TiltHologramCard.
  vec3 holoSpectrum(float phase) {
    vec3 c0 = ${RAINBOW_GLSL[0]};
    vec3 c1 = ${RAINBOW_GLSL[1]};
    vec3 c2 = ${RAINBOW_GLSL[2]};
    vec3 c3 = ${RAINBOW_GLSL[3]};
    vec3 c4 = ${RAINBOW_GLSL[4]};
    vec3 c5 = ${RAINBOW_GLSL[5]};
    float x = fract(phase) * 6.0;
    float seg = floor(x);
    float f = x - seg;
    vec3 a = mix(
      mix(mix(c0, c1, step(1.0, seg)), mix(c2, c3, step(3.0, seg)), step(2.0, seg)),
      mix(c4, c5, step(5.0, seg)),
      step(4.0, seg)
    );
    vec3 b = mix(
      mix(mix(c1, c2, step(1.0, seg)), mix(c3, c4, step(3.0, seg)), step(2.0, seg)),
      mix(c5, c0, step(5.0, seg)),
      step(4.0, seg)
    );
    return mix(a, b, f);
  }

  void main() {
    vec4 patternPixel = texture2D(uPattern, vHoloUv);
    float pattern = patternPixel.a * dot(
      patternPixel.rgb,
      vec3(0.2126, 0.7152, 0.0722)
    );
    float coating = smoothstep(0.004, 0.16, pattern);

    vec3 viewNormal = normalize(vHoloNormal);
    vec3 viewDirection = normalize(vHoloViewPosition);
    float facing = clamp(abs(dot(viewNormal, viewDirection)), 0.0, 1.0);
    float grazing = pow(1.0 - facing, 0.85);
    // A nearly edge-on transparent sheet should become a clean sliver rather
    // than a detached colored seam beside the opaque cover.
    float edgeFade = smoothstep(0.055, 0.20, facing);

    // The mask stays in page UVs. Only the light field moves, so the foil
    // remains registered to the photographed paper planes while the leaf bends.
    float diagonal = vHoloUv.x * 0.58 + vHoloUv.y * 0.42;
    float normalTravel = dot(viewNormal.xy, vec2(0.09, -0.07));
    float center = 0.48
      + uPointer.x * 0.18
      - uPointer.y * 0.14
      + uFlip * 0.10
      + normalTravel;
    float primaryWide = holoBell(diagonal - center, 0.22);
    float primaryCore = holoBell(diagonal - center, 0.075);
    float secondary = holoBell(diagonal - (center - 0.34), 0.11);
    float colorBand = clamp(primaryWide + 0.55 * secondary, 0.0, 1.0);

    float phase = diagonal * 1.0
      + uPointer.x * 0.32
      - uPointer.y * 0.24
      + uFlip * 0.18
      + normalTravel * 1.1;
    vec3 spectrum = holoSpectrum(phase);

    float angularResponse = 0.72 + grazing * 0.55;
    float colorFoil = (0.08 + colorBand * ${COVER_HOLOGRAM_CHROMA_GAIN.toFixed(3)})
      * angularResponse;
    float whiteReflection = primaryWide * (0.04 + grazing * 0.03)
      + primaryCore * (${COVER_HOLOGRAM_GLARE_GAIN.toFixed(2)} + grazing * 0.08)
      + secondary * (0.03 + grazing * 0.02);
    float fresnelSheen = (0.012 + grazing * ${COVER_HOLOGRAM_FRESNEL_GAIN.toFixed(2)})
      * (0.42 + 0.58 * primaryWide);
    float totalFoil = colorFoil + whiteReflection + fresnelSheen;
    // Flip and pointer tilt are independent paths into the same coating. The
    // captured/live DOM cover stays neutral; a 3D tilt or moving leaf reveals
    // the foil without a pickup/landing discontinuity.
    float flipVisibility = smoothstep(0.0, 0.28, uFlip);
    float motionVisibility = max(flipVisibility, uTilt);
    float alpha = clamp(
      coating * totalFoil * uStrength * edgeFade * motionVisibility,
      0.0,
      ${COVER_HOLOGRAM_MAX_ALPHA.toFixed(2)}
    );
    // Rainbow is the coating. White only punches through at the glare core,
    // matching the reference's separate light-reflection layer.
    float reflectionMix = clamp(
      primaryCore * primaryCore * 0.34
        + primaryWide * 0.05
        + secondary * 0.04,
      0.0,
      ${COVER_HOLOGRAM_PEAK_WHITE_MIX_MAX.toFixed(2)}
    );
    vec3 color = mix(spectrum, vec3(1.0), reflectionMix);

    gl_FragColor = vec4(color, alpha);
  }
`;

export function createCoverHologramMaterial(
  pattern: THREE.Texture,
): CoverHologramMaterial {
  const material = new THREE.ShaderMaterial({
    name: "cover-hologram",
    uniforms: {
      uPattern: { value: pattern },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uFlip: { value: 0 },
      uTilt: { value: 0 },
      uStrength: { value: 1 },
    },
    vertexShader: COVER_HOLOGRAM_VERTEX_SHADER,
    fragmentShader: COVER_HOLOGRAM_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
    blending: THREE.NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }) as CoverHologramMaterial;
  return material;
}

export function updateCoverHologramMaterial(
  material: CoverHologramMaterial,
  state: CoverHologramMaterialState,
) {
  const pointer = normalizeCoverHologramPointer(
    state.pointerX,
    state.pointerY,
  );
  material.uniforms.uPointer.value.set(pointer.x, pointer.y);
  material.uniforms.uFlip.value = coverHologramFlipEnvelope(state.progress);
  const requestedTilt = Number.isFinite(state.tilt) ? (state.tilt ?? 0) : 0;
  material.uniforms.uTilt.value = Math.min(1, Math.max(0, requestedTilt));
  const requestedStrength = Number.isFinite(state.strength)
    ? (state.strength ?? 1)
    : 1;
  material.uniforms.uStrength.value = Math.min(
    1.25,
    Math.max(0, requestedStrength),
  );
}
