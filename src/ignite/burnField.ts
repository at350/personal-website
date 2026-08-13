export const BURN_FIXED_STEP = 1 / 30;
export const MAX_BURN_CATCH_UP_STEPS = 4;

const IGNITION_HEAT = 0.19;
const MAX_HEAT = 1.35;
export const BURN_CATCH_DEPTH = 0.075;

// These rates are expressed in real seconds. A thin exposed sheet should
// ignite in a fraction of a second and carry a connected flame front across a
// magazine spread in roughly a dozen seconds; stack depth only controls how
// long the leaves underneath continue to provide fuel.
const HEAT_CONDUCTION_RATE = 9;
const NEIGHBOUR_PREHEAT_RATE = 5;
const PAPER_BURN_RATE = 0.26;
const SURFACE_PYROLYSIS_RATE = 0.32;

export interface BurnFieldOptions {
  width: number;
  height: number;
  leftLayers: number;
  rightLayers: number;
  seed?: number;
}

export interface BurnField {
  width: number;
  height: number;
  maxLayers: number;
  capacity: Float32Array;
  burn: Float32Array;
  heat: Float32Array;
  nextHeat: Float32Array;
  grain: Float32Array;
  residue: Float32Array;
  surface: Float32Array;
  surfaceSeed: Uint8Array;
  nextSurfaceSeed: Uint8Array;
  totalFuel: number;
  burnedFuel: number;
  maximumHeat: number;
  ignited: boolean;
  caught: boolean;
  complete: boolean;
}

export interface BurnAdvance {
  accumulator: number;
  steps: number;
}

export interface HotCell {
  u: number;
  v: number;
  heat: number;
  burn: number;
  capacity: number;
}

export interface ResidueCell {
  u: number;
  v: number;
  residue: number;
  capacity: number;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    let value = (state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const smoothCurve = (value: number) => value * value * (3 - 2 * value);

/**
 * Paper is irregular at a fibre scale, but it is not white noise. A sparse
 * value-noise lattice gives neighbouring cells similar resistance so the
 * flame edge meanders in broad folds instead of outlining every grid cell.
 */
function fillCoherentGrain(
  target: Float32Array,
  width: number,
  height: number,
  random: () => number,
) {
  const spacing = 14;
  const latticeWidth = Math.ceil((width - 1) / spacing) + 2;
  const latticeHeight = Math.ceil((height - 1) / spacing) + 2;
  const lattice = new Float32Array(latticeWidth * latticeHeight);
  for (let index = 0; index < lattice.length; index += 1) {
    lattice[index] = random();
  }

  for (let y = 0; y < height; y += 1) {
    const latticeY = y / spacing;
    const y0 = Math.floor(latticeY);
    const yMix = smoothCurve(latticeY - y0);
    for (let x = 0; x < width; x += 1) {
      const latticeX = x / spacing;
      const x0 = Math.floor(latticeX);
      const xMix = smoothCurve(latticeX - x0);
      const row0 = y0 * latticeWidth;
      const row1 = (y0 + 1) * latticeWidth;
      const top = (lattice[row0 + x0] ?? 0.5) * (1 - xMix) +
        (lattice[row0 + x0 + 1] ?? 0.5) * xMix;
      const bottom = (lattice[row1 + x0] ?? 0.5) * (1 - xMix) +
        (lattice[row1 + x0 + 1] ?? 0.5) * xMix;
      const broadNoise = top * (1 - yMix) + bottom * yMix;
      // A very faint directional fibre keeps the edge organic without making
      // the simulation grid legible.
      const fibre = Math.sin(x * 0.19 + y * 0.035) * 0.035;
      target[y * width + x] = clamp(0.17 + broadNoise * 0.66 + fibre, 0, 1);
    }
  }
}

/**
 * A compact, deterministic combustion field. `burn` is measured in physical
 * paper layers, which lets the renderer reveal real pages beneath the top
 * sheet instead of dissolving one flat screenshot.
 */
export function createBurnField({
  width,
  height,
  leftLayers,
  rightLayers,
  seed = 0x1a71a1,
}: BurnFieldOptions): BurnField {
  if (width < 2 || height < 2) {
    throw new Error("A burn field needs at least a 2 by 2 grid");
  }

  const length = width * height;
  const capacity = new Float32Array(length);
  const grain = new Float32Array(length);
  const random = mulberry32(seed);
  let totalFuel = 0;

  fillCoherentGrain(grain, width, height, random);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const layers = x < width / 2 ? leftLayers : rightLayers;
      capacity[index] = layers;
      totalFuel += layers;
    }
  }

  return {
    width,
    height,
    maxLayers: Math.max(1, leftLayers, rightLayers),
    capacity,
    burn: new Float32Array(length),
    heat: new Float32Array(length),
    nextHeat: new Float32Array(length),
    grain,
    residue: new Float32Array(length),
    surface: new Float32Array(length),
    surfaceSeed: new Uint8Array(length),
    nextSurfaceSeed: new Uint8Array(length),
    totalFuel,
    burnedFuel: 0,
    maximumHeat: 0,
    ignited: false,
    caught: false,
    complete: totalFuel === 0,
  };
}

/** Adds heat in an aspect-correct circular footprint. */
export function igniteBurnField(
  field: BurnField,
  u: number,
  v: number,
  radius = 0.035,
  intensity = 1,
) {
  if (field.complete || radius <= 0 || intensity <= 0) return false;

  const centerX = clamp(u, 0, 1) * (field.width - 1);
  const centerY = clamp(v, 0, 1) * (field.height - 1);
  const radiusX = Math.max(1, radius * field.width);
  const radiusY = Math.max(1, radius * field.height);
  const minimumX = Math.max(0, Math.floor(centerX - radiusX));
  const maximumX = Math.min(field.width - 1, Math.ceil(centerX + radiusX));
  const minimumY = Math.max(0, Math.floor(centerY - radiusY));
  const maximumY = Math.min(field.height - 1, Math.ceil(centerY + radiusY));
  let touched = false;

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const dx = (x - centerX) / radiusX;
      const dy = (y - centerY) / radiusY;
      const distance = Math.hypot(dx, dy);
      if (distance > 1) continue;
      const index = y * field.width + x;
      if (field.capacity[index] === 0) continue;
      const falloff = 1 - distance * distance;
      field.heat[index] = Math.max(
        field.heat[index] ?? 0,
        clamp(intensity * (0.55 + falloff * 0.8), 0, MAX_HEAT),
      );
      // A lick of flame chars immediately. That tiny mark also gives the
      // combustion loop an unambiguous, self-sustaining seed.
      field.burn[index] = Math.max(field.burn[index] ?? 0, 0.006 * falloff);
      field.surface[index] = Math.max(
        field.surface[index] ?? 0,
        0.014 * falloff,
      );
      if (falloff > 0.04) field.surfaceSeed[index] = 1;
      touched = true;
    }
  }

  if (touched) field.ignited = true;
  return touched;
}

function heatAt(field: BurnField, x: number, y: number) {
  const safeX = clamp(x, 0, field.width - 1);
  const safeY = clamp(y, 0, field.height - 1);
  return field.heat[safeY * field.width + safeX] ?? 0;
}

/** One fixed combustion step. Call through `advanceBurnField` from rAF. */
export function stepBurnField(field: BurnField, dt = BURN_FIXED_STEP) {
  if (field.complete || !field.ignited) return;

  const elapsed = clamp(dt, 0, 1 / 20);
  let burnedFuel = 0;
  let maximumHeat = 0;

  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const index = y * field.width + x;
      const capacity = field.capacity[index] ?? 0;
      if (capacity === 0) {
        field.nextHeat[index] = 0;
        continue;
      }

      const burn = field.burn[index] ?? 0;
      const heat = field.heat[index] ?? 0;
      const stillFuel = burn < capacity;
      const grain = field.grain[index] ?? 0.5;
      const ignitionHeat = IGNITION_HEAT + (grain - 0.5) * 0.026;
      const combusting = stillFuel &&
        field.surfaceSeed[index] === 1 &&
        (burn > 0.001 || heat >= ignitionHeat);

      // Heat is a continuous field. Blending an anisotropic average with the
      // hottest neighbour retains a lively upward flame front while ensuring
      // that every new burning cell is connected to existing fire.
      const left = heatAt(field, x - 1, y);
      const right = heatAt(field, x + 1, y);
      const below = heatAt(field, x, y - 1);
      const above = heatAt(field, x, y + 1);
      const average = (left + right + below * 1.08 + above * 0.86) / 3.94;
      const hottest = Math.max(left, right, below * 1.04, above * 0.9);
      const carriedHeat = average * 0.42 + hottest * 0.58;
      // Flame contact and radiation preheat the immediately adjacent fibres.
      // This remains a four-neighbour, connected wave: no distant cell can
      // ignite before the front physically reaches one of its neighbours.
      const conduction = (carriedHeat - heat) * HEAT_CONDUCTION_RATE;
      const neighbourPreheat = stillFuel
        ? smoothCurve(clamp((hottest - 0.24) / 0.64, 0, 1)) *
          NEIGHBOUR_PREHEAT_RATE
        : 0;
      const layerProgress = capacity === 0 ? 0 : burn / capacity;
      const source = combusting
        ? 0.92 - Math.min(0.2, layerProgress * 0.2)
        : 0;
      const cooling = stillFuel ? 0.11 : 0.82;
      const next = clamp(
        heat +
          (conduction + neighbourPreheat + source - cooling) * elapsed,
        0,
        MAX_HEAT,
      );
      field.nextHeat[index] = next;
      maximumHeat = Math.max(maximumHeat, next);
    }
  }

  const previousHeat = field.heat;
  field.heat = field.nextHeat;
  field.nextHeat = previousHeat;

  // Grow topology from the prior connected front only. Coherent paper
  // resistance makes neighboring cells advance in uneven scallops instead of
  // simply tracing the broad circular heat footprint.
  field.nextSurfaceSeed.set(field.surfaceSeed);
  for (let index = 0; index < field.surfaceSeed.length; index += 1) {
    if (
      field.surfaceSeed[index] === 1 ||
      (field.capacity[index] ?? 0) <= 0 ||
      (field.heat[index] ?? 0) < IGNITION_HEAT + 0.025
    ) continue;
    const x = index % field.width;
    const y = Math.floor(index / field.width);
    // The propagation gate is deliberately much shallower than the eventual
    // perforation threshold. Heated fibres pass combustion to the next cell
    // in one to three fixed steps, while each cell still takes visible time to
    // char and open. This produces a broad burning region instead of a tiny
    // cursor crater that smoulders for a minute.
    const resistance = 0.004 + (field.grain[index] ?? 0.5) * 0.008;
    const canAdvance =
      (x > 0 && field.surfaceSeed[index - 1] === 1 &&
        (field.surface[index - 1] ?? 0) >= resistance) ||
      (x + 1 < field.width && field.surfaceSeed[index + 1] === 1 &&
        (field.surface[index + 1] ?? 0) >= resistance) ||
      (y > 0 && field.surfaceSeed[index - field.width] === 1 &&
        (field.surface[index - field.width] ?? 0) >= resistance) ||
      (y + 1 < field.height && field.surfaceSeed[index + field.width] === 1 &&
        (field.surface[index + field.width] ?? 0) >= resistance);
    if (canAdvance) field.nextSurfaceSeed[index] = 1;
  }
  const previousSurfaceSeed = field.surfaceSeed;
  field.surfaceSeed = field.nextSurfaceSeed;
  field.nextSurfaceSeed = previousSurfaceSeed;

  for (let index = 0; index < field.burn.length; index += 1) {
    const capacity = field.capacity[index] ?? 0;
    let burn = field.burn[index] ?? 0;
    const priorBurn = burn;
    const heat = field.heat[index] ?? 0;
    if (
      capacity > 0 &&
      burn < capacity &&
      heat >= IGNITION_HEAT &&
      field.surfaceSeed[index] === 1
    ) {
      const grain = field.grain[index] ?? 0.5;
      // Paper catches quickly; stack depth determines how long the whole
      // magazine survives, not how slowly the exposed fibres react.
      const rate = PAPER_BURN_RATE *
        (0.88 + grain * 0.24) *
        (0.72 + heat * 0.58);
      burn = Math.min(capacity, burn + rate * elapsed);
      field.burn[index] = burn;
      if (burn >= BURN_CATCH_DEPTH) field.caught = true;
    }
    if (
      capacity > 0 &&
      heat >= IGNITION_HEAT &&
      field.surfaceSeed[index] === 1
    ) {
      const grain = field.grain[index] ?? 0.5;
      const surface = field.surface[index] ?? 0;
      // Scorch reacts immediately, but topology opens only after coherent heat
      // and paper resistance have had time to shape an irregular connected
      // front. A fast cut merely reproduces the circular ignition brush.
      const surfaceRate = SURFACE_PYROLYSIS_RATE *
        (0.58 + grain * 0.84) *
        (0.7 + heat * 0.48);
      field.surface[index] = Math.min(1, surface + surfaceRate * elapsed);
    }
    const consumed = Math.max(0, burn - priorBurn);
    if (consumed > 0) {
      // Only a small fraction of paper mass survives combustion, and that
      // residue remains where the sheet lay until the tabletop plume nudges it.
      const yieldFraction = 0.055 + (field.grain[index] ?? 0.5) * 0.045;
      field.residue[index] = Math.min(
        capacity * 0.13,
        (field.residue[index] ?? 0) + consumed * yieldFraction,
      );
    }
    burnedFuel += Math.min(capacity, burn);
  }

  field.burnedFuel = burnedFuel;
  field.maximumHeat = maximumHeat;
  // Completion is only a numerical clamp now. The previous 98% shortcut
  // could vaporize several visible islands in one frame, which read as a
  // simulation reset rather than paper finishing its burn.
  const completionEpsilon = Math.max(1e-6, field.totalFuel * 1e-7);
  field.complete =
    field.totalFuel === 0 || field.totalFuel - burnedFuel <= completionEpsilon;
  if (field.complete) {
    for (let index = 0; index < field.burn.length; index += 1) {
      field.burn[index] = field.capacity[index] ?? 0;
      field.surface[index] = (field.capacity[index] ?? 0) > 0 ? 1 : 0;
      field.surfaceSeed[index] = (field.capacity[index] ?? 0) > 0 ? 1 : 0;
      field.nextSurfaceSeed[index] = field.surfaceSeed[index] ?? 0;
    }
    field.burnedFuel = field.totalFuel;
    field.heat.fill(0);
    field.maximumHeat = 0;
  }
}

export function advanceBurnField(
  field: BurnField,
  elapsed: number,
  accumulator = 0,
): BurnAdvance {
  let remaining = accumulator + clamp(elapsed, 0, 0.12);
  let steps = 0;
  while (
    remaining >= BURN_FIXED_STEP &&
    steps < MAX_BURN_CATCH_UP_STEPS
  ) {
    stepBurnField(field, BURN_FIXED_STEP);
    remaining -= BURN_FIXED_STEP;
    steps += 1;
  }
  return { accumulator: remaining, steps };
}

export function burnProgress(field: BurnField) {
  return field.totalFuel === 0
    ? 1
    : clamp(field.burnedFuel / field.totalFuel, 0, 1);
}

function filteredCellValue(
  field: BurnField,
  source: Float32Array,
  x: number,
  y: number,
) {
  const centerIndex = y * field.width + x;
  const centerCapacity = field.capacity[centerIndex] ?? 0;
  const center = source[centerIndex] ?? 0;
  let total = center * 4;
  let weight = 4;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    const sampleY = y + offsetY;
    if (sampleY < 0 || sampleY >= field.height) continue;
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      const sampleX = x + offsetX;
      if (sampleX < 0 || sampleX >= field.width) continue;
      const sampleIndex = sampleY * field.width + sampleX;
      // Do not smear a missing cover or a shallower page stack across the
      // magazine seam.
      if ((field.capacity[sampleIndex] ?? 0) !== centerCapacity) continue;
      const spatialWeight = offsetX === 0 || offsetY === 0 ? 2 : 1;
      // The kernel is a plain tent. An earlier bilateral range term preserved
      // the raw cell steps so faithfully that the rendered contour hugged the
      // simulation lattice; a smooth scalar ramp is what lets the shader's
      // sub-texel iso-cut meander between cells instead of outlining them.
      total += (source[sampleIndex] ?? 0) * spatialWeight;
      weight += spatialWeight;
    }
  }
  return total / weight;
}

/**
 * Packs surface topology, heat, physical consumed-layer depth, and stack
 * capacity for the GPU. The blue channel used to contain normalized residue,
 * which could only approximate burn depth because ash yield varies with paper
 * grain. An exact depth channel lets each printed sheet disappear only after
 * combustion actually reaches that layer.
 */
export function writeBurnTexture(field: BurnField, target: Uint8Array) {
  if (target.length !== field.burn.length * 4) {
    throw new Error("Burn texture storage has the wrong size");
  }
  const divisor = Math.max(1, field.maxLayers);
  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const index = y * field.width + x;
      const offset = index * 4;
      const filteredSurface = filteredCellValue(field, field.surface, x, y);
      const filteredHeat = filteredCellValue(field, field.heat, x, y);
      const filteredBurnDepth = filteredCellValue(field, field.burn, x, y);
      target[offset] = Math.round(
        clamp(filteredSurface, 0, 1) * 255,
      );
      target[offset + 1] = Math.round(
        clamp(filteredHeat / MAX_HEAT, 0, 1) * 255,
      );
      target[offset + 2] = Math.round(
        clamp(filteredBurnDepth / divisor, 0, 1) * 255,
      );
      target[offset + 3] = Math.round(
        clamp((field.capacity[index] ?? 0) / divisor, 0, 1) * 255,
      );
    }
  }
}

function catmullRomWeights(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1,
    -1.5 * t3 + 2 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2,
  ];
}

/**
 * CPU mirror of the page shader's clamped Catmull-Rom reconstruction of the
 * surface channel. The renderer performs this on the GPU (nine clamped
 * bilinear taps per visible cut fragment); this mirror exists so tests can
 * assert the reconstructed iso-contour is C1-smooth — bilinear ramps left
 * faint polyline corners on every simulation texel, which read as a stepped
 * mask at close zoom. Coordinates are normalized page UV; taps never cross
 * the magazine spine, so a missing cover cannot bleed across halves.
 */
export function sampleSmoothBurnSurface(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  u: number,
  v: number,
): number {
  if (source.length !== sourceWidth * sourceHeight * 4) {
    throw new Error("Burn texture source storage has the wrong size");
  }
  const half = Math.floor(sourceWidth / 2);
  const leftHalf = u < 0.5;
  const minX = leftHalf ? 0 : half;
  const maxX = leftHalf ? half - 1 : sourceWidth - 1;
  const x = u * sourceWidth - 0.5;
  const y = v * sourceHeight - 0.5;
  const baseX = Math.floor(x);
  const baseY = Math.floor(y);
  const wx = catmullRomWeights(clamp(x - baseX, 0, 1));
  const wy = catmullRomWeights(clamp(y - baseY, 0, 1));
  let value = 0;
  for (let tapY = 0; tapY < 4; tapY += 1) {
    const sampleY = clamp(baseY - 1 + tapY, 0, sourceHeight - 1);
    let row = 0;
    for (let tapX = 0; tapX < 4; tapX += 1) {
      const sampleX = clamp(baseX - 1 + tapX, minX, maxX);
      row += (source[(sampleY * sourceWidth + sampleX) * 4] ?? 0) * wx[tapX]!;
    }
    value += row * wy[tapY]!;
  }
  return clamp(value / 255, 0, 1);
}

export interface BurnDepthRange {
  leftMax: number;
  leftMin: number;
  rightMax: number;
  rightMin: number;
}

/**
 * Per-side consumed-depth extrema, used to skip whole page meshes: a leaf
 * deeper than everything the fire has reached cannot be seen through any
 * hole above it, and a leaf whose entire half has burned past it has no
 * remaining material to draw.
 */
export function measureBurnDepthRange(field: BurnField): BurnDepthRange {
  const half = Math.floor(field.width / 2);
  let leftMax = 0;
  let leftMin = Number.POSITIVE_INFINITY;
  let rightMax = 0;
  let rightMin = Number.POSITIVE_INFINITY;
  for (let y = 0; y < field.height; y += 1) {
    const row = y * field.width;
    for (let x = 0; x < field.width; x += 1) {
      const index = row + x;
      if ((field.capacity[index] ?? 0) <= 0) continue;
      const burn = field.burn[index] ?? 0;
      if (x < half) {
        if (burn > leftMax) leftMax = burn;
        if (burn < leftMin) leftMin = burn;
      } else {
        if (burn > rightMax) rightMax = burn;
        if (burn < rightMin) rightMin = burn;
      }
    }
  }
  return {
    leftMax,
    leftMin: Number.isFinite(leftMin) ? leftMin : 0,
    rightMax,
    rightMin: Number.isFinite(rightMin) ? rightMin : 0,
  };
}

/** Finds a hot point without allocating a list of every burning cell. */
export function sampleHotCell(
  field: BurnField,
  sample: number,
): HotCell | null {
  const length = field.heat.length;
  if (!field.ignited || length === 0) return null;
  const start = Math.floor(clamp(sample, 0, 0.999999) * length);
  for (let attempt = 0; attempt < Math.min(length, 320); attempt += 1) {
    const index = (start + attempt * 97) % length;
    const heat = field.heat[index] ?? 0;
    const capacity = field.capacity[index] ?? 0;
    const burn = field.burn[index] ?? 0;
    const surface = field.surface[index] ?? 0;
    const localProgress = capacity === 0 ? 1 : burn / capacity;
    if (
      capacity === 0 ||
      heat < 0.32 ||
      burn >= capacity ||
      localProgress > 0.48 ||
      surface < 0.12 ||
      surface > 0.84
    ) continue;
    const x = index % field.width;
    const y = Math.floor(index / field.width);
    return {
      u: (x + 0.5) / field.width,
      v: (y + 0.5) / field.height,
      heat,
      burn,
      capacity,
    };
  }
  return null;
}

/**
 * Samples deposited ash without building an allocation-heavy list each frame.
 * Reservoir weighting favors the denser, coherent paper-grain patches, which
 * keeps settled residue from tracing a uniform magazine-sized rectangle.
 */
export function sampleResidueCell(
  field: BurnField,
  sample: number,
): ResidueCell | null {
  const length = field.residue.length;
  if (!field.ignited || length === 0) return null;

  const clampedSample = clamp(sample, 0, 0.999999);
  const start = Math.floor(clampedSample * length);
  let selectedIndex = -1;
  let selectedResidue = 0;
  let totalWeight = 0;

  for (let attempt = 0; attempt < Math.min(length, 384); attempt += 1) {
    const index = (start + attempt * 97) % length;
    const capacity = field.capacity[index] ?? 0;
    const residue = field.residue[index] ?? 0;
    if (capacity <= 0 || residue <= 1e-6) continue;

    const weight = residue / capacity;
    totalWeight += weight;
    // One external random sample is expanded into a deterministic selector so
    // callers keep their seeded sequence while the reservoir remains weighted.
    const selector = Math.abs(
      Math.sin((index + 1) * 12.9898 + clampedSample * 78.233) * 43758.5453,
    ) % 1;
    if (selector <= weight / totalWeight) {
      selectedIndex = index;
      selectedResidue = residue;
    }
  }

  if (selectedIndex < 0) return null;
  const x = selectedIndex % field.width;
  const y = Math.floor(selectedIndex / field.width);
  return {
    u: (x + 0.5) / field.width,
    v: (y + 0.5) / field.height,
    residue: selectedResidue,
    capacity: field.capacity[selectedIndex] ?? 0,
  };
}
