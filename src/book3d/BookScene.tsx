/* The physical book: page stacks with real thickness, a bending leaf,
   one key light, honest shadows. World units are CSS pixels. */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { LEAF_SEGMENTS, leafColumns } from "./bend";
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
  dragging: boolean;
  /** True when the current settle came from a released drag (snappier spring). */
  released: boolean;
  /** Horizontal book shift in px (centers the closed cover). */
  shift: number;
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
  /** Scene → stage: report pose so the overlay can fade at the right moment. */
  onPose: ((pose: number) => void) | null;
  onSettled: (() => void) | null;
}

const TOTAL_LEAVES = SPREADS.length - 1;
const LEAF_THICKNESS = 1.15;
/** Softer spring for choreographed turns; snappier when a drag is released. */
const SPRING_K_AUTO = 52;
const SPRING_K_RELEASE = 110;

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

/* Paper must read as paper at every angle: a pure lambert surface goes gray
   the moment it tilts from the key light, so the print carries part of its
   own brightness (emissive through the same texture). Turns still model
   light — the directional term and cast shadows ride on top. */
const EMISSIVE_LIFT = 0.62;

function usePageMaterial(key: string | null, mirror = false) {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0,
    });
    m.emissive = new THREE.Color(1, 1, 1).multiplyScalar(EMISSIVE_LIFT);
    return m;
  }, []);
  const applied = useRef<string | null>(null);
  useEffect(() => {
    const apply = () => {
      const texture = key ? getPageTexture(key) : null;
      if (texture && applied.current !== key) {
        const t = mirror ? texture.clone() : texture;
        if (mirror) {
          t.wrapS = THREE.RepeatWrapping;
          t.repeat.x = -1;
          t.offset.x = 1;
        }
        mat.map = t;
        mat.emissiveMap = t;
        mat.needsUpdate = true;
        applied.current = key;
      } else if (!texture && applied.current !== null) {
        mat.map = null;
        mat.emissiveMap = null;
        mat.needsUpdate = true;
        applied.current = null;
      }
    };
    apply();
    return onTexturesChanged(apply);
  }, [key, mat, mirror]);
  return mat;
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
  const topMat = usePageMaterial(topKey);
  const edges = useMemo(edgeTexture, []);
  const materials = useMemo(() => {
    const lift = new THREE.Color(1, 1, 1).multiplyScalar(EMISSIVE_LIFT);
    const paper = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    paper.emissive = lift;
    const edge = new THREE.MeshStandardMaterial({ map: edges, roughness: 0.95 });
    edge.emissive = lift;
    edge.emissiveMap = edges;
    // box faces: +x, -x, +y, -y, +z (camera), -z
    return [edge, edge, edge, edge, topMat, paper];
  }, [edges, topMat]);
  const geo = useMemo(() => new THREE.BoxGeometry(pw, ph, 1), [pw, ph]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const thickness = Math.max(count * LEAF_THICKNESS, 0.001);
    const targetScale = thickness;
    m.scale.z = THREE.MathUtils.damp(m.scale.z, targetScale, 12, dt);
    m.position.z = -m.scale.z / 2;
    m.position.x = side === "left" ? -pw / 2 : pw / 2;
    m.visible = count > 0;
  });

  return (
    <mesh ref={mesh} castShadow receiveShadow geometry={geo} material={materials} />
  );
}

function Leaf({ motion, pw, ph }: { motion: BookMotion; pw: number; ph: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const backMesh = useRef<THREE.Mesh>(null);
  const frontKey = motion.leaf !== null ? pageKey(motion.leaf, "recto") : null;
  const backKey = motion.leaf !== null ? pageKey(motion.leaf + 1, "verso") : null;
  const frontMat = usePageMaterial(frontKey);
  const backMat = usePageMaterial(backKey, true);
  useEffect(() => {
    frontMat.side = THREE.FrontSide;
    backMat.side = THREE.BackSide;
  }, [backMat, frontMat]);

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(pw, ph, LEAF_SEGMENTS, 1);
    return g;
  }, [pw, ph]);

  useFrame(() => {
    const g = geometry;
    const cols = leafColumns(motion.progress, pw, motion.velocity);
    const pos = g.attributes.position as THREE.BufferAttribute;
    // PlaneGeometry vertex order: rows top→bottom, columns left→right.
    const columns = LEAF_SEGMENTS + 1;
    for (let row = 0; row < 2; row += 1) {
      const y = row === 0 ? ph / 2 : -ph / 2;
      for (let c = 0; c < columns; c += 1) {
        const i = row * columns + c;
        pos.setXYZ(i, cols[c]!.x, y, cols[c]!.z + 0.4);
      }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  });

  if (motion.leaf === null) return null;
  return (
    <group>
      <mesh ref={mesh} geometry={geometry} material={frontMat} castShadow receiveShadow />
      <mesh ref={backMesh} geometry={geometry} material={backMat} castShadow receiveShadow />
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

/* The display stance: spine, top edge and cover all readable at once. */
const POSE_YAW = -0.30;
const POSE_PITCH = 0.16;
const POSE_DROP = 0.994; // posed book sits a breath smaller — object, not page

export function BookScene({ motion, pw, ph }: { motion: BookMotion; pw: number; ph: number }) {
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const clockRef = useRef(0);

  // Spring integration + settle detection lives with the frames.
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    clockRef.current += dt;
    if (!motion.dragging && motion.target !== null && motion.leaf !== null) {
      const k = motion.released ? SPRING_K_RELEASE : SPRING_K_AUTO;
      const c = 2 * Math.sqrt(k) * 1.02; // a touch overdamped: paper, not rubber
      const a = k * (motion.target - motion.progress) - c * motion.velocity;
      motion.velocity += a * dt;
      motion.progress += motion.velocity * dt;
      if (
        Math.abs(motion.progress - motion.target) < 0.0012 &&
        Math.abs(motion.velocity) < 0.012
      ) {
        motion.progress = motion.target;
        motion.velocity = 0;
        const done = motion.onSettled;
        motion.onSettled = null;
        motion.target = null;
        done?.();
      }
    }

    const g = group.current;
    if (!g) return;

    // One continuous pose channel: 0 = display stance, 1 = flat reading.
    // Everything derives from it, so no transition can ever pop.
    motion.pose = THREE.MathUtils.damp(motion.pose, motion.poseTarget, 5.2, dt);
    motion.onPose?.(motion.pose);
    const posed = 1 - motion.pose;

    const airborne = motion.leaf !== null ? Math.sin(motion.progress * Math.PI) : 0;
    const idle = posed * 0.5 + airborne * 0.2;
    const breatheY = Math.sin(clockRef.current * 0.55) * 4 * idle;
    const breatheR = Math.sin(clockRef.current * 0.38) * 0.012 * idle;

    g.position.x = THREE.MathUtils.damp(g.position.x, motion.shift, 6.5, dt);
    g.position.y = THREE.MathUtils.damp(g.position.y, breatheY, 2.4, dt);

    const yaw = POSE_YAW * posed + motion.pointerX * (0.02 + 0.05 * posed) + breatheR;
    const pitch =
      POSE_PITCH * posed - 0.055 * airborne + motion.pointerY * -(0.012 + 0.03 * posed);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, pitch, 6, dt);
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, yaw, 6, dt);
    const scale = 1 - (1 - POSE_DROP) * posed;
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, scale, 6, dt));
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
      <ambientLight intensity={0.28} />
      <directionalLight
        ref={light}
        position={[-pw * 0.7, ph * 0.9, ph * 1.35]}
        intensity={0.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-radius={9}
        shadow-bias={-0.0003}
        shadow-camera-left={-pw * 1.7}
        shadow-camera-right={pw * 1.7}
        shadow-camera-top={ph * 1.1}
        shadow-camera-bottom={-ph * 1.1}
        shadow-camera-near={ph * 0.2}
        shadow-camera-far={ph * 4}
      />
      <group ref={group}>
        <Stack side="left" count={leftCount} topKey={leftTop} pw={pw} ph={ph} />
        <Stack side="right" count={rightCount} topKey={rightTop} pw={pw} ph={ph} />
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
