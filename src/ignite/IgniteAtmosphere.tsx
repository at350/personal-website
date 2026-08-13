import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { BurnField } from "./burnField";
import {
  advanceCombustionFluid,
  COMBUSTION_EXTENT_X,
  COMBUSTION_EXTENT_Y,
  createCombustionFluid,
  writeCombustionRoots,
  writeCombustionTexture,
  type CombustionRootTargets,
} from "./combustionFluid";
import {
  advanceFlameEnvelope,
  flameClusterProfile,
  type FlameClusterProfile,
} from "./flameRibbonState";

interface IgniteAtmosphereProps {
  field: BurnField;
  pw: number;
  ph: number;
  reducedMotion: boolean;
}

const FLUID_WIDTH = 144;
const FLUID_HEIGHT = 108;
// Seven trackable roots cover a long active contour with separated flame
// clusters; three left most of the frontier visibly cold.
const FLAME_ROOTS = 7;

const atmosphereVertex = /* glsl */ `
  varying vec2 vFieldPosition;
  varying vec2 vFluidUv;

  void main() {
    vFieldPosition = position.xy;
    vFluidUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const smokeFragment = /* glsl */ `
  precision highp float;

  uniform sampler2D uFluid;
  uniform vec2 uTexel;

  varying vec2 vFluidUv;

  void main() {
    vec2 safeUv = clamp(vFluidUv, vec2(.002), vec2(.998));
    float smoke = texture2D(uFluid, safeUv).b * .72;
    smoke += texture2D(uFluid, safeUv + vec2(0.0, uTexel.y)).b * .14;
    smoke += texture2D(uFluid, safeUv - vec2(0.0, uTexel.y)).b * .14;
    smoke = pow(clamp(smoke, 0.0, 1.0), 1.62);
    float body = smoothstep(.12, .46, smoke);
    float alpha = body * mix(.006, .034, smoke);
    if (alpha < .0015) discard;
    vec3 color = mix(vec3(.48, .465, .44), vec3(.19, .18, .165), body * .52);
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * The visible flame is a continuous scalar field, not a collection of flame
 * silhouettes. Each hot-front root contributes a thin, turbulent density
 * ribbon and the advected combustion texture bends and dissolves those ribbons
 * as they rise. Density is shaded monotonically, so there is no outline or
 * glow band that can read as an emoji/decal on the paper.
 */
const flameFieldFragment = /* glsl */ `
  precision highp float;

  #define FLAME_ROOT_COUNT 7

  uniform float uTime;
  uniform sampler2D uFluid;
  uniform vec2 uTexel;
  // xy = local page position, z = intensity, w = horizontal fluid flow.
  uniform vec4 uRoots[FLAME_ROOT_COUNT];
  // x = source-arc span, y = rise, z = phase, w = branch bias.
  uniform vec4 uProfiles[FLAME_ROOT_COUNT];
  uniform vec2 uTangents[FLAME_ROOT_COUNT];

  varying vec2 vFieldPosition;
  varying vec2 vFluidUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise21(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x),
      mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + 1.0), local.x),
      local.y
    );
  }

  float orientedGaussian(
    vec2 point,
    vec2 centre,
    vec2 tangent,
    vec2 radius
  ) {
    vec2 normal = vec2(-tangent.y, tangent.x);
    vec2 delta = point - centre;
    vec2 local = vec2(dot(delta, tangent), dot(delta, normal)) /
      max(radius, vec2(.5));
    return exp(-dot(local, local) * 2.25);
  }

  float boundedUnion(float accumulated, float contribution) {
    float bounded = clamp(contribution, 0.0, 1.0);
    return accumulated + bounded - accumulated * bounded;
  }

  vec4 filteredFluid(vec2 uv) {
    vec2 safeUv = clamp(uv, vec2(.003), vec2(.997));
    vec4 centre = texture2D(uFluid, safeUv) * .40;
    centre += texture2D(uFluid, safeUv + vec2(uTexel.x, 0.0)) * .12;
    centre += texture2D(uFluid, safeUv - vec2(uTexel.x, 0.0)) * .12;
    centre += texture2D(uFluid, safeUv + vec2(0.0, uTexel.y)) * .12;
    centre += texture2D(uFluid, safeUv - vec2(0.0, uTexel.y)) * .12;
    centre += texture2D(uFluid, safeUv + uTexel) * .03;
    centre += texture2D(uFluid, safeUv - uTexel) * .03;
    centre += texture2D(uFluid, safeUv + vec2(uTexel.x, -uTexel.y)) * .03;
    centre += texture2D(uFluid, safeUv + vec2(-uTexel.x, uTexel.y)) * .03;
    return centre;
  }

  void main() {
    vec4 fluid = filteredFluid(vFluidUv);
    float ribbonDensity = 0.0;
    float coreDensity = 0.0;
    float sourceDensity = 0.0;
    float rootReach = 0.0;

    for (int rootIndex = 0; rootIndex < FLAME_ROOT_COUNT; rootIndex++) {
      vec4 rootData = uRoots[rootIndex];
      float intensity = rootData.z;
      if (intensity < .006) continue;

      vec4 profile = uProfiles[rootIndex];
      float arcWidth = profile.x;
      float rise = profile.y;
      float phase = profile.z;
      float branchBias = profile.w;
      vec2 root = rootData.xy;
      vec2 rootDelta = vFieldPosition - root;
      // Cheap spatial rejection: with seven live clusters most fragments are
      // far from most roots, and skipping their noise work keeps the larger
      // root count no more expensive than the old three.
      if (
        abs(rootDelta.x) > arcWidth * 2.7 ||
        rootDelta.y < -16.0 ||
        rootDelta.y > rise * 1.42
      ) continue;
      vec2 tangent = normalize(uTangents[rootIndex] + vec2(1e-5, 0.0));
      float time = uTime * (1.0 + float(rootIndex) * .073) + phase;

      // Fuel feed breathes: each cluster periodically drives a taller tongue
      // and drops back, so the frontier reads as live rolling fire instead of
      // a constant decal.
      float tonguePulse = smoothstep(
        .45,
        .95,
        .5 + .5 * sin(time * 1.35 + phase * 2.7)
      );
      rise *= .84 + tonguePulse * .42;

      // A short Gaussian source lies exactly along the sampled cut tangent.
      // It is intentionally dim: the readable volume begins as the gas rises,
      // not as a glowing stripe laid over the paper.
      float source = orientedGaussian(
        vFieldPosition,
        root + vec2(0.0, 1.2),
        tangent,
        vec2(arcWidth * .19, 2.35)
      ) * intensity;
      sourceDensity = boundedUnion(sourceDensity, source);

      float y = max(rootDelta.y, 0.0);
      float level = clamp(y / rise, 0.0, 1.0);
      float verticalGate = smoothstep(-1.5, 2.8, rootDelta.y) *
        (1.0 - smoothstep(.76, 1.03, level));
      float slowSway = sin(time * .73 + level * 5.4 + branchBias * 4.0);
      float fastSway = sin(time * 1.81 - level * 8.7 + phase * .37);
      float centreX = slowSway * arcWidth * (.028 + level * .105);
      centreX += fastSway * arcWidth * (.01 + level * .042);
      centreX += rootData.w * rise * level * .11;
      centreX += branchBias * arcWidth * level * .12;

      float widthPulse = .92 + .08 * sin(time * 2.1 + level * 12.0 + phase);
      float halfWidth = arcWidth * mix(.32, .075, pow(level, .72)) * widthPulse;
      // A tongue is never wider than it is tall. Untied, a wide span with a
      // low pulse collapsed into a rounded-rectangle lozenge.
      halfWidth = min(halfWidth, rise * .4);
      float lateral = (rootDelta.x - centreX) / max(halfWidth, .75);
      float ribbon = exp(-lateral * lateral * 1.05) * verticalGate;
      ribbon *= 1.0 - smoothstep(.58, 1.0, level) * .3;

      // Coherent low-frequency erosion travels upward with the gas. It changes
      // the ribbon's density without cutting it into separate round sprites.
      float materialNoise = noise21(vec2(
        (rootDelta.x - centreX) * .07 + phase,
        level * 6.2 - time * 1.05
      ));
      float broadBillow = noise21(vec2(
        (rootDelta.x - centreX) * .032 + phase * .37,
        level * 3.1 - time * .62
      ));
      float billow = .62 + materialNoise * .22 + broadBillow * .16;
      billow *= .88 + .12 * sin(level * 17.0 - time * 2.25 + phase);
      // The physical fluid decides where the analytic support is luminous.
      // This removes the last solid triangular fill while keeping a coherent
      // sub-pixel spine during the fluid's first few frames after ignition.
      float localFluid = texture2D(uFluid, clamp(vFluidUv, vec2(.003), vec2(.997))).r;
      float fluidModulation = mix(.2, 1.0, smoothstep(.045, .34, localFluid));
      ribbon *= billow * fluidModulation * intensity;

      float neckWave = .5 + .5 * sin(level * 11.5 - time * 1.7 + phase);
      float neck = smoothstep(.12, .82, neckWave + broadBillow * .2);
      ribbon *= mix(.78, 1.0, neck * smoothstep(.20, .62, level));

      // A narrow upper shear layer occasionally peels away from the main
      // tongue. It remains connected through the shared lower ribbon.
      float forkGate = smoothstep(.48, .68, level) *
        (1.0 - smoothstep(.84, .98, level));
      float forkSide = mix(-1.0, 1.0, step(.5, hash21(vec2(phase, 8.3))));
      float forkCentre = centreX + forkSide * halfWidth *
        (.5 + .14 * sin(time * 1.17 + level * 6.0));
      float forkLateral = (rootDelta.x - forkCentre) /
        max(halfWidth * .52, .6);
      float fork = exp(-forkLateral * forkLateral * 1.85) * forkGate;
      fork *= (.36 + .22 * sin(time * 1.31 + phase)) * intensity;

      float plume = boundedUnion(ribbon, max(fork, 0.0));
      ribbonDensity = boundedUnion(ribbonDensity, plume);

      float coreWidth = max(halfWidth * mix(.66, .38, level), .65);
      float coreLateral = (rootDelta.x - centreX * .58) / coreWidth;
      float core = exp(-coreLateral * coreLateral * 2.15);
      core *= verticalGate * (1.0 - smoothstep(.45, .78, level));
      coreDensity = boundedUnion(coreDensity, core * intensity);

      float reach = (1.0 - smoothstep(
        arcWidth * .52,
        arcWidth * 1.12 + rise * level * .18,
        abs(rootDelta.x - centreX)
      )) * verticalGate * smoothstep(.01, .18, intensity);
      rootReach = boundedUnion(rootReach, reach);
    }

    // The simulation supplies real advection and vorticity. Restricting it to
    // the root reach prevents a diffuse orange veil from following the whole
    // burn contour, while its texture still breaks the analytic ribbon apart.
    float advected = smoothstep(.075, .57, fluid.r) * rootReach;
    float advectedHeat = smoothstep(.10, .70, fluid.g) * rootReach;
    float density = boundedUnion(ribbonDensity * .98, advected * .46);
    density = boundedUnion(density, sourceDensity * .34);
    // The narrow contact band along the char lip stays yellow-white hot, so
    // every cluster is visibly anchored to burning paper.
    float heat = boundedUnion(coreDensity, advectedHeat * .78);
    heat = boundedUnion(heat, sourceDensity * .58);

    float aa = max(fwidth(density) * 1.35, .0045);
    float envelope = smoothstep(.125 - aa, .205 + aa, density);
    float body = smoothstep(.15, .4, density);
    float hot = smoothstep(.13, .46, heat) * smoothstep(.125, .27, density);
    float whiteCore = smoothstep(.5, .84, heat) *
      smoothstep(.27, .56, density);

    // Alpha grows continuously toward the centre. There is no brighter or
    // more opaque perimeter, hence no neon outline around each tongue.
    float alpha = envelope * mix(.005, .7, body);
    alpha += hot * .26 + whiteCore * .15;
    if (alpha < .006) discard;

    vec3 ember = vec3(.36, .018, .001);
    vec3 orange = vec3(1.0, .22, .006);
    vec3 yellow = vec3(1.0, .72, .045);
    vec3 whiteHot = vec3(1.0, .975, .74);
    vec3 color = mix(ember, orange, smoothstep(.13, .36, density));
    color = mix(color, yellow, hot * .92);
    color = mix(color, whiteHot, whiteCore * .9);
    // Premultiplication prevents the low-alpha ember envelope from being
    // interpreted by the compositor as a flat translucent red decal.
    float finalAlpha = clamp(alpha, 0.0, .88);
    gl_FragColor = vec4(color * finalAlpha, finalAlpha);
  }
`;

interface AtmosphereSimulation {
  fluid: ReturnType<typeof createCombustionFluid>;
  bytes: Uint8Array;
  texture: THREE.DataTexture;
}

interface FlameFieldSystem {
  geometry: THREE.PlaneGeometry;
  material: THREE.ShaderMaterial;
  candidates: CombustionRootTargets;
  candidateCount: number;
  currentUv: Float32Array;
  currentIntensity: Float32Array;
  currentFlow: Float32Array;
  currentSpan: Float32Array;
  currentTangent: Float32Array;
  candidateUsed: Uint8Array;
  slotCandidate: Int8Array;
  rootUniforms: THREE.Vector4[];
  profileUniforms: THREE.Vector4[];
  tangentUniforms: THREE.Vector2[];
  profiles: FlameClusterProfile[];
}

function makeAtmosphereSimulation(
  sourceWidth: number,
  sourceHeight: number,
): AtmosphereSimulation {
  if (sourceWidth < 1 || sourceHeight < 1) {
    throw new Error("The combustion source field must not be empty");
  }
  const fluid = createCombustionFluid(FLUID_WIDTH, FLUID_HEIGHT);
  const bytes = new Uint8Array(FLUID_WIDTH * FLUID_HEIGHT * 4);
  writeCombustionTexture(fluid, bytes);
  const texture = new THREE.DataTexture(
    bytes,
    FLUID_WIDTH,
    FLUID_HEIGHT,
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
  return { fluid, bytes, texture };
}

function makeSmokeMaterial(texture: THREE.DataTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFluid: { value: texture },
      uTexel: { value: new THREE.Vector2(1 / FLUID_WIDTH, 1 / FLUID_HEIGHT) },
    },
    vertexShader: atmosphereVertex,
    fragmentShader: smokeFragment,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function makeFlameFieldSystem(
  pw: number,
  ph: number,
  fluidTexture: THREE.DataTexture,
): FlameFieldSystem {
  const rootUniforms = Array.from(
    { length: FLAME_ROOTS },
    () => new THREE.Vector4(-100000, -100000, 0, 0),
  );
  const profiles = Array.from(
    { length: FLAME_ROOTS },
    (_, index) => flameClusterProfile(index),
  );
  const profileUniforms = profiles.map((profile) => new THREE.Vector4(
    profile.arcWidth,
    profile.rise,
    profile.phase,
    profile.branchBias,
  ));
  const tangentUniforms = Array.from(
    { length: FLAME_ROOTS },
    () => new THREE.Vector2(1, 0),
  );
  const geometry = new THREE.PlaneGeometry(
    pw * 2 * COMBUSTION_EXTENT_X,
    ph * COMBUSTION_EXTENT_Y,
    1,
    1,
  );
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFluid: { value: fluidTexture },
      uTexel: { value: new THREE.Vector2(1 / FLUID_WIDTH, 1 / FLUID_HEIGHT) },
      uRoots: { value: rootUniforms },
      uProfiles: { value: profileUniforms },
      uTangents: { value: tangentUniforms },
    },
    vertexShader: atmosphereVertex,
    fragmentShader: flameFieldFragment,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  return {
    geometry,
    material,
    candidates: {
      uv: new Float32Array(FLAME_ROOTS * 2),
      strength: new Float32Array(FLAME_ROOTS),
      flow: new Float32Array(FLAME_ROOTS),
      tangent: new Float32Array(FLAME_ROOTS * 2),
      span: new Float32Array(FLAME_ROOTS),
    },
    candidateCount: 0,
    currentUv: new Float32Array(FLAME_ROOTS * 2),
    currentIntensity: new Float32Array(FLAME_ROOTS),
    currentFlow: new Float32Array(FLAME_ROOTS),
    currentSpan: new Float32Array(FLAME_ROOTS),
    currentTangent: new Float32Array(FLAME_ROOTS * 2),
    candidateUsed: new Uint8Array(FLAME_ROOTS),
    slotCandidate: new Int8Array(FLAME_ROOTS),
    rootUniforms,
    profileUniforms,
    tangentUniforms,
    profiles,
  };
}

function assignFlameCandidates(
  system: FlameFieldSystem,
  fluid: ReturnType<typeof createCombustionFluid>,
  burn: BurnField,
) {
  system.candidateCount = writeCombustionRoots(
    fluid,
    system.candidates,
    FLAME_ROOTS,
    burn,
  );
  system.candidateUsed.fill(0);
  system.slotCandidate.fill(-1);

  const maximumTrackingDistanceSquared = 18 * 18;
  for (let slot = 0; slot < FLAME_ROOTS; slot += 1) {
    if ((system.currentIntensity[slot] ?? 0) < .012) continue;
    const offset = slot * 2;
    const currentX = (system.currentUv[offset] ?? .5) * fluid.width;
    const currentY = (system.currentUv[offset + 1] ?? .5) * fluid.height;
    let nearest = -1;
    let nearestDistanceSquared = maximumTrackingDistanceSquared;
    for (let candidate = 0; candidate < system.candidateCount; candidate += 1) {
      if ((system.candidateUsed[candidate] ?? 0) === 1) continue;
      const candidateOffset = candidate * 2;
      const dx = (system.candidates.uv[candidateOffset] ?? .5) * fluid.width -
        currentX;
      const dy = (system.candidates.uv[candidateOffset + 1] ?? .5) *
        fluid.height - currentY;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < nearestDistanceSquared) {
        nearest = candidate;
        nearestDistanceSquared = distanceSquared;
      }
    }
    if (nearest < 0) continue;
    system.slotCandidate[slot] = nearest;
    system.candidateUsed[nearest] = 1;
  }

  for (let candidate = 0; candidate < system.candidateCount; candidate += 1) {
    if ((system.candidateUsed[candidate] ?? 0) === 1) continue;
    let availableSlot = -1;
    let weakest = .012;
    for (let slot = 0; slot < FLAME_ROOTS; slot += 1) {
      if ((system.slotCandidate[slot] ?? -1) >= 0) continue;
      const intensity = system.currentIntensity[slot] ?? 0;
      if (intensity < weakest) {
        weakest = intensity;
        availableSlot = slot;
      }
    }
    if (availableSlot < 0) continue;
    system.slotCandidate[availableSlot] = candidate;
    system.candidateUsed[candidate] = 1;
  }
}

function updateFlameField(
  system: FlameFieldSystem,
  fluid: ReturnType<typeof createCombustionFluid>,
  burn: BurnField,
  pw: number,
  ph: number,
) {
  assignFlameCandidates(system, fluid, burn);
  const worldCellX = pw * 2 * COMBUSTION_EXTENT_X / fluid.width;
  const worldCellY = ph * COMBUSTION_EXTENT_Y / fluid.height;

  for (let index = 0; index < FLAME_ROOTS; index += 1) {
    const offset = index * 2;
    const candidate = system.slotCandidate[index] ?? -1;
    const incoming = candidate >= 0
      ? system.candidates.strength[candidate] ?? 0
      : 0;
    if (incoming > 0) {
      const candidateOffset = candidate * 2;
      const targetU = system.candidates.uv[candidateOffset] ?? .5;
      const targetV = system.candidates.uv[candidateOffset + 1] ?? .5;
      const targetTangentX = system.candidates.tangent[candidateOffset] ?? 1;
      const targetTangentY = system.candidates.tangent[candidateOffset + 1] ?? 0;
      if ((system.currentIntensity[index] ?? 0) < .015) {
        system.currentUv[offset] = targetU;
        system.currentUv[offset + 1] = targetV;
        system.currentTangent[offset] = targetTangentX;
        system.currentTangent[offset + 1] = targetTangentY;
      } else {
        system.currentUv[offset] += (targetU - system.currentUv[offset]!) * .34;
        system.currentUv[offset + 1] +=
          (targetV - system.currentUv[offset + 1]!) * .34;
        system.currentTangent[offset] +=
          (targetTangentX - system.currentTangent[offset]!) * .24;
        system.currentTangent[offset + 1] +=
          (targetTangentY - system.currentTangent[offset + 1]!) * .24;
      }
      system.currentIntensity[index] = advanceFlameEnvelope(
        system.currentIntensity[index] ?? 0,
        incoming,
      );
      system.currentFlow[index] +=
        ((system.candidates.flow[candidate] ?? 0) - system.currentFlow[index]!) *
        .28;
      system.currentSpan[index] +=
        ((system.candidates.span?.[candidate] ?? 0) -
          system.currentSpan[index]!) * .22;
    } else {
      system.currentIntensity[index] = advanceFlameEnvelope(
        system.currentIntensity[index] ?? 0,
        0,
      );
      system.currentFlow[index] *= .86;
      system.currentSpan[index] *= .93;
    }

    const intensity = system.currentIntensity[index] ?? 0;
    const rootUniform = system.rootUniforms[index]!;
    if (intensity < .008) {
      rootUniform.set(-100000, -100000, 0, 0);
      continue;
    }

    const u = system.currentUv[offset] ?? .5;
    const v = system.currentUv[offset + 1] ?? .5;
    rootUniform.set(
      (u - .5) * pw * 2 * COMBUSTION_EXTENT_X,
      (v - .5) * ph * COMBUSTION_EXTENT_Y,
      intensity,
      system.currentFlow[index] ?? 0,
    );

    // The root UV is written from the exact selected fluid cell centre, so
    // page cut sampling and flame placement share one coordinate transform.

    const rawTangentX = (system.currentTangent[offset] ?? 1) * worldCellX;
    const rawTangentY = (system.currentTangent[offset + 1] ?? 0) * worldCellY;
    const tangentLength = Math.hypot(rawTangentX, rawTangentY) || 1;
    system.tangentUniforms[index]!.set(
      rawTangentX / tangentLength,
      rawTangentY / tangentLength,
    );

    const profile = system.profiles[index]!;
    const span = system.currentSpan[index] ?? 0;
    // A long surrounding frontier widens the attached cluster; the buoyant
    // column may never overrun the top of the atmosphere quad, which would
    // read as gas clipping against an invisible boundary.
    const rootY = (v - .5) * ph * COMBUSTION_EXTENT_Y;
    const quadTop = ph * COMBUSTION_EXTENT_Y * .5;
    const maximumRise = Math.max(26, (quadTop - rootY - 12) / 1.42);
    system.profileUniforms[index]!.set(
      profile.arcWidth * (.66 + intensity * .12 + span * .42),
      Math.min(profile.rise * (.74 + intensity * .26), maximumRise),
      profile.phase,
      profile.branchBias,
    );
  }
}

export function IgniteAtmosphere({
  field,
  pw,
  ph,
  reducedMotion,
}: IgniteAtmosphereProps) {
  const accumulator = useRef(0);
  const completeSince = useRef<number | null>(null);
  const simulationRef = useRef<AtmosphereSimulation | null>(null);
  const flameSystemRef = useRef<FlameFieldSystem | null>(null);
  const simulation = useMemo(
    () => makeAtmosphereSimulation(field.width, field.height),
    [field],
  );
  const smokeMaterial = useMemo(
    () => makeSmokeMaterial(simulation.texture),
    [simulation],
  );
  const flameSystem = useMemo(
    () => makeFlameFieldSystem(pw, ph, simulation.texture),
    [ph, pw, simulation.texture],
  );

  useEffect(() => {
    simulationRef.current = simulation;
    flameSystemRef.current = flameSystem;
    accumulator.current = 0;
    return () => {
      if (simulationRef.current === simulation) simulationRef.current = null;
      if (flameSystemRef.current === flameSystem) flameSystemRef.current = null;
      smokeMaterial.dispose();
      flameSystem.geometry.dispose();
      flameSystem.material.dispose();
      simulation.texture.dispose();
    };
  }, [flameSystem, simulation, smokeMaterial]);

  useFrame(({ clock }, rawDelta) => {
    const activeFlameSystem = flameSystemRef.current;
    if (activeFlameSystem) {
      activeFlameSystem.material.uniforms.uTime.value = clock.elapsedTime;
    }
    if (reducedMotion || !field.ignited) return;
    // Residual smoke needs a few seconds to disperse after the last paper is
    // consumed; once it has, the fluid holds nothing visible and stepping it
    // every frame would only heat the main thread at the terminal ash state.
    if (field.complete) {
      if (completeSince.current === null) {
        completeSince.current = clock.elapsedTime;
      } else if (clock.elapsedTime - completeSince.current > 7) {
        return;
      }
    }
    const activeSimulation = simulationRef.current;
    if (!activeSimulation || !activeFlameSystem) return;
    const advanced = advanceCombustionFluid(
      activeSimulation.fluid,
      field,
      rawDelta,
      accumulator.current,
    );
    accumulator.current = advanced.accumulator;
    if (advanced.steps === 0) return;
    writeCombustionTexture(activeSimulation.fluid, activeSimulation.bytes);
    activeSimulation.texture.needsUpdate = true;
    updateFlameField(activeFlameSystem, activeSimulation.fluid, field, pw, ph);
  });

  return (
    <group>
      <mesh
        position={[0, 0, 19]}
        renderOrder={41}
        frustumCulled={false}
        material={smokeMaterial}
      >
        <planeGeometry
          args={[
            pw * 2 * COMBUSTION_EXTENT_X,
            ph * COMBUSTION_EXTENT_Y,
            1,
            1,
          ]}
        />
      </mesh>
      <mesh
        position={[0, 0, 21]}
        geometry={flameSystem.geometry}
        material={flameSystem.material}
        renderOrder={42}
        frustumCulled={false}
      />
    </group>
  );
}
