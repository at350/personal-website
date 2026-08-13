import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { BurnField } from "./burnField";
import {
  advanceCombustionFluid,
  COMBUSTION_EXTENT_X,
  COMBUSTION_EXTENT_Y,
  createCombustionFluid,
  writeCombustionTexture,
} from "./combustionFluid";

interface IgniteAtmosphereProps {
  field: BurnField;
  pw: number;
  ph: number;
  reducedMotion: boolean;
}

const FLUID_WIDTH = 144;
const FLUID_HEIGHT = 108;

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
 * The visible fire is the combustion fluid itself, not a set of drawn flame
 * shapes. Advected flame density (already injected along the live frontier
 * and carried upward by real buoyancy) is amplified, striated by rising
 * noise, and colored by temperature; the instantaneous source band anchors a
 * white-hot contact line on the char lip. Because no tracked object exists
 * between the simulation and the pixels, fire appears exactly where paper
 * burns, churns with the gas, and dies in place — nothing can glide, pop, or
 * reveal a sprite boundary.
 */
const flameFieldFragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uFluid;
  uniform vec2 uTexel;

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
    if (fluid.r + fluid.g + fluid.a < .012) discard;

    float t = uTime;
    vec2 p = vFieldPosition;

    // Two rising striation fields at different speeds carve the gas into
    // vertical tongues; a slower field flickers whole regions a few times a
    // second the way combustion actually breathes.
    float streakA = noise21(vec2(p.x * .048, p.y * .055 - t * 2.5));
    float streakB = noise21(vec2(p.x * .095 + 13.7, p.y * .07 - t * 4.2));
    float flicker = .6 + .4 * noise21(vec2(t * 3.2, p.x * .014));

    // Licking: refetch the fluid slightly below through a noise-warped
    // offset, so density is dragged upward into irregular tips that stretch
    // and tear with the striation instead of ending at the plume boundary.
    vec2 lick = vec2(
      (streakA - .5) * .017 + (streakB - .5) * .008,
      -.011 - streakB * .015
    );
    float carried = texture2D(
      uFluid,
      clamp(vFluidUv + lick, vec2(.003), vec2(.997))
    ).r;
    float carriedFar = texture2D(
      uFluid,
      clamp(vFluidUv + lick * 2.2, vec2(.003), vec2(.997))
    ).r;

    float flameDensity = max(fluid.r, max(carried * .9, carriedFar * .72));
    flameDensity *= (.5 + streakA * .5) * (.55 + streakB * .45) * flicker;

    // The instantaneous reaction band hugs the char lip: a narrow, hot,
    // anchored contact line under the buoyant body.
    float foot = smoothstep(.05, .45, fluid.a);
    float heat = max(smoothstep(.09, .62, fluid.g) * .85, foot);

    float body = smoothstep(.07, .33, flameDensity);
    float core = smoothstep(.2, .58, flameDensity) * heat;
    float whiteCore = smoothstep(.46, .82, heat) *
      smoothstep(.13, .38, flameDensity);
    whiteCore = max(whiteCore, foot * smoothstep(.05, .2, flameDensity + fluid.a));

    float alpha = body * mix(
      .05,
      .8,
      smoothstep(.1, .48, flameDensity + heat * .3)
    );
    alpha += whiteCore * .18;
    if (alpha < .008) discard;

    vec3 ember = vec3(.42, .03, .002);
    vec3 orange = vec3(1.0, .26, .01);
    vec3 yellow = vec3(1.0, .74, .05);
    vec3 whiteHot = vec3(1.0, .97, .78);
    vec3 color = mix(ember, orange, smoothstep(.08, .3, flameDensity));
    color = mix(color, yellow, core);
    color = mix(color, whiteHot, whiteCore);
    // Premultiplied so the dim envelope can never read as a flat decal.
    float finalAlpha = clamp(alpha, 0.0, .9);
    gl_FragColor = vec4(color * finalAlpha, finalAlpha);
  }
`;

interface AtmosphereSimulation {
  fluid: ReturnType<typeof createCombustionFluid>;
  bytes: Uint8Array;
  texture: THREE.DataTexture;
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

function makeFlameMaterial(texture: THREE.DataTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFluid: { value: texture },
      uTexel: { value: new THREE.Vector2(1 / FLUID_WIDTH, 1 / FLUID_HEIGHT) },
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
  const simulation = useMemo(
    () => makeAtmosphereSimulation(field.width, field.height),
    [field],
  );
  const smokeMaterial = useMemo(
    () => makeSmokeMaterial(simulation.texture),
    [simulation],
  );
  const flameMaterial = useMemo(
    () => makeFlameMaterial(simulation.texture),
    [simulation],
  );

  useEffect(() => {
    simulationRef.current = simulation;
    accumulator.current = 0;
    return () => {
      if (simulationRef.current === simulation) simulationRef.current = null;
      smokeMaterial.dispose();
      flameMaterial.dispose();
      simulation.texture.dispose();
    };
  }, [flameMaterial, simulation, smokeMaterial]);

  // R3F render loops are intentionally imperative; React never reads the
  // uniform values mutated here.
  // eslint-disable-next-line react-hooks/immutability
  useFrame(({ clock }, rawDelta) => {
    // eslint-disable-next-line react-hooks/immutability -- R3F owns uniforms.
    flameMaterial.uniforms.uTime!.value = clock.elapsedTime;
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
    if (!activeSimulation) return;
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
        renderOrder={42}
        frustumCulled={false}
        material={flameMaterial}
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
    </group>
  );
}
