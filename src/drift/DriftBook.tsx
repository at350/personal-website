import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SPREADS } from "@/magazine/folio";
import { pageKey } from "@/book3d/pageTextures";
import { LEAF_ROWS, LEAF_SEGMENTS, type LeafVertex } from "@/book3d/bend";
import { PaperSheet, type DriftSheetOptions } from "@/book3d/paperPhysics";
import {
  setPaperMaterialActivity,
  usePageMaterial,
} from "@/book3d/usePageMaterial";
import { paperDriftActivity } from "@/book3d/paperMaterial";
import { SHEET_REST_ENERGY } from "@/book3d/settle";
import {
  DRIFT_SHEET_MAX_DEVIATION,
  beginDriftLanding,
  createDriftField,
  pointerPointAtDepth,
  stepDriftField,
  writeDriftLeafGuide,
  type DriftPointerInput,
  type DriftVec,
} from "./driftField";
import type { DriftPointerState } from "./types";

export const DRIFT_TOTAL_LEAVES = SPREADS.length - 1;
/** Whisper of a tether from the flexing sheet to its rigid carrier. The
    pinned spine column plus the structural web are what actually carry the
    sheet; keeping this rate low is what lets air and motion visibly bend the
    paper instead of ironing every vertex back onto the flat guide. */
export const DRIFT_SHEET_FOLLOW_RATE = 2.4;
export const DRIFT_SHEET_DAMPING = 0.955;
/** Floating paper holds a real bow: the page-turn regime's bend-flattening
    runs at a fraction of its strength out here. */
export const DRIFT_SHEET_CURVATURE_SCALE = 0.22;
/** Sheet-level radial current at the pointer (px/s² at its center). The rigid
    carriers get their own current inside driftField; this term is what makes
    the paper itself belly away from a close pass. */
const SHEET_CURRENT_ACCEL = 1600;
const SHEET_CURRENT_RADIUS_RATIO = 0.5;
/** Apparent-airflow gain: a leaf moving through still air feels wind opposite
    its own velocity, so a dragged or gusted sheet trails and bows instead of
    translating rigidly. Acceleration per px/s of carrier speed. */
const MOTION_FLEX = 3.2;
/** Flutter: the ripple that runs across a sheet held in moving air. A free
    leaf cannot bend under uniform wind — that only shifts it — so this is
    what actually curves the paper, and it works on every part of the sheet
    rather than hinging it at one edge. */
/* Sized against measurement, not taste: this solver answers a flutter
   acceleration with roughly amplitude/142 pixels of out-of-plane travel on a
   528px page, so this base buys ~12px of bow at rest and motion carries it
   toward the DRIFT_SHEET_MAX_DEVIATION clamp. That clamp is what the depth
   clearance reserves room for between every overlapping pair, so the two
   numbers move together: more bow costs gap, and gap is what stops sheets
   from crossing on screen. */
const FLUTTER_BASE = 1700;
const FLUTTER_MOTION = 3;
const FLUTTER_RATE = 2.3;
const TAU = Math.PI * 2;
const FIELD_SEED = 0xd21f7;

interface DriftBookProps {
  currentSpread: number;
  pointer: DriftPointerState;
  pw: number;
  ph: number;
  /** Horizontal book-group scene shift, for pointer-ray mapping. */
  shift: number;
  /** BookScene's shared paper fiber texture — one upload for every mode. */
  paperBump: THREE.Texture;
  landing: boolean;
  onLoosened?: () => void;
  onLanded?: () => void;
}

interface RegisteredLeaf {
  geometry: THREE.PlaneGeometry;
  front: THREE.Material;
  back: THREE.Material;
}

function DriftLeaf({
  index,
  pw,
  ph,
  paperBump,
  register,
}: {
  index: number;
  pw: number;
  ph: number;
  paperBump: THREE.Texture;
  register: (index: number, leaf: RegisteredLeaf | null) => void;
}) {
  // Leaf n is the paper between spread n and n+1, exactly as in the reading
  // book: recto of n on its front, mirrored verso of n+1 on its back.
  const frontMat = usePageMaterial(
    pageKey(index, "recto"),
    false,
    paperBump,
    THREE.FrontSide,
  );
  const backMat = usePageMaterial(
    pageKey(index + 1, "verso"),
    true,
    paperBump,
    THREE.BackSide,
  );

  const geometry = useMemo(
    () => new THREE.PlaneGeometry(pw, ph, LEAF_SEGMENTS, LEAF_ROWS),
    [ph, pw],
  );
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
  useEffect(
    () => () => {
      geometry.dispose();
      outlineGeometry.dispose();
    },
    [geometry, outlineGeometry],
  );
  useEffect(() => {
    register(index, { geometry, front: frontMat, back: backMat });
    return () => register(index, null);
  }, [backMat, frontMat, geometry, index, register]);

  return (
    <group>
      <mesh geometry={geometry} material={frontMat} castShadow receiveShadow />
      <mesh geometry={geometry} material={backMat} castShadow receiveShadow />
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

const LEAF_INDICES = Array.from({ length: DRIFT_TOTAL_LEAVES }, (_, n) => n);

export function DriftBook({
  currentSpread,
  pointer,
  pw,
  ph,
  shift,
  paperBump,
  landing,
  onLoosened,
  onLanded,
}: DriftBookProps) {
  const camera = useThree((state) => state.camera);

  const field = useMemo(
    () =>
      createDriftField({
        pw,
        ph,
        totalLeaves: DRIFT_TOTAL_LEAVES,
        currentSpread,
        seed: FIELD_SEED + currentSpread * 977,
      }),
    [currentSpread, ph, pw],
  );
  const sheets = useMemo(
    () =>
      LEAF_INDICES.map(
        () => new PaperSheet(pw, ph, LEAF_SEGMENTS, LEAF_ROWS),
      ),
    [ph, pw],
  );
  const guides = useMemo<LeafVertex[][]>(
    () =>
      LEAF_INDICES.map(() =>
        Array.from(
          { length: (LEAF_SEGMENTS + 1) * (LEAF_ROWS + 1) },
          () => ({ x: 0, y: 0, z: 0 }),
        ),
      ),
    [],
  );
  // The leaf-local rest grid the carriers transform each frame. Column 0 is
  // the spine edge, matching the sheet solver's pinned column.
  const restGrid = useMemo(() => {
    const xs = new Float64Array(LEAF_SEGMENTS + 1);
    const ys = new Float64Array(LEAF_ROWS + 1);
    for (let column = 0; column <= LEAF_SEGMENTS; column += 1) {
      xs[column] = -pw / 2 + (column / LEAF_SEGMENTS) * pw;
    }
    for (let row = 0; row <= LEAF_ROWS; row += 1) {
      ys[row] = (1 - (2 * row) / LEAF_ROWS) * (ph / 2);
    }
    return { xs, ys };
  }, [ph, pw]);

  const registered = useRef(new Map<number, RegisteredLeaf>());
  const register = useMemo(
    () => (index: number, leaf: RegisteredLeaf | null) => {
      if (leaf) registered.current.set(index, leaf);
      else registered.current.delete(index);
    },
    [],
  );

  const input = useRef<DriftPointerInput>({
    screenX: 0,
    screenY: 0,
    inside: false,
    pressed: false,
    shift: 0,
    cameraDistance: 1,
    viewportWidth: 1,
    viewportHeight: 1,
  });
  const sheetOptions = useRef<DriftSheetOptions>({
    dt: 1 / 60,
    windX: 0,
    windY: 0,
    windZ: 0,
    puffX: 0,
    puffY: 0,
    puffZ: 0,
    puffStrength: 0,
    puffRadius: pw * SHEET_CURRENT_RADIUS_RATIO,
    followRate: DRIFT_SHEET_FOLLOW_RATE,
    damping: DRIFT_SHEET_DAMPING,
    curvatureScale: DRIFT_SHEET_CURVATURE_SCALE,
    restScale: 1,
    flutterX: 0,
    flutterY: 0,
    flutterZ: 0,
    flutterPhase: 0,
    maxDeviation: DRIFT_SHEET_MAX_DEVIATION,
  });
  const currentScratch = useRef<DriftVec>({ x: 0, y: 0, z: 0 });
  const reportedLoosened = useRef(false);
  const reportedLanded = useRef(false);

  useEffect(() => {
    if (landing) beginDriftLanding(field);
  }, [field, landing]);

  // R3F render loops are intentionally imperative. React never reads the
  // field, sheets, or geometry buffers; mutating them here avoids 60 React
  // renders every second.
  useFrame((_, rawDt) => {
    const frame = input.current;
    frame.screenX = pointer.x;
    frame.screenY = pointer.y;
    frame.inside = pointer.inside;
    frame.pressed = pointer.pressed;
    frame.shift = shift;
    frame.cameraDistance = camera.position.z;
    frame.viewportWidth = window.innerWidth;
    frame.viewportHeight = window.innerHeight;

    stepDriftField(field, rawDt, frame);

    if (!reportedLoosened.current && field.phase !== "loosen") {
      reportedLoosened.current = true;
      onLoosened?.();
    }

    const options = sheetOptions.current;
    options.dt = rawDt;
    const active = field.phase === "loosen" || field.phase === "adrift";

    for (const leaf of field.leaves) {
      const bound = registered.current.get(leaf.index);
      if (!bound) continue;
      const guide = guides[leaf.index]!;
      writeDriftLeafGuide(leaf, restGrid.xs, restGrid.ys, guide);
      // The cloth's rest lengths track the perspective counter-scale, or the
      // constraints would fight the shrunken guide.
      options.restScale = leaf.scale;

      if (active) {
        // Apparent airflow: a moving carrier drags its paper through the air.
        options.windX = -leaf.vx * MOTION_FLEX;
        options.windY = -leaf.vy * MOTION_FLEX;
        options.windZ = -leaf.vz * MOTION_FLEX;
        // Flutter along the sheet's own normal, harder the faster it flies.
        const carrierSpeed = Math.hypot(leaf.vx, leaf.vy, leaf.vz);
        const amplitude =
          (FLUTTER_BASE + carrierSpeed * FLUTTER_MOTION) * leaf.release;
        options.flutterX = leaf.axisNX * amplitude;
        options.flutterY = leaf.axisNY * amplitude;
        options.flutterZ = leaf.axisNZ * amplitude;
        options.flutterPhase = field.time * FLUTTER_RATE + leaf.seedA * TAU;
      } else {
        options.windX = 0;
        options.windY = 0;
        options.windZ = 0;
        options.flutterX = 0;
        options.flutterY = 0;
        options.flutterZ = 0;
      }
      if (active && frame.inside && field.grabIndex !== leaf.index) {
        pointerPointAtDepth(frame, leaf.z, currentScratch.current);
        options.puffX = currentScratch.current.x;
        options.puffY = currentScratch.current.y;
        options.puffZ = currentScratch.current.z;
        options.puffStrength =
          SHEET_CURRENT_ACCEL * field.pageScale * leaf.release;
        // Track the live page size: a mid-drift resize rebuilds the field
        // (and this component's geometry) around a new pw, and the sheet
        // current must scale with it, not with the mount-time page.
        options.puffRadius = field.pw * SHEET_CURRENT_RADIUS_RATIO;
      } else {
        options.puffStrength = 0;
      }

      const sheet = sheets[leaf.index]!;
      const vertices = sheet.stepDrift(guide, options);
      const positions = bound.geometry.attributes
        .position as THREE.BufferAttribute;
      for (let index = 0; index < vertices.length; index += 1) {
        const point = vertices[index]!;
        positions.setXYZ(index, point.x, point.y, point.z);
      }
      positions.needsUpdate = true;
      bound.geometry.computeVertexNormals();

      const activity = paperDriftActivity(sheet.motionEnergy());
      setPaperMaterialActivity(bound.front, activity);
      setPaperMaterialActivity(bound.back, activity);
    }

    if (field.phase === "landed" && !reportedLanded.current) {
      let calm = true;
      for (const sheet of sheets) {
        if (sheet.motionEnergy() >= SHEET_REST_ENERGY) {
          calm = false;
          break;
        }
      }
      if (calm) {
        reportedLanded.current = true;
        onLanded?.();
      }
    }
  });

  return (
    <>
      {LEAF_INDICES.map((index) => (
        <DriftLeaf
          key={index}
          index={index}
          pw={pw}
          ph={ph}
          paperBump={paperBump}
          register={register}
        />
      ))}
    </>
  );
}
