/* The physical book: page stacks with real thickness, a bending leaf,
   one key light, honest shadows. World units are CSS pixels. */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { useFrame, useThree } from "@react-three/fiber";
import { LEAF_ROWS, LEAF_SEGMENTS, leafSurface } from "./bend";
import { PaperSheet } from "./paperPhysics";
import { handoffOpacity } from "./handoff";
import { bookPoseAngles } from "./bookPose";
import { injectPaperActivity, paperGleamActivity } from "./paperMaterial";
import {
  SETTLE_PROGRESS_TOLERANCE,
  SETTLE_VELOCITY_TOLERANCE,
  settleComplete,
} from "./settle";
import { withBasePath } from "@/lib/basePath";
import { getPageTexture, onTexturesChanged, pageKey } from "./pageTextures";
import { SPREADS } from "@/magazine/folio";

export const CAM_FOV = 22;

export interface BookMotion {
  /** Leaf in flight (engine sheet index) or null. */
  leaf: number | null;
  current: number;
  /** Turn progress of the leaf, 0..1. */
  progress: number;
  velocity: number;
  /** Spring target when settling, or null while dragging. */
  target: number | null;
  /** Where the hand wants the leaf while dragging; the leaf springs after it. */
  dragTarget: number;
  dragging: boolean;
  /** Recorded pointer height, -1 bottom edge to +1 top edge. */
  grabY: number;
  /** Live vertical travel of the held point in local paper pixels. */
  grabOffsetY: number;
  /** Physical turn direction so the grabbed row leads in either direction. */
  turnDirection: 1 | -1;
  /** True when the current settle came from a released drag (snappier spring). */
  released: boolean;
  /** Set by the pointer-up handler; the reducer mirror consumes it. An
      explicit marker — progress alone cannot distinguish a drag released at
      an exact extreme from an auto turn that must re-seed from the far side. */
  releasedDrag: boolean;
  /** Physical motion of the sheet solver, written by the leaf each frame. */
  sheetEnergy: number;
  /** Seconds the settle gate has held a nominally landed turn. */
  settleHold: number;
  /** The settle gate has fired; the leaf is down and awaiting unmount. The
      material must read as exactly the resting texture from here on, even if
      the gate fired via the hold cap with residual sheet energy. */
  swapReady: boolean;
  /** Horizontal book shift in px (centers the closed cover). */
  shift: number;
  /** Screen-space spine position recorded at turn start. */
  turnShift: number;
  /** Pointer position -1..1 for parallax. */
  pointerX: number;
  pointerY: number;
  /**
   * Presentation pose target: 0 = three-quarter display object (spine, top
   * edge and cover all visible — the Stripe Press stance), 1 = flat reading
   * position where the live DOM takes over.
   */
  poseTarget: number;
  /** Smoothed pose value, written by the scene each frame. */
  pose: number;
  /** Pose recorded when a turn begins; the stage stays fixed while paper moves. */
  turnPose: number;
  /** Exact geometric readiness of the WebGL-to-DOM handoff. */
  handoff: number;
  /** Scene to stage: report pose and subpixel handoff readiness. */
  onPose: ((pose: number, handoff: number) => void) | null;
  onSettled: (() => void) | null;
}

const TOTAL_LEAVES = SPREADS.length - 1;
const LEAF_THICKNESS = 2.3;
/** Softer spring for choreographed turns; snappier when a drag is released.
    Damping sits just under critical — paper flexes at the end of a turn,
    it does not clunk into place like a stone. */
const SPRING_K_AUTO = 55;
const SPRING_K_RELEASE = 115;
const SPRING_DAMPING = 0.88;
/** While dragging, the leaf CHASES the hand through its own little spring —
    paper is compliant, not a rod welded to the pointer. */
const DRAG_FOLLOW_K = 520;

function edgeTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 8, 128);
  ctx.fillStyle = "#e9e8e4";
  for (let y = 1; y < 128; y += 3) ctx.fillRect(0, y, 8, 1);
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.y = 10;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function usePaperBumpTexture() {
  return useMemo(() => {
    const texture = new THREE.TextureLoader().load(
      withBasePath("/images/editorial/paper-fiber.webp"),
    );
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 7);
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, []);
}

function usePageMaterial(
  key: string | null,
  mirror = false,
  unlit = false,
  paperBump?: THREE.Texture,
) {
  const mat = useMemo(() => {
    if (unlit) {
      // Static pages are exactly the DOM's pixels: no lighting math at all.
      return new THREE.MeshBasicMaterial({
        color: 0xffffff,
        toneMapped: false,
      });
    }
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.46,
      metalness: 0,
      bumpMap: paperBump,
      bumpScale: 0.08,
      sheen: 0.32,
      sheenColor: new THREE.Color(0xffffff),
      sheenRoughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.16,
      specularIntensity: 0.75,
      ior: 1.45,
    });
    m.userData.paperActivity = 0;
    // Every lighting response — base specular AND three's sheen/clearcoat
    // post-mixes — rises only while the page is airborne. At both landing
    // frames this resolves to the exact captured texture, so the physical
    // leaf and the unlit stack/DOM cannot shift color on swap.
    m.onBeforeCompile = (shader) => {
      shader.uniforms.paperActivity = {
        value: Number(m.userData.paperActivity ?? 0),
      };
      m.userData.paperShader = shader;
      shader.fragmentShader = injectPaperActivity(shader.fragmentShader);
    };
    m.customProgramCacheKey = () => "editorial-paper-lighting-v4";
    return m;
  }, [paperBump, unlit]);
  // Track the applied SOURCE texture, not the key: a refreshed capture keeps
  // the key but swaps the texture object, and the material must follow.
  const applied = useRef<THREE.Texture | null>(null);
  useEffect(() => {
    const apply = () => {
      const texture = key ? getPageTexture(key) : null;
      if (texture && applied.current !== texture) {
        if (mirror && mat.map) mat.map.dispose();
        const t = mirror ? texture.clone() : texture;
        if (mirror) {
          t.wrapS = THREE.RepeatWrapping;
          t.repeat.x = -1;
          t.offset.x = 1;
        }
        mat.map = t;
        mat.needsUpdate = true;
        applied.current = texture;
      } else if (!texture && applied.current !== null) {
        if (mirror && mat.map) mat.map.dispose();
        mat.map = null;
        mat.needsUpdate = true;
        applied.current = null;
      }
    };
    apply();
    return onTexturesChanged(apply);
  }, [key, mat, mirror]);
  return mat;
}

function setPaperMaterialActivity(material: THREE.Material, activity: number) {
  material.userData.paperActivity = activity;
  const shader = material.userData.paperShader as
    | { uniforms: { paperActivity?: { value: number } } }
    | undefined;
  if (shader?.uniforms.paperActivity) {
    shader.uniforms.paperActivity.value = activity;
  }
}

function Stack({
  side,
  count,
  topKey,
  pw,
  ph,
}: {
  side: "left" | "right";
  count: number;
  topKey: string | null;
  pw: number;
  ph: number;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const rim = useRef<THREE.LineSegments>(null);
  const topMat = usePageMaterial(topKey, false, true);
  const edges = useMemo(edgeTexture, []);
  const materials = useMemo(() => {
    const paper = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const edge = new THREE.MeshBasicMaterial({ map: edges, toneMapped: false });
    // box faces: +x, -x, +y, -y, +z (camera), -z
    return [edge, edge, edge, edge, topMat, paper];
  }, [edges, topMat]);
  const geo = useMemo(() => new THREE.BoxGeometry(pw, ph, 1), [pw, ph]);
  const rimGeo = useMemo(() => new THREE.EdgesGeometry(geo, 24), [geo]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const thickness = Math.max(count * LEAF_THICKNESS, 0.001);
    const targetScale = thickness;
    m.scale.z = THREE.MathUtils.damp(m.scale.z, targetScale, 12, dt);
    m.position.z = -m.scale.z / 2;
    m.position.x = side === "left" ? -pw / 2 : pw / 2;
    m.visible = count > 0;
    const outline = rim.current;
    if (outline) {
      outline.position.copy(m.position);
      outline.scale.copy(m.scale);
      outline.visible = count > 0;
    }
  });

  return (
    <>
      <mesh ref={mesh} castShadow geometry={geo} material={materials} />
      <lineSegments ref={rim} geometry={rimGeo} renderOrder={3}>
        <lineBasicMaterial
          color="#d2d1cc"
          transparent
          opacity={0.62}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
    </>
  );
}

function gutterTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 4;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "rgba(14,14,12,0)");
  gradient.addColorStop(0.32, "rgba(14,14,12,0.025)");
  gradient.addColorStop(0.5, "rgba(14,14,12,0.105)");
  gradient.addColorStop(0.68, "rgba(14,14,12,0.025)");
  gradient.addColorStop(1, "rgba(14,14,12,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function GutterShadow({ pw, ph }: { pw: number; ph: number }) {
  const texture = useMemo(gutterTexture, []);
  return (
    <mesh position={[0, 0, 0.21]} renderOrder={2}>
      <planeGeometry args={[pw * 0.2, ph]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/* Rect-area lights render as black without their LTC lookup tables. Install
   them once, before any material that samples the gloss light compiles. */
let rectAreaLightReady = false;
function ensureRectAreaLightUniforms() {
  if (rectAreaLightReady) return;
  RectAreaLightUniformsLib.init();
  rectAreaLightReady = true;
}

function GlossLight({ pw, ph }: { pw: number; ph: number }) {
  ensureRectAreaLightUniforms();
  const light = useRef<THREE.RectAreaLight>(null);
  useEffect(() => {
    light.current?.lookAt(0, 0, 0);
  }, [ph, pw]);
  return (
    <rectAreaLight
      ref={light}
      color={0xffffff}
      intensity={4.2}
      width={pw * 0.9}
      height={ph * 0.55}
      position={[pw * 0.72, ph * 0.42, ph * 0.9]}
    />
  );
}

function Leaf({ motion, pw, ph }: { motion: BookMotion; pw: number; ph: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const backMesh = useRef<THREE.Mesh>(null);
  const paperBump = usePaperBumpTexture();
  const frontKey = motion.leaf !== null ? pageKey(motion.leaf, "recto") : null;
  const backKey = motion.leaf !== null ? pageKey(motion.leaf + 1, "verso") : null;
  const frontMat = usePageMaterial(frontKey, false, false, paperBump);
  const backMat = usePageMaterial(backKey, true, false, paperBump);
  useEffect(() => {
    frontMat.side = THREE.FrontSide;
    backMat.side = THREE.BackSide;
  }, [backMat, frontMat]);

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(pw, ph, LEAF_SEGMENTS, LEAF_ROWS);
    return g;
  }, [pw, ph]);
  const outlineGeometry = useMemo(() => {
    const outline = new THREE.BufferGeometry();
    outline.setAttribute("position", geometry.getAttribute("position"));
    const indices: number[] = [];
    const columns = LEAF_SEGMENTS + 1;
    for (let column = 0; column <= LEAF_SEGMENTS; column += 1) indices.push(column);
    for (let row = 1; row <= LEAF_ROWS; row += 1) {
      indices.push(row * columns + LEAF_SEGMENTS);
    }
    for (let column = LEAF_SEGMENTS - 1; column >= 0; column -= 1) {
      indices.push(LEAF_ROWS * columns + column);
    }
    for (let row = LEAF_ROWS - 1; row > 0; row -= 1) indices.push(row * columns);
    outline.setIndex(indices);
    return outline;
  }, [geometry]);
  const sheet = useMemo(
    () => new PaperSheet(pw, ph, LEAF_SEGMENTS, LEAF_ROWS),
    [ph, pw],
  );
  const activeLeaf = useRef<number | null>(null);

  useFrame((_, rawDt) => {
    if (motion.leaf === null) {
      activeLeaf.current = null;
      return;
    }
    const g = geometry;
    const target = leafSurface(
      motion.progress,
      pw,
      ph,
      motion.velocity,
      motion.grabY,
      motion.turnDirection,
    );
    if (activeLeaf.current !== motion.leaf) {
      sheet.reset(target);
      activeLeaf.current = motion.leaf;
    }
    const vertices = sheet.step(target, {
      dt: rawDt,
      dragging: motion.dragging,
      grabY: motion.grabY,
      handleOffsetY: motion.grabOffsetY,
      velocity: motion.velocity,
    });
    motion.sheetEnergy = sheet.motionEnergy();
    // Once the gate fires the page is down, whatever residual energy the hold
    // cap accepted — the material must be the plain texture at the swap.
    const activity = motion.swapReady
      ? 0
      : paperGleamActivity(motion.progress, motion.sheetEnergy);
    setPaperMaterialActivity(frontMat, activity);
    setPaperMaterialActivity(backMat, activity);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < vertices.length; index += 1) {
      const vertex = vertices[index]!;
      pos.setXYZ(index, vertex.x, vertex.y, vertex.z + 0.4);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  });

  if (motion.leaf === null) return null;
  return (
    <group>
      <mesh ref={mesh} geometry={geometry} material={frontMat} castShadow receiveShadow />
      <mesh ref={backMesh} geometry={geometry} material={backMat} castShadow receiveShadow />
      <lineLoop geometry={outlineGeometry} renderOrder={4}>
        <lineBasicMaterial
          color="#c9c8c3"
          transparent
          opacity={0.7}
          depthWrite={false}
          toneMapped={false}
        />
      </lineLoop>
    </group>
  );
}

/* Hidden documents get no rAF: browsers pause the loop in background tabs
   (and headless panes). Step the world manually so physics still settle and
   the canvas always has a current frame. */
function HiddenTicker() {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) advance(performance.now() / 1000);
    }, 66);
    return () => window.clearInterval(id);
  }, [advance]);
  return null;
}

function Rig({ ph }: { ph: number }) {
  const { camera, gl, size } = useThree();
  useEffect(() => {
    // White paper must render as white paper: no filmic curve between the
    // texture and the screen, or the mesh reads gray next to the DOM overlay.
    gl.toneMapping = THREE.NoToneMapping;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [gl]);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = CAM_FOV;
    const d = size.height / 2 / Math.tan(THREE.MathUtils.degToRad(CAM_FOV / 2));
    cam.position.set(0, 0, d);
    cam.near = d * 0.2;
    cam.far = d * 2.2;
    cam.updateProjectionMatrix();
  }, [camera, size, ph]);
  return null;
}

const POSE_DROP = 0.994; // posed book sits a breath smaller — object, not page

export function BookScene({ motion, pw, ph }: { motion: BookMotion; pw: number; ph: number }) {
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const clockRef = useRef(0);

  // Spring integration + settle detection lives with the frames.
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    clockRef.current += dt;
    if (motion.dragging && motion.leaf !== null) {
      // Compliant drag: progress springs after the pointer's target with a
      // short lag, so the sheet visibly flexes with the hand.
      const k = DRAG_FOLLOW_K;
      const c = 2 * Math.sqrt(k);
      const a = k * (motion.dragTarget - motion.progress) - c * motion.velocity;
      motion.velocity += a * dt;
      motion.progress = Math.min(1, Math.max(0, motion.progress + motion.velocity * dt));
      motion.settleHold = 0;
    } else if (motion.target !== null && motion.leaf !== null) {
      const k = motion.released ? SPRING_K_RELEASE : SPRING_K_AUTO;
      const c = 2 * Math.sqrt(k) * SPRING_DAMPING;
      const a = k * (motion.target - motion.progress) - c * motion.velocity;
      motion.velocity += a * dt;
      motion.progress += motion.velocity * dt;
      const nominal =
        Math.abs(motion.progress - motion.target) < SETTLE_PROGRESS_TOLERANCE &&
        Math.abs(motion.velocity) < SETTLE_VELOCITY_TOLERANCE;
      if (nominal) {
        // The spring has arrived; hold the swap until the sheet itself stops
        // moving so wobble and gleam finish on screen, not mid-motion.
        motion.settleHold += dt;
        if (
          settleComplete({
            progressError: motion.progress - motion.target,
            velocity: motion.velocity,
            sheetEnergy: motion.sheetEnergy,
            heldFor: motion.settleHold,
          })
        ) {
          motion.progress = motion.target;
          motion.velocity = 0;
          motion.settleHold = 0;
          motion.swapReady = true;
          const done = motion.onSettled;
          motion.onSettled = null;
          motion.target = null;
          done?.();
        }
      } else {
        motion.settleHold = 0;
      }
    }

    const g = group.current;
    if (!g) return;

    // Keep the spine fixed under the hand for the entire pull. Closed covers
    // and open spreads have different resting centers, so recenter only after
    // the paper lands; the live overlay waits for this settle below.
    const restingShift =
      motion.current === 0
        ? -pw / 2
        : motion.current === SPREADS.length - 1
          ? pw / 2
          : 0;
    const shiftTarget = motion.leaf === null ? restingShift : motion.turnShift;

    // One continuous pose channel: 0 = display stance, 1 = flat reading.
    // Everything derives from it, so no transition can ever pop.
    motion.pose = THREE.MathUtils.damp(motion.pose, motion.poseTarget, 5.2, dt);
    const posed = 1 - motion.pose;

    const airborne = motion.leaf !== null ? Math.sin(motion.progress * Math.PI) : 0;
    const idle = posed * 0.5 + airborne * 0.2;
    const breatheY = Math.sin(clockRef.current * 0.55) * 4 * idle;
    const breatheR = Math.sin(clockRef.current * 0.38) * 0.012 * idle;

    g.position.x = THREE.MathUtils.damp(g.position.x, shiftTarget, 8.5, dt);
    motion.shift = g.position.x;
    g.position.y = THREE.MathUtils.damp(g.position.y, breatheY, 2.4, dt);

    const rotation = bookPoseAngles({
      posed,
      pointerX: motion.pointerX,
      pointerY: motion.pointerY,
      airborne,
      breathe: breatheR,
    });
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, rotation.pitch, 6, dt);
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, rotation.yaw, 6, dt);
    const scale = 1 - (1 - POSE_DROP) * posed;
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, scale, 6, dt));
    motion.handoff = handoffOpacity({
      turning: motion.leaf !== null,
      rotationError: Math.max(Math.abs(g.rotation.x), Math.abs(g.rotation.y)),
      scaleError: Math.abs(1 - g.scale.x),
      shiftError: Math.abs(g.position.x - restingShift),
    });
    motion.onPose?.(motion.pose, motion.handoff);
  });

  const leftCount = motion.leaf !== null ? motion.leaf : motion.current;
  const rightCount = TOTAL_LEAVES - leftCount - (motion.leaf !== null ? 1 : 0);
  const staticLeft = motion.leaf !== null ? motion.leaf : motion.current;
  const staticRight = motion.leaf !== null ? motion.leaf + 1 : motion.current;
  const leftTop =
    SPREADS[staticLeft]?.kind === "cover" ? null : pageKey(staticLeft, "verso");
  const rightTop =
    SPREADS[staticRight]?.kind === "back" ? null : pageKey(staticRight, "recto");

  return (
    <>
      <Rig ph={ph} />
      <HiddenTicker />
      <ambientLight intensity={0.48} />
      <GlossLight pw={pw} ph={ph} />
      <directionalLight
        ref={light}
        position={[-pw * 0.7, ph * 0.9, ph * 1.35]}
        intensity={1.05}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-radius={4}
        shadow-bias={-0.00008}
        shadow-normalBias={0.2}
        shadow-camera-left={-pw * 2}
        shadow-camera-right={pw * 2}
        shadow-camera-top={ph * 1.4}
        shadow-camera-bottom={-ph * 1.4}
        shadow-camera-near={ph * 0.2}
        shadow-camera-far={ph * 4}
      />
      <group ref={group}>
        <Stack side="left" count={leftCount} topKey={leftTop} pw={pw} ph={ph} />
        <Stack side="right" count={rightCount} topKey={rightTop} pw={pw} ph={ph} />
        {/* One always-on receiver spanning the whole spread. Per-stack
            receivers used to blink out whenever a side's count hit zero
            mid-turn, taking the flying leaf's shadow with them. */}
        <mesh position={[0, 0, 0.16]} receiveShadow renderOrder={1}>
          <planeGeometry args={[pw * 2, ph]} />
          <shadowMaterial transparent opacity={0.15} depthWrite={false} />
        </mesh>
        {leftCount > 0 && rightCount > 0 ? <GutterShadow pw={pw} ph={ph} /> : null}
        <Leaf motion={motion} pw={pw} ph={ph} />
        {/* The desk: pure shadow on the white void. */}
        <mesh position={[0, 0, -TOTAL_LEAVES * LEAF_THICKNESS - 2]} receiveShadow>
          <planeGeometry args={[pw * 6, ph * 4]} />
          <shadowMaterial opacity={0.13} />
        </mesh>
      </group>
    </>
  );
}
