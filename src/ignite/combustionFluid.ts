import type { BurnField } from "./burnField";

export const COMBUSTION_FIXED_STEP = 1 / 30;
export const COMBUSTION_MAX_CATCH_UP_STEPS = 3;
export const COMBUSTION_EXTENT_X = 1.08;
export const COMBUSTION_EXTENT_Y = 1.36;

const MAX_HEAT = 1.35;
const BUOYANCY = 0.85;
const SMOKE_WEIGHT = 0.035;
const VORTICITY = 0.34;
const VELOCITY_DIFFUSION = 1.15;
const SCALAR_DIFFUSION = 0.28;
const MAX_VELOCITY = 0.68;

export interface CombustionFluid {
  width: number;
  height: number;
  time: number;
  flame: Float32Array;
  temperature: Float32Array;
  smoke: Float32Array;
  velocityX: Float32Array;
  velocityY: Float32Array;
  source: Float32Array;
  curl: Float32Array;
  nextFlame: Float32Array;
  nextTemperature: Float32Array;
  nextSmoke: Float32Array;
  nextVelocityX: Float32Array;
  nextVelocityY: Float32Array;
}

export interface CombustionAdvance {
  accumulator: number;
  steps: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothCurve(value: number) {
  const safe = clamp(value, 0, 1);
  return safe * safe * (3 - 2 * safe);
}

function fieldIndex(width: number, x: number, y: number) {
  return y * width + x;
}

function sampleBilinear(
  source: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  const safeX = clamp(x, 0, width - 1);
  const safeY = clamp(y, 0, height - 1);
  const x0 = Math.floor(safeX);
  const y0 = Math.floor(safeY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const mixX = safeX - x0;
  const mixY = safeY - y0;
  const top = (source[fieldIndex(width, x0, y0)] ?? 0) * (1 - mixX) +
    (source[fieldIndex(width, x1, y0)] ?? 0) * mixX;
  const bottom = (source[fieldIndex(width, x0, y1)] ?? 0) * (1 - mixX) +
    (source[fieldIndex(width, x1, y1)] ?? 0) * mixX;
  return top * (1 - mixY) + bottom * mixY;
}

function neighbourAverage(
  source: Float32Array,
  width: number,
  index: number,
) {
  return (
    (source[index - 1] ?? 0) +
    (source[index + 1] ?? 0) +
    (source[index - width] ?? 0) +
    (source[index + width] ?? 0)
  ) * 0.25;
}

function burnSurfaceAt(burn: BurnField, x: number, y: number) {
  const safeX = clamp(x, 0, burn.width - 1);
  const safeY = clamp(y, 0, burn.height - 1);
  return burn.surface[safeY * burn.width + safeX] ?? 0;
}

function burnDepthAt(
  burn: BurnField,
  x: number,
  y: number,
  fallback: number,
) {
  const safeX = clamp(x, 0, burn.width - 1);
  const safeY = clamp(y, 0, burn.height - 1);
  const index = safeY * burn.width + safeX;
  // Cells that never held paper (the empty half of a spread, past the page
  // edge) are no depth cliff: comparing against their permanent zero kept
  // spine and edge cells reading as an active frontier forever, which parked
  // immortal flames on the left margin long after the fire had moved on.
  if ((burn.capacity[index] ?? 0) <= 0) return fallback;
  return burn.burn[index] ?? 0;
}

function swap(
  fluid: CombustionFluid,
  current: keyof CombustionFluid,
  next: keyof CombustionFluid,
) {
  const currentValue = fluid[current] as Float32Array;
  const nextValue = fluid[next] as Float32Array;
  // The keys supplied here always identify equally sized Float32Array buffers.
  (fluid as unknown as Record<string, unknown>)[current] = nextValue;
  (fluid as unknown as Record<string, unknown>)[next] = currentValue;
}

export function createCombustionFluid(
  width = 144,
  height = 108,
): CombustionFluid {
  if (width < 8 || height < 8) {
    throw new Error("A combustion fluid needs at least an 8 by 8 grid");
  }
  const length = width * height;
  return {
    width,
    height,
    time: 0,
    flame: new Float32Array(length),
    temperature: new Float32Array(length),
    smoke: new Float32Array(length),
    velocityX: new Float32Array(length),
    velocityY: new Float32Array(length),
    source: new Float32Array(length),
    curl: new Float32Array(length),
    nextFlame: new Float32Array(length),
    nextTemperature: new Float32Array(length),
    nextSmoke: new Float32Array(length),
    nextVelocityX: new Float32Array(length),
    nextVelocityY: new Float32Array(length),
  };
}

/**
 * Downsamples the actual connected paper reaction into the gas grid. The page
 * occupies the central part of the taller atmospheric domain, leaving room
 * above and around it for buoyant flame and smoke.
 */
function updateSources(fluid: CombustionFluid, burn: BurnField) {
  const { width, height, source } = fluid;
  source.fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    const atmosphereV = (y + 0.5) / height;
    const pageV = (atmosphereV - 0.5) * COMBUSTION_EXTENT_Y + 0.5;
    if (pageV <= 0 || pageV >= 1) continue;
    const burnY = clamp(Math.floor(pageV * burn.height), 0, burn.height - 1);
    for (let x = 1; x < width - 1; x += 1) {
      const atmosphereU = (x + 0.5) / width;
      const pageU = (atmosphereU - 0.5) * COMBUSTION_EXTENT_X + 0.5;
      if (pageU <= 0 || pageU >= 1) continue;
      const burnX = clamp(Math.floor(pageU * burn.width), 0, burn.width - 1);
      const burnIndex = burnY * burn.width + burnX;
      const capacity = burn.capacity[burnIndex] ?? 0;
      const consumed = burn.burn[burnIndex] ?? 0;
      const heat = (burn.heat[burnIndex] ?? 0) / MAX_HEAT;
      const surface = burn.surface[burnIndex] ?? 0;
      if (capacity <= 0 || consumed >= capacity || heat <= 0.08) continue;

      // A hot front is defined by a local drop into younger/cold paper. Surface
      // age alone selected the entire diamond-shaped burned interior; this
      // neighbour span retains only the thin connected reaction boundary.
      const left = burnSurfaceAt(burn, burnX - 2, burnY);
      const right = burnSurfaceAt(burn, burnX + 2, burnY);
      const below = burnSurfaceAt(burn, burnX, burnY - 2);
      const above = burnSurfaceAt(burn, burnX, burnY + 2);
      const diagonalA = burnSurfaceAt(burn, burnX - 1, burnY - 1);
      const diagonalB = burnSurfaceAt(burn, burnX + 1, burnY + 1);
      const diagonalC = burnSurfaceAt(burn, burnX - 1, burnY + 1);
      const diagonalD = burnSurfaceAt(burn, burnX + 1, burnY - 1);
      const youngestNeighbour = Math.min(
        left,
        right,
        below,
        above,
        diagonalA,
        diagonalB,
        diagonalC,
        diagonalD,
      );
      const oldestNeighbour = Math.max(
        left,
        right,
        below,
        above,
        diagonalA,
        diagonalB,
        diagonalC,
        diagonalD,
      );
      const localSpan = Math.max(
        surface - youngestNeighbour,
        oldestNeighbour - surface,
      );
      const exposedFront = smoothCurve((localSpan - 0.032) / 0.095);
      const caught = smoothCurve((surface - 0.06) / 0.105);
      const notSpent = 1 - smoothCurve((surface - 0.37) / 0.125);
      const hot = smoothCurve((heat - 0.06) / 0.48);
      const grain = burn.grain[burnIndex] ?? 0.5;
      // Two low-frequency material phases vary the fuel feed along the rim.
      // Keep a low live floor so the connected reaction never collapses into
      // isolated graphic dots; stronger patches still form the taller tongues.
      const firstPatch = 0.5 + 0.5 * Math.sin(
        burnX * 0.17 + burnY * 0.121 + grain * 5.9 + fluid.time * 0.64,
      );
      const secondPatch = 0.5 + 0.5 * Math.sin(
        burnX * -0.11 + burnY * 0.2 + grain * 3.7 - fluid.time * 0.43,
      );
      const patch = Math.max(firstPatch, secondPatch * 0.94);
      const intermittent = smoothCurve((patch - 0.675) / 0.18);
      const topSource = exposedFront * caught * notSpent * hot *
        (0.86 + grain * 0.6) * intermittent;

      // Once the top sheet is fully open the reaction continues on the
      // leaves below. Their active boundary is where consumption leads into
      // fresher fuel — invisible to the saturated top-sheet surface span.
      // The drop is one-sided: uneven pacing between equally deep interior
      // cells is not a frontier and must not light gas.
      const depthLeft = burnDepthAt(burn, burnX - 2, burnY, consumed);
      const depthRight = burnDepthAt(burn, burnX + 2, burnY, consumed);
      const depthBelow = burnDepthAt(burn, burnX, burnY - 2, consumed);
      const depthAbove = burnDepthAt(burn, burnX, burnY + 2, consumed);
      const frontierDrop = consumed -
        Math.min(depthLeft, depthRight, depthBelow, depthAbove);
      const deepFront = smoothCurve((frontierDrop - 0.45) / 0.6);
      const opened = smoothCurve((surface - 0.55) / 0.2);
      const deepSource = deepFront * opened * hot *
        (0.78 + grain * 0.5) * smoothCurve((patch - 0.5) / 0.3);

      source[fieldIndex(width, x, y)] = Math.max(topSource, deepSource);
    }
  }
}

function injectSources(fluid: CombustionFluid, dt: number) {
  const flameRetention = Math.exp(-54 * dt);
  const heatRetention = Math.exp(-42 * dt);
  const smokeRetention = Math.exp(-0.34 * dt);
  for (let index = 0; index < fluid.source.length; index += 1) {
    const source = fluid.source[index] ?? 0;
    if (source <= 0) continue;
    fluid.flame[index] = 1 - (1 - (fluid.flame[index] ?? 0)) *
      Math.pow(flameRetention, source);
    fluid.temperature[index] = 1 - (1 - (fluid.temperature[index] ?? 0)) *
      Math.pow(heatRetention, source);
    // A hot paper front emits a little soot immediately; most smoke is added
    // later as advected flame cools.
    fluid.smoke[index] = 1 - (1 - (fluid.smoke[index] ?? 0)) *
      Math.pow(smokeRetention, source);
    // Give each hot source a physical upward impulse. A small deterministic
    // tangent component causes adjacent lobes to peel apart as they rise.
    const x = index % fluid.width;
    const y = Math.floor(index / fluid.width);
    const tangent = Math.sin(x * 0.31 - y * 0.17 + fluid.time * 2.1);
    fluid.velocityX[index] = clamp(
      (fluid.velocityX[index] ?? 0) + tangent * source * 0.065,
      -MAX_VELOCITY,
      MAX_VELOCITY,
    );
    fluid.velocityY[index] = Math.max(
      fluid.velocityY[index] ?? 0,
      0.26 + source * 0.32,
    );
  }
}

function computeCurl(fluid: CombustionFluid) {
  const { width, height, velocityX, velocityY, curl } = fluid;
  curl.fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = fieldIndex(width, x, y);
      const dVdx = ((velocityY[index + 1] ?? 0) -
        (velocityY[index - 1] ?? 0)) * 0.5;
      const dUdy = ((velocityX[index + width] ?? 0) -
        (velocityX[index - width] ?? 0)) * 0.5;
      curl[index] = dVdx - dUdy;
    }
  }
}

function applyForces(fluid: CombustionFluid, dt: number) {
  const {
    width,
    height,
    flame,
    temperature,
    smoke,
    velocityX,
    velocityY,
    nextVelocityX,
    nextVelocityY,
    curl,
  } = fluid;
  nextVelocityX.fill(0);
  nextVelocityY.fill(0);
  const diffusion = clamp(VELOCITY_DIFFUSION * dt, 0, 0.22);
  const damping = Math.exp(-0.52 * dt);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = fieldIndex(width, x, y);
      const curlValue = curl[index] ?? 0;
      const gradientX = Math.abs(curl[index + 1] ?? 0) -
        Math.abs(curl[index - 1] ?? 0);
      const gradientY = Math.abs(curl[index + width] ?? 0) -
        Math.abs(curl[index - width] ?? 0);
      const gradientLength = Math.hypot(gradientX, gradientY) + 1e-5;
      const normalX = gradientX / gradientLength;
      const normalY = gradientY / gradientLength;
      const confinementX = normalY * curlValue * VORTICITY;
      const confinementY = -normalX * curlValue * VORTICITY;

      const heat = temperature[index] ?? 0;
      const luminous = flame[index] ?? 0;
      const soot = smoke[index] ?? 0;
      // Deterministic sub-grid stirring seeds curl but never creates density.
      const stirring = (
        Math.sin(x * 0.171 + y * 0.113 + fluid.time * 2.7) +
        Math.sin(x * -0.087 + y * 0.193 - fluid.time * 1.9)
      ) * 0.014 * heat;
      let nextX = (velocityX[index] ?? 0) +
        (confinementX + stirring) * dt;
      let nextY = (velocityY[index] ?? 0) + (
        confinementY +
        (heat * 0.72 + luminous * 0.28) * BUOYANCY -
        soot * SMOKE_WEIGHT
      ) * dt;
      nextX += (neighbourAverage(velocityX, width, index) - nextX) * diffusion;
      nextY += (neighbourAverage(velocityY, width, index) - nextY) * diffusion;
      const speed = Math.hypot(nextX, nextY);
      if (speed > MAX_VELOCITY) {
        nextX *= MAX_VELOCITY / speed;
        nextY *= MAX_VELOCITY / speed;
      }
      nextVelocityX[index] = nextX * damping;
      nextVelocityY[index] = nextY * damping;
    }
  }
  swap(fluid, "velocityX", "nextVelocityX");
  swap(fluid, "velocityY", "nextVelocityY");
}

function advect(fluid: CombustionFluid, dt: number) {
  const {
    width,
    height,
    flame,
    temperature,
    smoke,
    velocityX,
    velocityY,
    nextFlame,
    nextTemperature,
    nextSmoke,
    nextVelocityX,
    nextVelocityY,
  } = fluid;
  nextFlame.fill(0);
  nextTemperature.fill(0);
  nextSmoke.fill(0);
  nextVelocityX.fill(0);
  nextVelocityY.fill(0);
  const scalarMix = clamp(SCALAR_DIFFUSION * dt, 0, 0.12);
  const flameDecay = Math.exp(-3.0 * dt);
  const heatDecay = Math.exp(-1.95 * dt);
  const smokeDecay = Math.exp(-0.78 * dt);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = fieldIndex(width, x, y);
      const u = velocityX[index] ?? 0;
      const v = velocityY[index] ?? 0;
      const sampleX = x - u * dt * width;
      const sampleY = y - v * dt * height;
      const advectedFlame = sampleBilinear(flame, width, height, sampleX, sampleY);
      const advectedHeat = sampleBilinear(
        temperature,
        width,
        height,
        sampleX,
        sampleY,
      );
      const advectedSmoke = sampleBilinear(smoke, width, height, sampleX, sampleY);
      const diffusedFlame = advectedFlame +
        (neighbourAverage(flame, width, index) - advectedFlame) * scalarMix;
      const diffusedHeat = advectedHeat +
        (neighbourAverage(temperature, width, index) - advectedHeat) * scalarMix;
      const diffusedSmoke = advectedSmoke +
        (neighbourAverage(smoke, width, index) - advectedSmoke) * scalarMix;
      const cooledFlame = Math.max(0, diffusedFlame * flameDecay);
      const consumedFlame = Math.max(0, diffusedFlame - cooledFlame);
      nextFlame[index] = cooledFlame;
      nextTemperature[index] = clamp(
        diffusedHeat * heatDecay + cooledFlame * 0.075 * dt,
        0,
        1,
      );
      nextSmoke[index] = clamp(
        diffusedSmoke * smokeDecay + consumedFlame * 0.105,
        0,
        1,
      );
      nextVelocityX[index] = sampleBilinear(
        velocityX,
        width,
        height,
        sampleX,
        sampleY,
      );
      nextVelocityY[index] = sampleBilinear(
        velocityY,
        width,
        height,
        sampleX,
        sampleY,
      );
    }
  }
  swap(fluid, "flame", "nextFlame");
  swap(fluid, "temperature", "nextTemperature");
  swap(fluid, "smoke", "nextSmoke");
  swap(fluid, "velocityX", "nextVelocityX");
  swap(fluid, "velocityY", "nextVelocityY");
}

function clearBoundary(fluid: CombustionFluid, layers = 2) {
  const fields = [
    fluid.flame,
    fluid.temperature,
    fluid.smoke,
    fluid.velocityX,
    fluid.velocityY,
    fluid.source,
  ];
  for (const field of fields) {
    for (let layer = 0; layer < layers; layer += 1) {
      const top = layer * fluid.width;
      const bottom = (fluid.height - 1 - layer) * fluid.width;
      for (let x = 0; x < fluid.width; x += 1) {
        field[top + x] = 0;
        field[bottom + x] = 0;
      }
      for (let y = layer; y < fluid.height - layer; y += 1) {
        field[y * fluid.width + layer] = 0;
        field[y * fluid.width + fluid.width - 1 - layer] = 0;
      }
    }
  }
}

export function stepCombustionFluid(
  fluid: CombustionFluid,
  burn: BurnField,
  dt = COMBUSTION_FIXED_STEP,
) {
  const elapsed = clamp(dt, 0, 1 / 20);
  fluid.time += elapsed;
  updateSources(fluid, burn);
  injectSources(fluid, elapsed);
  computeCurl(fluid);
  applyForces(fluid, elapsed);
  advect(fluid, elapsed);
  clearBoundary(fluid);
}

export function advanceCombustionFluid(
  fluid: CombustionFluid,
  burn: BurnField,
  elapsed: number,
  accumulator = 0,
): CombustionAdvance {
  let remaining = accumulator + clamp(elapsed, 0, 0.12);
  let steps = 0;
  while (
    remaining >= COMBUSTION_FIXED_STEP &&
    steps < COMBUSTION_MAX_CATCH_UP_STEPS
  ) {
    stepCombustionFluid(fluid, burn, COMBUSTION_FIXED_STEP);
    remaining -= COMBUSTION_FIXED_STEP;
    steps += 1;
  }
  return { accumulator: remaining, steps };
}

export function writeCombustionTexture(
  fluid: CombustionFluid,
  target: Uint8Array,
) {
  if (target.length !== fluid.flame.length * 4) {
    throw new Error("Combustion texture storage has the wrong size");
  }
  for (let index = 0; index < fluid.flame.length; index += 1) {
    const offset = index * 4;
    target[offset] = Math.round(clamp(fluid.flame[index] ?? 0, 0, 1) * 255);
    target[offset + 1] = Math.round(
      clamp(fluid.temperature[index] ?? 0, 0, 1) * 255,
    );
    target[offset + 2] = Math.round(
      clamp(fluid.smoke[index] ?? 0, 0, 1) * 255,
    );
    // Alpha is a fourth data channel: the instantaneous material-space source.
    // It lets the renderer keep a white-yellow foot attached to the char rim
    // while the red flame channel advects upward as a gaseous tongue.
    target[offset + 3] = Math.round(
      clamp(fluid.source[index] ?? 0, 0, 1) * 255,
    );
  }
}
