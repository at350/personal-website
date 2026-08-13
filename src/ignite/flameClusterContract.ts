import type { FlameClusterProfile } from "./flameRibbonState";

export interface FlameClusterCoverage {
  visiblePixels: number;
  peakAlpha: number;
  connectedComponents: number;
  fractionAboveRoot: number;
  centroidRise: number;
  centreAlpha: number;
  boundaryAlpha: number;
}

function lobe(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
) {
  const dx = (x - centerX) / radiusX;
  const dy = (y - centerY) / radiusY;
  const height = Math.max(0, 1 - dx * dx - dy * dy);
  return height * height * (3 - 2 * height);
}

function union(first: number, second: number) {
  const bounded = Math.min(1, Math.max(0, second));
  return first + bounded - first * bounded;
}

/**
 * CPU mirror of the minimum connected cluster topology used as a regression
 * contract. It intentionally omits shader turbulence: if this base mass is
 * not coherent and visible, the animated field cannot be either.
 */
export function measureMinimumFlameCluster(
  profile: FlameClusterProfile,
  width = 96,
  height = 96,
): FlameClusterCoverage {
  const density = new Float32Array(width * height);
  const rootX = width * .5;
  const rootY = 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let field = 0;
      for (let base = -1; base <= 1; base += 1) {
        field = union(field, lobe(
          x,
          y,
          rootX + base * profile.arcWidth * .11,
          rootY + 2.4,
          profile.arcWidth * .145,
          4.1,
        ) * .34);
      }
      for (let branchIndex = 0; branchIndex < 2; branchIndex += 1) {
        const primary = branchIndex === 0;
        const branch = primary ? 0 : 1;
        for (let levelIndex = 0; levelIndex < 5; levelIndex += 1) {
          const level = levelIndex / 4;
          const liveRise = profile.rise * (primary ? .94 : .88);
          field = union(field, lobe(
            x,
            y,
            rootX + branch * profile.arcWidth * .2 +
            profile.branchBias * profile.arcWidth * (primary ? .025 : .08),
            rootY + liveRise * (.18 + level * .24),
            profile.arcWidth * (
              primary ? .25 - level * .16 : .22 - level * .115
            ),
            liveRise * (
              primary ? .18 - level * .075 : .165 - level * .05
            ),
          ) * (primary ? .98 - level * .22 : .74 - level * .24));
        }
      }
      density[y * width + x] = field * .82;
    }
  }

  const visible = new Uint8Array(density.length);
  let visiblePixels = 0;
  let peakAlpha = 0;
  let weightedY = 0;
  let alphaMass = 0;
  let alphaMassAboveRoot = 0;
  for (let index = 0; index < density.length; index += 1) {
    const value = density[index] ?? 0;
    const shape = value <= .075 ? 0 : Math.min(1, (value - .075) / .065);
    const mass = value <= .15 ? 0 : Math.min(1, (value - .15) / .34);
    const alpha = shape * (.12 + mass * .54);
    peakAlpha = Math.max(peakAlpha, alpha);
    alphaMass += alpha;
    const y = Math.floor(index / width);
    weightedY += y * alpha;
    if (y >= rootY + 10) alphaMassAboveRoot += alpha;
    if (alpha >= .12) {
      visible[index] = 1;
      visiblePixels += 1;
    }
  }

  let connectedComponents = 0;
  const seen = new Uint8Array(visible.length);
  const stack = new Int32Array(visible.length);
  for (let start = 0; start < visible.length; start += 1) {
    if ((visible[start] ?? 0) === 0 || (seen[start] ?? 0) === 1) continue;
    connectedComponents += 1;
    let stackSize = 1;
    stack[0] = start;
    seen[start] = 1;
    while (stackSize > 0) {
      const index = stack[--stackSize] ?? 0;
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (
          neighbour < 0 ||
          (visible[neighbour] ?? 0) === 0 ||
          (seen[neighbour] ?? 0) === 1
        ) continue;
        seen[neighbour] = 1;
        stack[stackSize] = neighbour;
        stackSize += 1;
      }
    }
  }
  return {
    visiblePixels,
    peakAlpha,
    connectedComponents,
    fractionAboveRoot: alphaMass > 0 ? alphaMassAboveRoot / alphaMass : 0,
    centroidRise: alphaMass > 0 ? weightedY / alphaMass - rootY : 0,
    centreAlpha: (() => {
      const value = density[Math.floor(rootY + profile.rise * .28) * width +
        Math.floor(rootX)] ?? 0;
      const shape = value <= .075 ? 0 : Math.min(1, (value - .075) / .065);
      const mass = value <= .15 ? 0 : Math.min(1, (value - .15) / .34);
      return shape * (.12 + mass * .54);
    })(),
    boundaryAlpha: (() => {
      const value = density[Math.floor(rootY + profile.rise * .28) * width +
        Math.min(width - 1, Math.floor(rootX + profile.arcWidth * .34))] ?? 0;
      const shape = value <= .075 ? 0 : Math.min(1, (value - .075) / .065);
      const mass = value <= .15 ? 0 : Math.min(1, (value - .15) / .34);
      return shape * (.12 + mass * .54);
    })(),
  };
}
