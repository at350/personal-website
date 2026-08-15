/* The physical book: page stacks with real thickness, a bending leaf,
   one key light, honest shadows. World units are CSS pixels. */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  LEAF_ROWS,
  LEAF_SEGMENTS,
  leafSurface,
  type LeafVertex,
} from "./bend";
import { PaperSheet } from "./paperPhysics";
import { handoffOpacity } from "./handoff";
import {
  bookPoseAngles,
  bookRestingShift,
  bookRiffleShift,
} from "./bookPose";
import {
  bookPaperFootprint,
  isBoundaryCoverSheet,
  solveProjectedPaperShift,
} from "./bookProjection";
import {
  fadeSettlingActivity,
  paperGleamActivity,
} from "./paperMaterial";
import {
  setPaperMaterialActivity,
  usePageMaterial,
  usePaperBumpTexture,
} from "./usePageMaterial";
import {
  SETTLE_HOLD_MAX,
  SETTLE_PROGRESS_TOLERANCE,
  SETTLE_VELOCITY_TOLERANCE,
  settleComplete,
} from "./settle";
import { withBasePath } from "@/lib/basePath";
import {
  COVER_HOLOGRAM_PATTERN_PATH,
  coverHologramTiltEnvelope,
  isMovingCoverSheet,
  isTiltableCoverStack,
} from "@/magazine/coverHologram";
import {
  createCoverHologramMaterial,
  updateCoverHologramMaterial,
} from "./coverHologramMaterial";
import { pageKey } from "./pageTextures";
import { SPREADS } from "@/magazine/folio";
import {
  RIFFLE_VISIBLE_MAX,
  riffleDuration,
  riffleLeafCompletion,
  riffleLeafProgress,
  riffleStackCounts,
  type RiffleTransition,
} from "@/magazine/riffle";
import { IgniteBook } from "@/ignite/IgniteBook";
import type { IgnitePointerState } from "@/ignite/types";
import { DriftBook } from "@/drift/DriftBook";
import type { DriftPointerState } from "@/drift/types";

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
      material must reproduce the canonical page texture from here on, even if
      the gate fired via the hold cap with residual sheet energy. */
  swapReady: boolean;
  /** Horizontal book shift in px (centers the closed cover). */
  shift: number;
  /** Screen-space spine position recorded at turn start. */
  turnShift: number;
  /** Live post-physics cover geometry used to center its projected footprint. */
  coverVertices: readonly LeafVertex[] | null;
  /** Pointer position -1..1 for parallax. */
  pointerX: number;
  pointerY: number;
  pointerActive: boolean;
  /** Always-live pointer channel for the cover foil. Chassis parallax freezes
      during a turn, but the light field should keep following the hand. */
  foilPointerX: number;
  foilPointerY: number;
  /** Pointer pose recorded at turn start so dragging paper does not also yaw
      the entire book beneath the hand. */
  turnPointerX: number;
  turnPointerY: number;
  turnPointerActive: boolean;
  /** Damped visibility of the foil while the resting cover is pointer-tilted. */
  foilTilt: number;
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
  /** Shared 0..1 clock for the concurrent fast-riffle packet. */
  riffleProgress: number;
}

const TOTAL_LEAVES = SPREADS.length - 1;
const LEAF_THICKNESS = 2.3;
/** Automatic turns stay brisk enough for a rapid sequence of page taps;
    released drags keep a gentler landing that follows the reader's hand.
    Damping sits just under critical so paper flexes without clunking. */
const SPRING_K_AUTO = 150;
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

/** One authored UV mask, shared by the tilted stack and bending cover leaf. */
function useCoverHologramMaterial(motion: BookMotion) {
  const pattern = useLoader(
    THREE.TextureLoader,
    withBasePath(COVER_HOLOGRAM_PATTERN_PATH),
  );
  useEffect(() => {
    pattern.colorSpace = THREE.NoColorSpace;
    pattern.generateMipmaps = true;
    pattern.minFilter = THREE.LinearMipmapLinearFilter;
    pattern.magFilter = THREE.LinearFilter;
    pattern.anisotropy = 8;
    pattern.needsUpdate = true;
  }, [pattern]);
  const material = useMemo(
    () => createCoverHologramMaterial(pattern),
    [pattern],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    updateCoverHologramMaterial(material, {
      pointerX: motion.foilPointerX,
      pointerY: motion.foilPointerY,
      progress: isMovingCoverSheet(motion.leaf) ? motion.progress : 0,
      tilt: motion.foilTilt,
    });
  });
  return material;
}

/** Transparent at untouched rest; revealed imperatively by regular 3D tilt. */
function TiltedCoverHologram({
  motion,
  pw,
  ph,
}: {
  motion: BookMotion;
  pw: number;
  ph: number;
}) {
  const material = useCoverHologramMaterial(motion);
  return (
    <mesh position={[pw / 2, 0, 0.32]} material={material} renderOrder={3}>
      <planeGeometry args={[pw, ph]} />
    </mesh>
  );
}

function useFastCoverHologramMaterial() {
  const pattern = useLoader(
    THREE.TextureLoader,
    withBasePath(COVER_HOLOGRAM_PATTERN_PATH),
  );
  useEffect(() => {
    pattern.colorSpace = THREE.NoColorSpace;
    pattern.generateMipmaps = true;
    pattern.minFilter = THREE.LinearMipmapLinearFilter;
    pattern.magFilter = THREE.LinearFilter;
    pattern.anisotropy = 8;
    pattern.needsUpdate = true;
  }, [pattern]);
  const material = useMemo(
    () => createCoverHologramMaterial(pattern),
    [pattern],
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

function Stack({
  side,
  count,
  topKey,
  pw,
  ph,
  paperBump,
}: {
  side: "left" | "right";
  count: number;
  topKey: string | null;
  pw: number;
  ph: number;
  paperBump: THREE.Texture;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const rim = useRef<THREE.LineSegments>(null);
  const topMat = usePageMaterial(topKey, false, paperBump);
  const edges = useMemo(edgeTexture, []);
  const materials = useMemo(() => {
    const paper = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const edge = new THREE.MeshBasicMaterial({ map: edges, toneMapped: false });
    // box faces: +x, -x, +y, -y, +z (camera), -z
    return [edge, edge, edge, edge, topMat, paper];
  }, [edges, topMat]);
  const geo = useMemo(() => new THREE.BoxGeometry(pw, ph, 1), [pw, ph]);
  const rimGeo = useMemo(() => new THREE.EdgesGeometry(geo, 24), [geo]);

  const shownCount = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const m = mesh.current;
    if (!m) return;
    const thickness = Math.max(count * LEAF_THICKNESS, 0.001);
    const targetScale = thickness;
    if (shownCount.current === 0 && count > 0) {
      // A boundary flip reveals a stack that was hidden at near-zero
      // thickness. Landing on that degenerate box while it grows is the gray
      // flash on the freshly revealed page — the page must arrive at full
      // thickness, already in its resting state. The damp below remains for
      // thickness changes while the stack is on screen.
      m.scale.z = targetScale;
    } else {
      m.scale.z = THREE.MathUtils.damp(m.scale.z, targetScale, 12, dt);
    }
    shownCount.current = count;
    m.position.z = -m.scale.z / 2;
    m.position.x = side === "left" ? -pw / 2 : pw / 2;
    // The moving-paper accent must never leak onto a resting stack: whatever
    // this material's shared program rendered last frame, a stack face is
    // canonical pixels, always.
    setPaperMaterialActivity(topMat, 0);
    const outline = rim.current;
    if (outline) {
      outline.position.copy(m.position);
      outline.scale.copy(m.scale);
    }
  });

  return (
    <>
      {/* Visibility belongs to the React commit that changes the stack count.
          Waiting for useFrame leaves one paint where a settled boundary leaf
          is gone but its newly exposed stack is still hidden. */}
      <mesh
        ref={mesh}
        visible={count > 0}
        castShadow
        geometry={geo}
        material={materials}
      />
      <lineSegments
        ref={rim}
        visible={count > 0}
        geometry={rimGeo}
        renderOrder={3}
      >
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

function Leaf({
  sheet,
  motion,
  pw,
  ph,
  paperBump,
}: {
  /** Committed engine sheet. Mounting must follow React state, not the
      mutable motion mirror: a render that catches the mirror mid-update can
      unmount the leaf while the landing stack is still computed hidden, and
      at the cover/back boundary nothing sits beneath — the page flashes the
      gray void for a frame. Props are commit-consistent; refs are not. */
  sheet: number | null;
  motion: BookMotion;
  pw: number;
  ph: number;
  paperBump: THREE.Texture;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const backMesh = useRef<THREE.Mesh>(null);
  const frontKey = sheet !== null ? pageKey(sheet, "recto") : null;
  const backKey = sheet !== null ? pageKey(sheet + 1, "verso") : null;
  const frontMat = usePageMaterial(frontKey, false, paperBump);
  const backMat = usePageMaterial(backKey, true, paperBump);
  const hologramMat = useCoverHologramMaterial(motion);
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
  const paperSheet = useMemo(
    () => new PaperSheet(pw, ph, LEAF_SEGMENTS, LEAF_ROWS),
    [ph, pw],
  );
  const activeLeaf = useRef<number | null>(null);

  useFrame((_, rawDt) => {
    if (sheet === null || motion.leaf === null) {
      activeLeaf.current = null;
      motion.coverVertices = null;
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
      paperSheet.reset(target);
      activeLeaf.current = motion.leaf;
    }
    const vertices = paperSheet.step(target, {
      dt: rawDt,
      dragging: motion.dragging,
      grabY: motion.grabY,
      handleOffsetY: motion.grabOffsetY,
      velocity: motion.velocity,
    });
    const boundaryCover = isBoundaryCoverSheet(motion.leaf, SPREADS.length);
    motion.coverVertices = boundaryCover ? vertices : null;
    motion.sheetEnergy = paperSheet.motionEnergy();
    // Once the gate fires the page is down, whatever residual energy the hold
    // cap accepted — remove the physical accent and show the canonical texture.
    const motionActivity = paperGleamActivity(motion.progress, motion.sheetEnergy);
    const activity = motion.swapReady
      ? 0
      : fadeSettlingActivity(
          motionActivity,
          motion.settleHold,
          SETTLE_HOLD_MAX,
        );
    setPaperMaterialActivity(frontMat, activity);
    setPaperMaterialActivity(backMat, activity);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < vertices.length; index += 1) {
      const vertex = vertices[index]!;
      pos.setXYZ(index, vertex.x, vertex.y, vertex.z + 0.4);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  }, -1);

  if (sheet === null) return null;
  return (
    <group>
      <mesh ref={mesh} geometry={geometry} material={frontMat} castShadow receiveShadow />
      <mesh ref={backMesh} geometry={geometry} material={backMat} castShadow receiveShadow />
      {isMovingCoverSheet(sheet) ? (
        <mesh
          geometry={geometry}
          material={hologramMat}
          renderOrder={3}
        />
      ) : null}
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

const FAST_LEAF_SEGMENTS = 16;
const FAST_LEAF_ROWS = 8;
const FAST_LEAF_DEPTH_GAP = 0.2;
const FAST_RIFFLE_SLOTS = Array.from(
  { length: RIFFLE_VISIBLE_MAX },
  (_, ordinal) => ordinal,
);

interface FastLeafProps {
  sheet: number | null;
  ordinal: number;
  count: number;
  direction: 1 | -1;
  clock: { current: number };
  motion: BookMotion;
  paperBump: THREE.Texture;
  pw: number;
  ph: number;
}

/** A lightweight page used only in the short, concurrent fast-forward burst. */
function FastLeaf({
  sheet,
  ordinal,
  count,
  direction,
  clock,
  motion,
  paperBump,
  pw,
  ph,
}: FastLeafProps) {
  const frontKey = sheet === null ? null : pageKey(sheet, "recto");
  const backKey = sheet === null ? null : pageKey(sheet + 1, "verso");
  const frontMat = usePageMaterial(frontKey, false, paperBump);
  const backMat = usePageMaterial(backKey, true, paperBump);
  const hologramMat = useFastCoverHologramMaterial();

  useEffect(() => {
    frontMat.side = THREE.FrontSide;
    backMat.side = THREE.BackSide;
  }, [backMat, frontMat]);

  const geometry = useMemo(
    () => new THREE.PlaneGeometry(pw, ph, FAST_LEAF_SEGMENTS, FAST_LEAF_ROWS),
    [ph, pw],
  );
  const outlineGeometry = useMemo(() => {
    const outline = new THREE.BufferGeometry();
    outline.setAttribute("position", geometry.getAttribute("position"));
    const indices: number[] = [];
    const columns = FAST_LEAF_SEGMENTS + 1;
    for (let column = 0; column <= FAST_LEAF_SEGMENTS; column += 1) {
      indices.push(column);
    }
    for (let row = 1; row <= FAST_LEAF_ROWS; row += 1) {
      indices.push(row * columns + FAST_LEAF_SEGMENTS);
    }
    for (let column = FAST_LEAF_SEGMENTS - 1; column >= 0; column -= 1) {
      indices.push(FAST_LEAF_ROWS * columns + column);
    }
    for (let row = FAST_LEAF_ROWS - 1; row > 0; row -= 1) {
      indices.push(row * columns);
    }
    outline.setIndex(indices);
    return outline;
  }, [geometry]);

  useFrame(() => {
    if (sheet === null) return;
    const completion = riffleLeafCompletion(clock.current, ordinal);
    const progress = riffleLeafProgress(clock.current, ordinal, direction);
    if (isMovingCoverSheet(sheet)) {
      updateCoverHologramMaterial(hologramMat, {
        pointerX: motion.foilPointerX,
        pointerY: motion.foilPointerY,
        progress,
        tilt: motion.foilTilt,
      });
    }
    const velocity = Math.sin(completion * Math.PI) * 2.6;
    const grabY = count <= 1 ? 0 : 0.14 - (ordinal / (count - 1)) * 0.28;
    const vertices = leafSurface(
      progress,
      pw,
      ph,
      velocity,
      grabY,
      direction,
      FAST_LEAF_SEGMENTS,
      FAST_LEAF_ROWS,
    );

    // The first sheet is topmost at launch and the last is topmost at landing.
    // Interpolating that packet order keeps concurrent pages from z-fighting.
    const startDepth = count - ordinal;
    const endDepth = ordinal + 1;
    const depth = THREE.MathUtils.lerp(startDepth, endDepth, completion);
    const zOffset = 0.4 + depth * FAST_LEAF_DEPTH_GAP;
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < vertices.length; index += 1) {
      const vertex = vertices[index]!;
      positions.setXYZ(index, vertex.x, vertex.y, vertex.z + zOffset);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const activity = paperGleamActivity(progress, 0);
    setPaperMaterialActivity(frontMat, activity);
    setPaperMaterialActivity(backMat, activity);
  });

  return (
    <group visible={sheet !== null}>
      <mesh geometry={geometry} material={frontMat} castShadow receiveShadow />
      <mesh geometry={geometry} material={backMat} castShadow receiveShadow />
      {isMovingCoverSheet(sheet) ? (
        <mesh geometry={geometry} material={hologramMat} renderOrder={3} />
      ) : null}
      <lineLoop geometry={outlineGeometry} renderOrder={4 + ordinal}>
        <lineBasicMaterial
          color="#c9c8c3"
          transparent
          opacity={0.68}
          depthWrite={false}
          toneMapped={false}
        />
      </lineLoop>
    </group>
  );
}

interface FastRiffleProps {
  transition: RiffleTransition | null;
  motion: BookMotion;
  paperBump: THREE.Texture;
  pw: number;
  ph: number;
  onComplete: () => void;
}

/**
 * A fixed five-slot pool avoids allocating page materials and mirrored texture
 * clones on every jump. One clock launches the visible packet in quick overlap.
 */
function FastRiffle({
  transition,
  motion,
  paperBump,
  pw,
  ph,
  onComplete,
}: FastRiffleProps) {
  const clock = useRef(0);
  const completed = useRef(false);

  useEffect(() => {
    clock.current = 0;
    completed.current = false;
    motion.riffleProgress = 0;
  }, [motion, transition]);

  useFrame((_, rawDt) => {
    if (transition === null || completed.current) return;
    const duration = riffleDuration(transition.visibleSheets.length);
    clock.current = Math.min(duration, clock.current + Math.min(rawDt, 0.1));
    motion.riffleProgress = duration === 0 ? 1 : clock.current / duration;
    if (clock.current >= duration) {
      completed.current = true;
      onComplete();
    }
  });

  return (
    <>
      {FAST_RIFFLE_SLOTS.map((ordinal) => (
        <FastLeaf
          key={ordinal}
          sheet={transition?.visibleSheets[ordinal] ?? null}
          ordinal={ordinal}
          count={transition?.visibleSheets.length ?? 0}
          direction={transition?.direction ?? 1}
          clock={clock}
          motion={motion}
          paperBump={paperBump}
          pw={pw}
          ph={ph}
        />
      ))}
    </>
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

interface BookSceneProps {
  motion: BookMotion;
  /** Committed engine state. The scene graph (leaf mount, stack counts and
      visibility) must derive from these props, never from the mutable motion
      mirror, so every React commit is internally consistent. */
  sheet: number | null;
  current: number;
  riffle: RiffleTransition | null;
  pw: number;
  ph: number;
  onRiffleComplete: () => void;
  ignite?: {
    active: boolean;
    revision: number;
    pointer: IgnitePointerState;
    reducedMotion: boolean;
    onIgnition?: () => void;
    onProgress?: (progress: number) => void;
    onComplete?: () => void;
  };
  drift?: {
    active: boolean;
    revision: number;
    pointer: DriftPointerState;
    /** Resting book shift so the pointer ray lands on the right leaf. */
    shift: number;
    landing: boolean;
    onLoosened?: () => void;
    onLanded?: () => void;
  };
}

export function BookScene({
  motion,
  sheet,
  current,
  riffle,
  pw,
  ph,
  onRiffleComplete,
  ignite,
  drift,
}: BookSceneProps) {
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const clockRef = useRef(0);
  const paperBump = usePaperBumpTexture();
  const camera = useThree((state) => state.camera);

  // Explicit frame order keeps every channel causal in the same rendered
  // frame: spring (-2) -> deformed leaf bounds (-1) -> book transform (0).
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
  }, -2);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const g = group.current;
    if (!g) return;

    const restingShift = bookRestingShift(
      motion.current,
      SPREADS.length,
      pw,
    );
    const turning = motion.leaf !== null || riffle !== null;
    const riffleShift = riffle
      ? bookRiffleShift(
          riffle.from,
          riffle.to,
          motion.riffleProgress,
          SPREADS.length,
          pw,
        )
      : null;
    const shiftTarget =
      riffleShift ??
      (turning ? motion.turnShift : restingShift);

    // One continuous pose channel: 0 = display stance, 1 = flat reading.
    // Everything derives from it, so no transition can ever pop.
    motion.pose = THREE.MathUtils.damp(motion.pose, motion.poseTarget, 5.2, dt);
    const posed = 1 - motion.pose;
    const foilTiltTarget = coverHologramTiltEnvelope(
      motion.pointerActive,
      motion.pose,
    );
    motion.foilTilt = THREE.MathUtils.damp(
      motion.foilTilt,
      foilTiltTarget,
      14,
      dt,
    );
    if (foilTiltTarget === 0 && motion.foilTilt < 0.002) motion.foilTilt = 0;
    if (foilTiltTarget === 1 && motion.foilTilt > 0.998) motion.foilTilt = 1;

    const airborne =
      riffle !== null
        ? Math.sin(motion.riffleProgress * Math.PI)
        : motion.leaf !== null
          ? Math.sin(motion.progress * Math.PI)
          : 0;
    const idle = posed * 0.5 + airborne * 0.2;
    const breatheY = Math.sin(clockRef.current * 0.55) * 4 * idle;
    const breatheR = Math.sin(clockRef.current * 0.38) * 0.012 * idle;

    g.position.y = THREE.MathUtils.damp(g.position.y, breatheY, 2.4, dt);

    const rotation = bookPoseAngles({
      posed,
      pointerX: turning ? motion.turnPointerX : motion.pointerX,
      pointerY: turning ? motion.turnPointerY : motion.pointerY,
      pointerActive: turning
        ? motion.turnPointerActive
        : motion.pointerActive,
      airborne,
      breathe: breatheR,
    });
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, rotation.pitch, 6, dt);
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, rotation.yaw, 6, dt);
    const scale = 1 - (1 - POSE_DROP) * posed;
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, scale, 6, dt));

    // A cover changes the visible footprint from one page to two (or back
    // again). Center the actual projected silhouette so curl and perspective
    // cannot postpone a chunk of the chassis motion until after visual landing.
    const paperFootprint = bookPaperFootprint({
      currentSpread: motion.current,
      activeCoverSheet: motion.leaf,
      activeVertices: motion.coverVertices,
      totalSpreads: SPREADS.length,
      pageWidth: pw,
      pageHeight: ph,
    });
    const flatReading = motion.pose > 1 - 1e-4;
    const projectedShift =
      riffle === null
        ? solveProjectedPaperShift(
            g,
            camera,
            paperFootprint,
            g.position.x,
          )
        : shiftTarget;
    const projectedRestingShift =
      riffle === null && motion.leaf === null ? projectedShift : restingShift;
    // At rest, retain the exact historical local-space endpoints once the pose
    // is flat. This keeps the DOM overlay and pointer zones on their canonical
    // centers while still solving perspective continuously during approach.
    const resolvedShift =
      !turning && flatReading
        ? restingShift
        : projectedShift;
    g.position.x = resolvedShift;
    motion.shift = g.position.x;
    motion.handoff = handoffOpacity({
      turning,
      rotationError: Math.max(Math.abs(g.rotation.x), Math.abs(g.rotation.y)),
      scaleError: Math.abs(1 - g.scale.x),
      shiftError: Math.abs(g.position.x - projectedRestingShift),
    });
    motion.onPose?.(motion.pose, motion.handoff);
  });

  const riffleStacks = riffle ? riffleStackCounts(TOTAL_LEAVES, riffle) : null;
  const leftCount = riffleStacks
    ? riffleStacks.left
    : sheet !== null
      ? sheet
      : current;
  const rightCount = riffleStacks
    ? riffleStacks.right
    : TOTAL_LEAVES - leftCount - (sheet !== null ? 1 : 0);
  const staticLeft = riffle
    ? Math.min(riffle.from, riffle.to)
    : sheet !== null
      ? sheet
      : current;
  const staticRight = riffle
    ? Math.max(riffle.from, riffle.to)
    : sheet !== null
      ? sheet + 1
      : current;
  const leftTop =
    leftCount === 0 || SPREADS[staticLeft]?.kind === "cover"
      ? null
      : pageKey(staticLeft, "verso");
  const rightTop =
    rightCount === 0 || SPREADS[staticRight]?.kind === "back"
      ? null
      : pageKey(staticRight, "recto");

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
        {ignite?.active ? (
          <IgniteBook
            key={`${current}:${ignite.revision}`}
            currentSpread={current}
            pointer={ignite.pointer}
            pw={pw}
            ph={ph}
            reducedMotion={ignite.reducedMotion}
            onIgnition={ignite.onIgnition}
            onProgress={ignite.onProgress}
            onComplete={ignite.onComplete}
          />
        ) : drift?.active ? (
          <DriftBook
            key={`${current}:${drift.revision}`}
            currentSpread={current}
            pointer={drift.pointer}
            pw={pw}
            ph={ph}
            shift={drift.shift}
            paperBump={paperBump}
            landing={drift.landing}
            onLoosened={drift.onLoosened}
            onLanded={drift.onLanded}
          />
        ) : (
          <>
            <Stack
              side="left"
              count={leftCount}
              topKey={leftTop}
              pw={pw}
              ph={ph}
              paperBump={paperBump}
            />
            <Stack
              side="right"
              count={rightCount}
              topKey={rightTop}
              pw={pw}
              ph={ph}
              paperBump={paperBump}
            />
            {/* One always-on receiver spanning the whole spread. Per-stack
                receivers used to blink out whenever a side's count hit zero
                mid-turn, taking the flying leaf's shadow with them. */}
            <mesh position={[0, 0, 0.16]} receiveShadow renderOrder={1}>
              <planeGeometry args={[pw * 2, ph]} />
              <shadowMaterial transparent opacity={0.15} depthWrite={false} />
            </mesh>
            {isTiltableCoverStack(current, sheet, riffle !== null) ? (
              <TiltedCoverHologram motion={motion} pw={pw} ph={ph} />
            ) : null}
            <Leaf sheet={sheet} motion={motion} pw={pw} ph={ph} paperBump={paperBump} />
            <FastRiffle
              transition={riffle}
              motion={motion}
              paperBump={paperBump}
              pw={pw}
              ph={ph}
              onComplete={onRiffleComplete}
            />
          </>
        )}
        {/* The desk: pure shadow on the white void. */}
        <mesh position={[0, 0, -TOTAL_LEAVES * LEAF_THICKNESS - 2]} receiveShadow>
          <planeGeometry args={[pw * 6, ph * 4]} />
          <shadowMaterial opacity={0.13} />
        </mesh>
      </group>
    </>
  );
}
