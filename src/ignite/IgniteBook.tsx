import { useEffect, useMemo, useReducer, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SPREADS } from "@/magazine/folio";
import {
  getPageTexture,
  onTexturesChanged,
  pageKey,
} from "@/book3d/pageTextures";
import type { IgnitePointerState } from "./types";
import { IgniteAtmosphere } from "./IgniteAtmosphere";
import { IgniteDebris } from "./IgniteDebris";
import {
  advanceBurnField,
  burnProgress,
  createBurnField,
  igniteBurnField,
  upsampleBurnTexture,
  writeBurnTexture,
  type BurnField,
} from "./burnField";

export const IGNITE_TOTAL_LEAVES = SPREADS.length - 1;
// World units are CSS pixels. Sixty thousandths of a pixel separates sheets
// enough for deterministic depth ordering without turning the cut into a
// visible stepped bowl.
export const IGNITE_LAYER_GAP = 0.06;
const TABLE_Z = -IGNITE_TOTAL_LEAVES * IGNITE_LAYER_GAP - 2;
const FIELD_W = 192;
const FIELD_H = 128;
const VISUAL_FIELD_W = FIELD_W * 2;
const VISUAL_FIELD_H = FIELD_H * 2;
export const IGNITE_PAGE_SEGMENTS_X = 96;
export const IGNITE_PAGE_SEGMENTS_Y = 128;
export const IGNITE_MAX_CURL_RATIO = 0.052;
export const IGNITE_CURL_INSET_RATIO = 0.31;
export const IGNITE_CHAR_ZONE_MAX_TEXELS = 4.8;

interface IgniteBookProps {
  currentSpread: number;
  pointer: IgnitePointerState;
  pw: number;
  ph: number;
  reducedMotion: boolean;
  onIgnition?: () => void;
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
}

export interface BurnPagePlanEntry {
  textureKey: string;
  side: "left" | "right";
  layer: number;
  spread: number;
}

export interface BurnPagePlan {
  left: BurnPagePlanEntry[];
  right: BurnPagePlanEntry[];
}

/**
 * Maps every physical leaf in the current book pose to its actual facing page.
 * The first entry on each side is exposed; subsequent entries are ordered
 * downward through the stack and are revealed by local combustion depth.
 */
export function createBurnPagePlan(
  currentSpread: number,
  totalLeaves = IGNITE_TOTAL_LEAVES,
): BurnPagePlan {
  const safeTotal = Math.max(0, Math.floor(totalLeaves));
  const safeSpread = THREE.MathUtils.clamp(
    Math.floor(currentSpread),
    0,
    safeTotal,
  );
  const left = Array.from({ length: safeSpread }, (_, layer) => {
    const spread = safeSpread - layer;
    return {
      textureKey: pageKey(spread, "verso"),
      side: "left" as const,
      layer,
      spread,
    };
  });
  const right = Array.from(
    { length: safeTotal - safeSpread },
    (_, layer) => {
      const spread = safeSpread + layer;
      return {
        textureKey: pageKey(spread, "recto"),
        side: "right" as const,
        layer,
        spread,
      };
    },
  );
  return { left, right };
}

/** Mirrors the shader's page-indexed phase contract for focused tests. */
export function resolveBurnLayerPhase(
  surface: number,
  physicalBurnDepth: number,
  layer: number,
) {
  const safeLayer = Math.max(0, Math.floor(layer));
  if (safeLayer === 0) return THREE.MathUtils.clamp(surface, 0, 1);
  return THREE.MathUtils.clamp(physicalBurnDepth - safeLayer, 0, 1);
}

const smoothstep = (minimum: number, maximum: number, value: number) => {
  const progress = THREE.MathUtils.clamp(
    (value - minimum) / Math.max(1e-6, maximum - minimum),
    0,
    1,
  );
  return progress * progress * (3 - 2 * progress);
};

/**
 * Nominal exposure of a sheet through the locally perforated sheet above it.
 * Layer-specific shader noise perturbs the threshold, but never the ordering.
 */
export function resolvePreviousLayerExposure(
  surface: number,
  physicalBurnDepth: number,
  layer: number,
) {
  const safeLayer = Math.max(0, Math.floor(layer));
  if (safeLayer === 0) return 0;
  const previousLayer = safeLayer - 1;
  const previousPhase = resolveBurnLayerPhase(
    surface,
    physicalBurnDepth,
    previousLayer,
  );
  const threshold = previousLayer === 0 ? 0.335 : 0.54;
  return smoothstep(threshold - 0.014, threshold + 0.014, previousPhase);
}

/** Texture-preserving discoloration envelope for the newly exposed sheet. */
export function resolveUnderlayerDiscoloration(
  surface: number,
  physicalBurnDepth: number,
  heat: number,
  layer: number,
) {
  const safeLayer = Math.max(0, Math.floor(layer));
  const exposure = resolvePreviousLayerExposure(
    surface,
    physicalBurnDepth,
    safeLayer,
  );
  if (exposure === 0) return 0;
  const exposureAge = THREE.MathUtils.clamp(
    physicalBurnDepth - Math.max(0, safeLayer - 1),
    0,
    1,
  );
  return exposure * THREE.MathUtils.clamp(
    0.1 + exposureAge * 0.055 + THREE.MathUtils.clamp(heat, 0, 1) * 0.035,
    0.1,
    0.19,
  );
}

/**
 * CPU mirror of the vertex curl gate. Curl exists only on intact, heated
 * fibres beside this sheet's own opening; consumed or not-yet-active leaves
 * remain flat, preventing the repeated nested bowls seen in earlier passes.
 */
export function resolvePaperCurl(
  centerPhase: number,
  neighbourPhase: number,
  threshold: number,
  heat: number,
  physicalBurnDepth: number,
  layer: number,
  variation = 0.5,
) {
  const centerHole = smoothstep(
    threshold - 0.025,
    threshold + 0.025,
    centerPhase,
  );
  const neighbourHole = smoothstep(
    threshold - 0.035,
    threshold + 0.02,
    neighbourPhase,
  );
  const activeLayer = 1 - smoothstep(
    0.78,
    1.04,
    physicalBurnDepth - Math.max(0, Math.floor(layer)),
  );
  const hot = smoothstep(0.34, 0.78, heat);
  const edge = (1 - centerHole) * neighbourHole;
  return THREE.MathUtils.clamp(
    edge * hot * activeLayer * (0.58 + THREE.MathUtils.clamp(variation, 0, 1) * 0.42),
    0,
    1,
  );
}

function useCachedPageTexture(key: string) {
  const [, refresh] = useReducer((revision: number) => revision + 1, 0);
  useEffect(() => onTexturesChanged(refresh), []);
  return getPageTexture(key);
}

function useBurnPageMaterial(
  source: THREE.Texture | null,
  burnMap: THREE.DataTexture,
  side: "left" | "right",
  layer: number,
  maxLayers: number,
  pw: number,
  ph: number,
) {
  const shaderRef = useRef<{
    uniforms: { igniteTime?: { value: number } };
  } | null>(null);
  const material = useMemo(() => {
    const next = new THREE.MeshStandardMaterial({
      map: source,
      color: 0xffffff,
      side: THREE.DoubleSide,
      toneMapped: false,
      roughness: 0.92,
      metalness: 0,
      flatShading: false,
      alphaTest: 0.015,
      alphaToCoverage: true,
    });
    next.customProgramCacheKey = () => "ignite-progressive-paper-v6";
    next.onBeforeCompile = (shader) => {
      shader.uniforms.igniteMap = { value: burnMap };
      shader.uniforms.igniteLayer = { value: layer };
      shader.uniforms.igniteMaxLayers = { value: maxLayers };
      shader.uniforms.igniteTime = { value: 0 };
      shader.uniforms.igniteUvOffset = { value: side === "left" ? 0 : 0.5 };
      shader.uniforms.igniteMapSize = {
        value: new THREE.Vector2(VISUAL_FIELD_W, VISUAL_FIELD_H),
      };
      shader.uniforms.ignitePageSize = { value: new THREE.Vector2(pw, ph) };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform sampler2D igniteMap;
          uniform float igniteLayer;
          uniform float igniteMaxLayers;
          uniform float igniteTime;
          uniform float igniteUvOffset;
          uniform vec2 igniteMapSize;
          uniform vec2 ignitePageSize;
          varying vec2 vIgniteUv;
          varying float vIgniteCurl;
          varying float vIgniteCurlEdge;
          varying vec2 vIgniteCurlDirection;
          varying float vIgniteCorrugation;

          vec4 igniteVertexState(vec2 burnUv) {
            vec2 minimumUv = vec2(igniteUvOffset + .001, .001);
            vec2 maximumUv = vec2(igniteUvOffset + .499, .999);
            return texture2D(igniteMap, clamp(burnUv, minimumUv, maximumUv));
          }

          float igniteVertexPhase(vec2 burnUv) {
            vec4 state = igniteVertexState(burnUv);
            float physicalDepth = state.b * igniteMaxLayers;
            float lowerPhase = clamp(physicalDepth - igniteLayer, 0.0, 1.0);
            return mix(lowerPhase, state.r, 1.0 - step(.5, igniteLayer));
          }

          float igniteVertexThreshold(vec2 burnUv) {
            float exposedSheet = 1.0 - step(.5, igniteLayer);
            float base = mix(.54, .335, exposedSheet);
            float broad = sin(
              burnUv.x * 31.7 + burnUv.y * 23.1 + igniteLayer * 7.9
            ) * .026;
            float crossFibre = sin(
              burnUv.x * 87.0 - burnUv.y * 17.0 + igniteLayer * 13.7
            ) * .012;
            return base + broad + crossFibre;
          }

          float igniteVertexHole(vec2 burnUv) {
            float threshold = igniteVertexThreshold(burnUv);
            return smoothstep(
              threshold - .025,
              threshold + .025,
              igniteVertexPhase(burnUv)
            );
          }`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vIgniteUv = uv;
          vec2 igniteVertexUv = vec2(
            uv.x * .5 + igniteUvOffset,
            uv.y
          );
          vec2 igniteVertexTexel = 1.0 / igniteMapSize;
          vec2 igniteCurlRadius = igniteVertexTexel * vec2(11.6, 9.4);
          float igniteCenterHole = igniteVertexHole(igniteVertexUv);
          float igniteHoleLeft = igniteVertexHole(
            igniteVertexUv - vec2(igniteCurlRadius.x, 0.0)
          );
          float igniteHoleRight = igniteVertexHole(
            igniteVertexUv + vec2(igniteCurlRadius.x, 0.0)
          );
          float igniteHoleDown = igniteVertexHole(
            igniteVertexUv - vec2(0.0, igniteCurlRadius.y)
          );
          float igniteHoleUp = igniteVertexHole(
            igniteVertexUv + vec2(0.0, igniteCurlRadius.y)
          );
          float igniteNeighbourHole = max(
            max(igniteHoleLeft, igniteHoleRight),
            max(igniteHoleDown, igniteHoleUp)
          );
          vec4 igniteVertexSample = igniteVertexState(igniteVertexUv);
          float igniteVertexDepth = igniteVertexSample.b * igniteMaxLayers;
          float igniteVertexActive = 1.0 - smoothstep(
            .78,
            1.04,
            igniteVertexDepth - igniteLayer
          );
          float igniteVertexHot = smoothstep(.18, .58, igniteVertexSample.g);
          float igniteCurlVariation = .5 + .5 * sin(
            igniteVertexUv.x * 47.0
              + igniteVertexUv.y * 29.0
              + igniteLayer * 8.3
          );
          float igniteCurlEdge = (1.0 - igniteCenterHole)
            * igniteNeighbourHole;
          float igniteCurl = igniteCurlEdge
            * igniteVertexHot
            * igniteVertexActive
            * mix(.58, 1.0, igniteCurlVariation);
          float igniteFibreCorrugation =
            sin(igniteVertexUv.x * 119.0
              - igniteVertexUv.y * 43.0
              + igniteLayer * 5.1) * .62
            + sin(igniteVertexUv.x * 47.0
              + igniteVertexUv.y * 91.0
              - igniteLayer * 3.7) * .38;
          float igniteCurlRipple = clamp(
            .83 + igniteFibreCorrugation * .21,
            .59,
            1.09
          );
          float igniteCurlLift = igniteCurl
            * igniteCurlRipple
            * min(ignitePageSize.x, ignitePageSize.y)
            * ${IGNITE_MAX_CURL_RATIO.toFixed(3)};
          vec2 igniteHoleDirection = vec2(
            igniteHoleRight - igniteHoleLeft,
            igniteHoleUp - igniteHoleDown
          );
          float igniteDirectionLength = length(igniteHoleDirection);
          if (igniteDirectionLength > .001) {
            igniteHoleDirection /= igniteDirectionLength;
            transformed.xy -= igniteHoleDirection
              * igniteCurlLift
              * ${IGNITE_CURL_INSET_RATIO.toFixed(2)};
          }
          // A height field only lifts the intact lip toward the viewer. It
          // cannot pull the already-consumed region upward or create a bowl.
          transformed.z += igniteCurlLift;
          vIgniteCurl = igniteCurl;
          vIgniteCurlEdge = igniteCurlEdge;
          vIgniteCurlDirection = igniteHoleDirection;
          vIgniteCorrugation = igniteFibreCorrugation;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform sampler2D igniteMap;
          uniform float igniteLayer;
          uniform float igniteMaxLayers;
          uniform float igniteTime;
          uniform float igniteUvOffset;
          uniform vec2 igniteMapSize;
          varying vec2 vIgniteUv;
          varying float vIgniteCurl;
          varying float vIgniteCurlEdge;
          varying vec2 vIgniteCurlDirection;
          varying float vIgniteCorrugation;

          float igniteHash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          float igniteNoise(vec2 p) {
            vec2 cell = floor(p);
            vec2 blend = fract(p);
            blend = blend * blend * (3.0 - 2.0 * blend);
            return mix(
              mix(
                igniteHash(cell),
                igniteHash(cell + vec2(1.0, 0.0)),
                blend.x
              ),
              mix(
                igniteHash(cell + vec2(0.0, 1.0)),
                igniteHash(cell + vec2(1.0, 1.0)),
                blend.x
              ),
              blend.y
            );
          }

          float igniteFbm(vec2 p) {
            return igniteNoise(p) * .55
              + igniteNoise(p * 2.03 + 9.7) * .27
              + igniteNoise(p * 4.11 + 31.2) * .12
              + igniteNoise(p * 8.17 + 73.8) * .06;
          }

          vec4 igniteState(vec2 uv) {
            vec2 minimumUv = vec2(igniteUvOffset + .001, .001);
            vec2 maximumUv = vec2(igniteUvOffset + .499, .999);
            // The CPU already expands the simulation field and the texture is
            // linearly filtered. Sampling the continuous UV directly avoids
            // reintroducing a visible cell cadence at close zoom.
            return texture2D(
              igniteMap,
              clamp(uv, minimumUv, maximumUv)
            );
          }

          float ignitePhaseForLayer(vec2 uv, float layerIndex) {
            vec4 state = igniteState(uv);
            float physicalDepth = state.b * igniteMaxLayers;
            float lowerPhase = clamp(physicalDepth - layerIndex, 0.0, 1.0);
            float exposedSheet = 1.0 - step(.5, layerIndex);
            // R is the fast connected topology for only the exposed sheet.
            // Deeper pages use exact physical consumed-layer depth from B.
            return mix(lowerPhase, state.r, exposedSheet);
          }

          float igniteThresholdForLayer(vec2 uv, float layerIndex) {
            float broad = igniteFbm(
              uv * vec2(7.0, 5.0)
                + vec2(layerIndex * 11.7, layerIndex * 7.3)
            );
            float fibre = igniteNoise(
              uv * vec2(71.0, 19.0)
                + vec2(layerIndex * 17.1, layerIndex * 29.3)
            );
            // Long directional strands perturb only the connected cut. They
            // leave tiny attached paper fibres without spawning isolated holes.
            float tornFibre = igniteNoise(
              uv * vec2(318.0, 53.0)
                + vec2(layerIndex * 37.3, layerIndex * 61.7)
            );
            float exposedSheet = 1.0 - step(.5, layerIndex);
            float base = mix(.54, .335, exposedSheet);
            return base
              + (broad - .5) * .15
              + (fibre - .5) * .045
              + (tornFibre - .5) * .019;
          }

          float igniteCutSignalForLayer(vec2 uv, float layerIndex) {
            return ignitePhaseForLayer(uv, layerIndex)
              - igniteThresholdForLayer(uv, layerIndex);
          }

          float igniteCoverageFromSignal(float signal) {
            // Screen-space derivatives turn the continuous signed topology
            // into a sub-pixel cut instead of thresholding map-sized blocks.
            float antialiasWidth = max(fwidth(signal) * 1.35, .0018);
            return smoothstep(-antialiasWidth, antialiasWidth, signal);
          }

          float igniteHoleForLayer(vec2 uv, float layerIndex) {
            return igniteCoverageFromSignal(
              igniteCutSignalForLayer(uv, layerIndex)
            );
          }

          float igniteLayerPhase(vec2 uv) {
            return ignitePhaseForLayer(uv, igniteLayer);
          }

          float igniteLayerHole(vec2 uv) {
            return igniteHoleForLayer(uv, igniteLayer);
          }

          float igniteNeighbourHole(vec2 uv, vec2 radius) {
            vec2 texel = radius / igniteMapSize;
            vec2 diagonal = texel * .70710678;
            float threshold = igniteThresholdForLayer(uv, igniteLayer);
            float signal = -1.0;
            signal = max(signal, ignitePhaseForLayer(
              uv + vec2(texel.x, 0.0), igniteLayer
            ) - threshold);
            signal = max(signal, ignitePhaseForLayer(
              uv - vec2(texel.x, 0.0), igniteLayer
            ) - threshold);
            signal = max(signal, ignitePhaseForLayer(
              uv + vec2(0.0, texel.y), igniteLayer
            ) - threshold);
            signal = max(signal, ignitePhaseForLayer(
              uv - vec2(0.0, texel.y), igniteLayer
            ) - threshold);
            signal = max(signal, ignitePhaseForLayer(
              uv + diagonal, igniteLayer
            ) - threshold);
            signal = max(signal, ignitePhaseForLayer(
              uv - diagonal, igniteLayer
            ) - threshold);
            signal = max(signal, ignitePhaseForLayer(
              uv + vec2(diagonal.x, -diagonal.y), igniteLayer
            ) - threshold);
            signal = max(signal, ignitePhaseForLayer(
              uv + vec2(-diagonal.x, diagonal.y), igniteLayer
            ) - threshold);
            return igniteCoverageFromSignal(signal);
          }

          float igniteBoundaryDistanceTexels(vec2 uv) {
            // A signed-distance approximation from the continuous burn field
            // keeps all visible material zones on one smooth contour.
            vec2 texel = 1.0 / igniteMapSize;
            float center = igniteCutSignalForLayer(uv, igniteLayer);
            float left = igniteCutSignalForLayer(
              uv - vec2(texel.x, 0.0), igniteLayer
            );
            float right = igniteCutSignalForLayer(
              uv + vec2(texel.x, 0.0), igniteLayer
            );
            float down = igniteCutSignalForLayer(
              uv - vec2(0.0, texel.y), igniteLayer
            );
            float up = igniteCutSignalForLayer(
              uv + vec2(0.0, texel.y), igniteLayer
            );
            float slopePerTexel = max(
              length(vec2(right - left, up - down)) * .5,
              .0045
            );
            return -center / slopePerTexel;
          }`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          // The stock plane normal does not know about vertex curl. This
          // gently turns the surface toward the torn opening so its lighting
          // reads as a lifted, corrugated paper lip.
          float igniteFoldNormalWeight = smoothstep(.08, .72, vIgniteCurl);
          vec3 igniteFoldNormal = normalize(vec3(
            vIgniteCurlDirection.x * (.5 + vIgniteCorrugation * .09),
            vIgniteCurlDirection.y * (.5 - vIgniteCorrugation * .09),
            .82
          ));
          normal = normalize(mix(
            normal,
            gl_FrontFacing ? igniteFoldNormal : -igniteFoldNormal,
            igniteFoldNormalWeight * .58
          ));`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          vec2 igniteUv = vec2(
            vIgniteUv.x * .5 + igniteUvOffset,
            vIgniteUv.y
          );
          vec4 igniteSample = igniteState(igniteUv);
          float igniteCapacity = igniteSample.a * igniteMaxLayers;
          if (igniteCapacity < igniteLayer + .45) discard;

          float ignitePhysicalDepth = igniteSample.b * igniteMaxLayers;
          float ignitePhase = igniteLayerPhase(igniteUv);
          float igniteCutSignal = igniteCutSignalForLayer(
            igniteUv,
            igniteLayer
          );
          float igniteHole = igniteCoverageFromSignal(igniteCutSignal);
          diffuseColor.a *= 1.0 - igniteHole;
          if (igniteHole > .999) discard;

          float igniteHeat = igniteSample.g;
          float igniteBroad = igniteFbm(
            igniteUv * vec2(9.0, 6.0)
              + vec2(igniteLayer * 13.2, igniteLayer * 5.8)
          );
          float igniteMid = igniteFbm(
            igniteUv * vec2(28.0, 19.0)
              + vec2(igniteLayer * 31.1, igniteLayer * 17.7)
          );
          float igniteFibre = igniteNoise(
            igniteUv * vec2(93.0, 23.0)
              + vec2(igniteLayer * 41.3, igniteLayer * 67.1)
          );
          float igniteMacro = igniteFbm(
            igniteUv * vec2(3.7, 2.8)
              + vec2(igniteLayer * 7.9, igniteLayer * 11.3)
          );

          // The perforated sheet immediately above exposes this page to hot
          // gases before its own delayed cut begins. Multiplicative neutral
          // mottling keeps the authored print and paper grain readable; sparse
          // soot islands add depth without replacing it with an opaque slab.
          float igniteLowerSheet = step(.5, igniteLayer);
          float ignitePreviousLayer = max(0.0, igniteLayer - 1.0);
          float igniteUpperHole = igniteLowerSheet * igniteHoleForLayer(
            igniteUv,
            ignitePreviousLayer
          );
          float igniteExposureAge = clamp(
            ignitePhysicalDepth - ignitePreviousLayer,
            0.0,
            1.0
          );
          float igniteUnderMottle = smoothstep(
            .25,
            .76,
            igniteMacro * .68 + igniteBroad * .32
          );
          float igniteUnderTone = clamp(
            mix(.94, .76, igniteUnderMottle)
              - igniteExposureAge * .035
              - igniteHeat * .018
              + (igniteFibre - .5) * .025,
            .7,
            .96
          );
          float igniteUnderShade = igniteUpperHole
            * (.1 + igniteUnderMottle * .18 + igniteExposureAge * .055);
          float igniteUnderClump = igniteUpperHole
            * smoothstep(.63, .79, igniteMacro * .72 + igniteMid * .28)
            * (.1 + igniteExposureAge * .11 + igniteHeat * .035);
          float igniteUnderFibre = igniteUpperHole
            * smoothstep(.78, .91, igniteFibre + igniteMid * .07)
            * (.045 + igniteExposureAge * .045);
          vec3 igniteUnderGrey = diffuseColor.rgb
            * vec3(igniteUnderTone * .985, igniteUnderTone, igniteUnderTone * 1.015);
          vec3 igniteUnderSoot = diffuseColor.rgb * vec3(.19, .185, .175);
          diffuseColor.rgb = mix(
            diffuseColor.rgb,
            igniteUnderGrey,
            igniteUnderShade
          );
          diffuseColor.rgb = mix(
            diffuseColor.rgb,
            igniteUnderSoot,
            clamp(igniteUnderClump + igniteUnderFibre, 0.0, .24)
          );

          // Every sheet owns a different torn threshold, but only its intact
          // lip beside its own opening is marked. There are no displaced page
          // meshes or full-width bands, so successive sheets cannot form bowls.
          float igniteEdgeDistance = max(
            0.0,
            igniteBoundaryDistanceTexels(igniteUv)
          );
          float igniteIntactEdge = (1.0 - igniteHole)
            * (1.0 - smoothstep(.08, .42, igniteEdgeDistance));
          float igniteWidthVariation = smoothstep(
            .28,
            .72,
            igniteMacro * .82 + igniteBroad * .18
          );
          float igniteCarbonWidth = mix(1.25, 2.05, igniteWidthVariation);
          float igniteBrownWidth = igniteCarbonWidth
            + mix(.85, 1.55, igniteMid);
          float igniteTanWidth = min(
            ${IGNITE_CHAR_ZONE_MAX_TEXELS.toFixed(1)},
            igniteBrownWidth + mix(1.05, 2.25, igniteBroad)
          );
          float igniteCarbonCore = (1.0 - igniteHole) * (
            1.0 - smoothstep(
              igniteCarbonWidth * .48,
              igniteCarbonWidth,
              igniteEdgeDistance
            )
          );
          float igniteCarbonReach = (1.0 - igniteHole) * (
            1.0 - smoothstep(
              igniteCarbonWidth * .82,
              igniteCarbonWidth + .72,
              igniteEdgeDistance
            )
          );
          float igniteBrownReach = (1.0 - igniteHole) * (
            1.0 - smoothstep(
              igniteCarbonWidth,
              igniteBrownWidth,
              igniteEdgeDistance
            )
          );
          float igniteTanReach = (1.0 - igniteHole) * (
            1.0 - smoothstep(
              igniteBrownWidth,
              igniteTanWidth,
              igniteEdgeDistance
            )
          );
          float igniteCharClump = smoothstep(
            .34,
            .68,
            igniteMacro * .74 + igniteBroad * .19 + igniteFibre * .07
          );
          float igniteCarbon = max(
            igniteCarbonCore,
            igniteCarbonReach * igniteCharClump
          );
          float igniteBrown = igniteBrownReach * (1.0 - igniteCarbon)
            * mix(.48, .88, smoothstep(.28, .74, igniteBroad));
          float igniteTan = igniteTanReach
            * (1.0 - max(igniteCarbon, igniteBrown * .82))
            * mix(.28, .72, smoothstep(.3, .77, igniteMacro * .6 + igniteMid * .4));

          // Before its own perforation a newly revealed lower page stays
          // recognizably printed paper. Sparse warm fibres are the only signal
          // of preheating, avoiding dark camouflage slabs between pages.
          float ignitePreheat = (1.0 - igniteBrownReach)
            * smoothstep(.18, .64, ignitePhase)
            * smoothstep(.7, .88, igniteFibre + igniteBroad * .08)
            * smoothstep(.48, .82, igniteHeat)
            * .12;
          vec3 igniteTanColor = diffuseColor.rgb * vec3(.7, .49, .29);
          vec3 igniteBrownColor = mix(
            diffuseColor.rgb * vec3(.34, .16, .065),
            vec3(.115, .047, .018),
            .48 + igniteMid * .22
          );
          vec3 igniteCarbonBlack = vec3(.018, .014, .011);
          vec3 igniteCarbonGrey = vec3(.105, .085, .067);
          vec3 igniteCarbonColor = mix(
            igniteCarbonBlack,
            igniteCarbonGrey,
            smoothstep(.73, .91, igniteFibre + igniteMid * .08) * .34
          );
          diffuseColor.rgb = mix(diffuseColor.rgb, igniteTanColor, igniteTan * .36);
          diffuseColor.rgb = mix(diffuseColor.rgb, igniteBrownColor, igniteBrown * .88);
          diffuseColor.rgb = mix(diffuseColor.rgb, igniteCarbonColor, igniteCarbon);
          diffuseColor.rgb = mix(
            diffuseColor.rgb,
            diffuseColor.rgb * vec3(.78, .62, .43),
            ignitePreheat
          );
          float igniteBackFace = gl_FrontFacing ? 0.0 : 1.0;
          float igniteCharredUnderside = igniteBackFace
            * smoothstep(.06, .42, vIgniteCurl)
            * smoothstep(.08, .5, vIgniteCurlEdge);
          vec3 igniteUndersideColor = mix(
            vec3(.032, .025, .02),
            vec3(.16, .085, .035),
            igniteFibre * .36
          );
          diffuseColor.rgb = mix(
            diffuseColor.rgb,
            igniteUndersideColor,
            igniteCharredUnderside
          );

          float igniteLocalDepth = ignitePhysicalDepth - igniteLayer;
          float igniteCurrentLayer = 1.0 - smoothstep(.84, 1.04, igniteLocalDepth);
          float igniteEmberNoise = igniteNoise(
            igniteUv * vec2(61.0, 43.0)
              + vec2(igniteTime * .31, -igniteTime * .19)
              + igniteLayer * 23.7
          );
          float igniteEmberMacro = igniteFbm(
            igniteUv * vec2(17.0, 11.0)
              + vec2(igniteTime * .08, -igniteTime * .055)
              + igniteLayer * 19.7
          );
          float igniteEmber = max(
              igniteIntactEdge,
              (1.0 - smoothstep(.16, .95, igniteEdgeDistance))
                * (1.0 - igniteHole)
            )
            * igniteCurrentLayer
            * smoothstep(.42, .82, igniteHeat)
            * smoothstep(.625, .71, igniteEmberMacro)
            * smoothstep(.56, .72, igniteEmberNoise)
            * (.68 + smoothstep(.72, .9, igniteEmberNoise) * .3);
          // Added after the carbon mix so hot segments remain visibly
          // emissive on a white magazine without drawing a continuous outline.
          diffuseColor.rgb += vec3(1.0, .085, .002) * igniteEmber * .92;`,
        );
      shaderRef.current = shader;
    };
    return next;
  }, [burnMap, layer, maxLayers, ph, pw, side, source]);

  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    const shader = shaderRef.current;
    if (shader?.uniforms.igniteTime) {
      shader.uniforms.igniteTime.value = clock.elapsedTime;
    }
  });
  return material;
}

function BurnPage({
  entry,
  geometry,
  pageSize,
  burnMap,
  maxLayers,
}: {
  entry: BurnPagePlanEntry;
  geometry: THREE.PlaneGeometry;
  pageSize: readonly [number, number];
  burnMap: THREE.DataTexture;
  maxLayers: number;
}) {
  const [pw, ph] = pageSize;
  const source = useCachedPageTexture(entry.textureKey);
  const material = useBurnPageMaterial(
    source,
    burnMap,
    entry.side,
    entry.layer,
    maxLayers,
    pw,
    ph,
  );
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[
        entry.side === "left" ? -pw / 2 : pw / 2,
        0,
        -entry.layer * IGNITE_LAYER_GAP,
      ]}
      renderOrder={Math.max(1, 30 - entry.layer)}
      receiveShadow
    />
  );
}

function completeReducedMotionField(field: BurnField) {
  for (let index = 0; index < field.burn.length; index += 1) {
    field.burn[index] = field.capacity[index] ?? 0;
    field.surface[index] = field.capacity[index] ? 1 : 0;
    field.surfaceSeed[index] = field.capacity[index] ? 1 : 0;
    field.nextSurfaceSeed[index] = field.surfaceSeed[index] ?? 0;
    field.heat[index] = 0;
  }
  field.burnedFuel = field.totalFuel;
  field.maximumHeat = 0;
  field.caught = true;
  field.complete = true;
}

interface BurnSimulation {
  field: BurnField;
  bytes: Uint8Array;
  visualBytes: Uint8Array;
  texture: THREE.DataTexture;
}

function makeBurnSimulation(
  currentSpread: number,
  leftCount: number,
  rightCount: number,
): BurnSimulation {
  const field = createBurnField({
    width: FIELD_W,
    height: FIELD_H,
    leftLayers: leftCount,
    rightLayers: rightCount,
    seed: 0x1a71a1 + currentSpread * 4099,
  });
  const bytes = new Uint8Array(FIELD_W * FIELD_H * 4);
  writeBurnTexture(field, bytes);
  const visualBytes = new Uint8Array(VISUAL_FIELD_W * VISUAL_FIELD_H * 4);
  upsampleBurnTexture(
    bytes,
    FIELD_W,
    FIELD_H,
    visualBytes,
    VISUAL_FIELD_W,
    VISUAL_FIELD_H,
  );
  const texture = new THREE.DataTexture(
    visualBytes,
    VISUAL_FIELD_W,
    VISUAL_FIELD_H,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { field, bytes, visualBytes, texture };
}

export function IgniteBook({
  currentSpread,
  pointer,
  pw,
  ph,
  reducedMotion,
  onIgnition,
  onProgress,
  onComplete,
}: IgniteBookProps) {
  const plan = useMemo(
    () => createBurnPagePlan(currentSpread),
    [currentSpread],
  );
  const simulation = useMemo(
    () => makeBurnSimulation(currentSpread, plan.left.length, plan.right.length),
    [currentSpread, plan.left.length, plan.right.length],
  );
  const pageGeometry = useMemo(
    () => new THREE.PlaneGeometry(
      pw,
      ph,
      IGNITE_PAGE_SEGMENTS_X,
      IGNITE_PAGE_SEGMENTS_Y,
    ),
    [ph, pw],
  );
  const pageSize = useMemo(() => [pw, ph] as const, [ph, pw]);

  const accumulator = useRef(0);
  const previousPointer = useRef({ u: pointer.u, v: pointer.v, inside: false });
  const reportedIgnition = useRef(false);
  const reportedComplete = useRef(false);
  const reportedProgress = useRef(0);

  useEffect(
    () => () => {
      simulation.texture.dispose();
    },
    [simulation],
  );
  useEffect(() => () => pageGeometry.dispose(), [pageGeometry]);

  // R3F render loops are intentionally imperative. React never reads this
  // GPU/typed-array state; mutating it avoids 30 React renders every second.
  // eslint-disable-next-line react-hooks/immutability
  useFrame((_, rawDt) => {
    const field = simulation.field;

    if (pointer.inside && !field.complete) {
      const prior = previousPointer.current;
      const travel = prior.inside
        ? Math.hypot(pointer.u - prior.u, pointer.v - prior.v)
        : 0;
      const samples = Math.min(10, Math.max(1, Math.ceil(travel / 0.018)));
      let touched = false;
      for (let sample = 1; sample <= samples; sample += 1) {
        const mix = sample / samples;
        const u = prior.inside
          ? prior.u + (pointer.u - prior.u) * mix
          : pointer.u;
        const v = prior.inside
          ? prior.v + (pointer.v - prior.v) * mix
          : pointer.v;
        touched =
          igniteBurnField(
            field,
            u,
            v,
            pointer.pressed ? 0.052 : 0.032,
            pointer.pressed ? 1.32 : 0.92,
          ) || touched;
      }
      if (touched && reducedMotion) completeReducedMotionField(field);
    }
    previousPointer.current = {
      u: pointer.u,
      v: pointer.v,
      inside: pointer.inside,
    };

    if (field.ignited && !field.complete && !reducedMotion) {
      const advanced = advanceBurnField(field, rawDt, accumulator.current);
      accumulator.current = advanced.accumulator;
    }

    if (field.caught && !reportedIgnition.current) {
      reportedIgnition.current = true;
      onIgnition?.();
    }

    if (field.ignited) {
      writeBurnTexture(field, simulation.bytes);
      upsampleBurnTexture(
        simulation.bytes,
        FIELD_W,
        FIELD_H,
        simulation.visualBytes,
        VISUAL_FIELD_W,
        VISUAL_FIELD_H,
      );
      // eslint-disable-next-line react-hooks/immutability -- R3F owns this upload flag.
      simulation.texture.needsUpdate = true;
    }

    const progress = burnProgress(field);
    if (
      progress >= reportedProgress.current + 0.025 ||
      (field.complete && reportedProgress.current < 1)
    ) {
      reportedProgress.current = field.complete ? 1 : progress;
      onProgress?.(reportedProgress.current);
    }

    if (field.complete && !reportedComplete.current) {
      reportedComplete.current = true;
      onComplete?.();
    }
  });

  const pages = [...plan.left, ...plan.right];
  return (
    <>
      {pages.map((entry) => (
        <BurnPage
          key={`${entry.side}:${entry.layer}:${entry.textureKey}`}
          entry={entry}
          geometry={pageGeometry}
          pageSize={pageSize}
          burnMap={simulation.texture}
          maxLayers={simulation.field.maxLayers}
        />
      ))}
      {!reducedMotion ? (
        <>
          <IgniteAtmosphere
            field={simulation.field}
            pw={pw}
            ph={ph}
            reducedMotion={reducedMotion}
          />
          <IgniteDebris
            field={simulation.field}
            burnMap={simulation.texture}
            pw={pw}
            ph={ph}
            tableZ={TABLE_Z}
            reducedMotion={reducedMotion}
          />
        </>
      ) : null}
    </>
  );
}
