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

    vec3 viewNormal = normalize(vHoloNormal);
    vec3 viewDirection = normalize(vHoloViewPosition);
    float facing = clamp(abs(dot(viewNormal, viewDirection)), 0.0, 1.0);
    float grazing = pow(1.0 - facing, 0.85);
    // A nearly edge-on transparent sheet should become a clean sliver rather
    // than a detached colored seam beside the opaque cover.
    float edgeFade = smoothstep(0.055, 0.20, facing);

    // The pattern stays in page UVs. Only the light field moves, so the
    // authored A contours remain glued to every vertex while the leaf bends.
    float diagonal = vHoloUv.x * 0.58 + vHoloUv.y * 0.42;
    float normalTravel = dot(viewNormal.xy, vec2(0.09, -0.07));
    float center = 0.48
      + uPointer.x * 0.18
      - uPointer.y * 0.14
      + uFlip * 0.10
      + normalTravel;
    float band = holoBell(diagonal - center, 0.13)
      + 0.72 * holoBell(diagonal - (center - 0.34), 0.105);
    band = clamp(band, 0.0, 1.0);

    float phase = diagonal * 1.18
      + uPointer.x * 0.12
      - uPointer.y * 0.08
      + uFlip * 0.14
      + normalTravel * 0.7;
    vec3 spectrum = holoSpectrum(fract(phase));

    float angularResponse = 0.65 + grazing * 0.75;
    float patternedFoil = pattern * (0.075 + band * 0.34) * angularResponse;
    float backgroundFoil = 0.01 + band * 0.018;
    float whiteReflection = band * band * (0.018 + grazing * 0.025);
    float alpha = clamp(
      (patternedFoil + backgroundFoil + whiteReflection) * uStrength * edgeFade,
      0.0,
      0.44
    );
    float reflectionMix = clamp(whiteReflection * 10.0, 0.0, 0.5);
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
