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
    uStrength: THREE.IUniform<number>;
  };
}

export interface CoverHologramMaterialState {
  pointerX: number;
  pointerY: number;
  progress: number;
  strength?: number;
}

/** Visual contract: a white foil sweep leads; chroma remains the fringe. */
export const COVER_HOLOGRAM_CHROMA_GAIN = 0.045;
export const COVER_HOLOGRAM_GLARE_GAIN = 0.42;
export const COVER_HOLOGRAM_PEAK_WHITE_MIX_MIN = 0.96;
export const COVER_HOLOGRAM_MAX_ALPHA = 0.48;
export const COVER_HOLOGRAM_FRESNEL_GAIN = 0.18;

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
  uniform float uStrength;

  varying vec2 vHoloUv;
  varying vec3 vHoloNormal;
  varying vec3 vHoloViewPosition;

  float holoBell(float distanceFromCenter, float width) {
    float x = distanceFromCenter / width;
    return exp(-(x * x));
  }

  // A smooth, cyclic HSV spectrum without a branch or lookup texture.
  vec3 holoSpectrum(float phase) {
    vec3 rgb = clamp(
      abs(mod(phase * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0,
      0.0,
      1.0
    );
    return rgb * rgb * (3.0 - 2.0 * rgb);
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

    float phase = diagonal * 1.18
      + uPointer.x * 0.12
      - uPointer.y * 0.08
      + uFlip * 0.14
      + normalTravel * 0.7;
    vec3 spectrum = holoSpectrum(fract(phase));

    float angularResponse = 0.72 + grazing * 0.55;
    float colorFoil = (0.012 + colorBand * ${COVER_HOLOGRAM_CHROMA_GAIN.toFixed(3)})
      * angularResponse;
    float whiteReflection = primaryWide * (0.18 + grazing * 0.12)
      + primaryCore * (${COVER_HOLOGRAM_GLARE_GAIN.toFixed(2)} + grazing * 0.20)
      + secondary * (0.07 + grazing * 0.045);
    float fresnelSheen = (0.018 + grazing * ${COVER_HOLOGRAM_FRESNEL_GAIN.toFixed(2)})
      * (0.42 + 0.58 * primaryWide);
    float totalFoil = colorFoil + whiteReflection + fresnelSheen;
    // uFlip is exactly zero at both landed endpoints and symmetric for reverse
    // turns, so the motion-only foil cannot flash against the neutral cover.
    float motionVisibility = smoothstep(0.0, 0.28, uFlip);
    float alpha = clamp(
      coating * totalFoil * uStrength * edgeFade * motionVisibility,
      0.0,
      ${COVER_HOLOGRAM_MAX_ALPHA.toFixed(2)}
    );
    // Pure white vanishes against white stock. A broad neutral-silver shoulder
    // gives the narrow white core enough contrast to read as reflected light;
    // only a small spectrum fraction remains at the fringe.
    vec3 silverPearl = mix(vec3(0.48, 0.57, 0.68), spectrum, 0.10);
    float reflectionMix = clamp(
      primaryCore * primaryCore * ${COVER_HOLOGRAM_PEAK_WHITE_MIX_MIN.toFixed(2)}
        + primaryWide * 0.06
        + secondary * 0.08,
      0.0,
      0.96
    );
    vec3 color = mix(silverPearl, vec3(1.0), reflectionMix);

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
  const requestedStrength = Number.isFinite(state.strength)
    ? (state.strength ?? 1)
    : 1;
  material.uniforms.uStrength.value = Math.min(
    1.25,
    Math.max(0, requestedStrength),
  );
}
