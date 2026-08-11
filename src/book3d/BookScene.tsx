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
  /** Pointer position -1..1 for the resting tilt. */
  pointerX: number;
  pointerY: number;
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

function usePageMaterial(key: string | null, mirror = false) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.94,
        metalness: 0,
      }),
    [],
  );
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
        mat.needsUpdate = true;
        applied.current = key;
      } else if (!texture && applied.current !== null) {
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
    const paper = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    const edge = new THREE.MeshStandardMaterial({ map: edges, roughness: 0.95 });
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
  const { camera, size } = useThree();
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

export function BookScene({ motion, pw, ph }: { motion: BookMotion; pw: number; ph: number }) {
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.DirectionalLight>(null);

  // Spring integration + settle detection lives with the frames.
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    if (!motion.dragging && motion.target !== null && motion.leaf !== null) {
      const k = motion.released ? SPRING_K_RELEASE : SPRING_K_AUTO;
      const c = 2 * Math.sqrt(k) * 1.02; // a touch overdamped: paper, not rubber
      const a = k * (motion.target - motion.progress) - c * motion.velocity;
      motion.velocity += a * dt;
      motion.progress += motion.velocity * dt;
      if (
        Math.abs(motion.progress - motion.target) < 0.002 &&
        Math.abs(motion.velocity) < 0.02
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
    g.position.x = THREE.MathUtils.damp(g.position.x, motion.shift, 8, dt);
    const airborne = motion.leaf !== null ? Math.sin(motion.progress * Math.PI) : 0;
    const tiltX = -0.045 * airborne + motion.pointerY * -0.012;
    const tiltY = motion.pointerX * 0.014;
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, tiltX, 7, dt);
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, tiltY, 7, dt);
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
      <ambientLight intensity={0.8} />
      <directionalLight
        ref={light}
        position={[-pw * 0.7, ph * 0.9, ph * 1.35]}
        intensity={0.38}
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
