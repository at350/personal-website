import { SHEET_REST_ENERGY } from "./settle";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Material response is strongest in the air and exactly zero on either stack.
 * That gives the moving sheet a glossy highlight without changing a single
 * captured color on the frame where WebGL hands back to the live DOM.
 */
export function paperTurnActivity(progress: number) {
  const clamped = clamp01(progress);
  if (clamped === 0 || clamped === 1) return 0;
  return Math.sin(Math.PI * clamped);
}

/** How strongly sheet motion (normalized mean vertex speed) keeps the gleam
    alive, and how bright that late, physical gleam may get relative to
    mid-flight. The cap keeps the settling shimmer quieter than the turn. */
export const GLEAM_ENERGY_GAIN = 3.2;
export const GLEAM_MOTION_CAP = 0.5;
/** Motion gleam is fully faded in by this energy; it is EXACTLY zero at and
    below SHEET_REST_ENERGY, the level the settle gate swaps to the DOM on —
    whatever frame the gate fires, the mesh already matches the unlit stack. */
const GLEAM_KNEE_END = SHEET_REST_ENERGY * 3;

function motionGleam(energy: number) {
  const raised = Math.max(0, energy);
  const t = Math.min(
    1,
    Math.max(0, (raised - SHEET_REST_ENERGY) / (GLEAM_KNEE_END - SHEET_REST_ENERGY)),
  );
  const knee = t * t * (3 - 2 * t);
  return knee * Math.min(1, raised * GLEAM_ENERGY_GAIN) * GLEAM_MOTION_CAP;
}

/**
 * The gleam envelope the materials actually follow. Position gives the broad
 * mid-flight gloss; motion keeps it breathing while the under-damped sheet is
 * still physically settling, so the highlight dies with the paper's movement
 * instead of cutting out while the page is visibly waving. Exactly zero once
 * the sheet rests — the landing frames must match the unlit DOM pixels.
 */
export function paperGleamActivity(progress: number, energy: number) {
  return Math.min(1, Math.max(paperTurnActivity(progress), motionGleam(energy)));
}

/**
 * Patch three's meshphysical fragment template so EVERY lighting term runs
 * through the paperActivity envelope. The base line gets the paper model, and
 * — critically — the sheen and clearcoat post-mixes that three applies AFTER
 * that line are gated too: ungated, clearcoat alone dims a resting page ~2%
 * (times Fresnel at grazing angles) and both add gloss the envelope cannot
 * turn off, so no landing frame could ever match the unlit stack. At
 * paperActivity = 1 the output is identical to stock three; at 0 it is
 * exactly diffuseColor.rgb — the captured texture, pixel for pixel.
 */
export function injectPaperActivity(fragmentShader: string): string {
  return fragmentShader
    .replace(
      "void main() {",
      "uniform float paperActivity;\nvoid main() {",
    )
    .replace(
      "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
      `
        float pageAlbedoLuma = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.035);
        float pageLightLuma = dot(totalDiffuse, vec3(0.2126, 0.7152, 0.0722)) / pageAlbedoLuma;
        float pageLight = smoothstep(0.25, 1.05, pageLightLuma);
        float movingShade = mix(0.94, 1.012, pageLight);
        float paperShade = mix(1.0, movingShade, paperActivity);
        float paperFresnel = pow(
          1.0 - saturate(dot(geometryNormal, geometryViewDir)),
          2.0
        );
        vec3 paperGleam =
          totalSpecular * (1.7 * paperActivity) +
          vec3(paperFresnel * 0.12 * paperActivity);
        vec3 outgoingLight = diffuseColor.rgb * paperShade + paperGleam;
      `,
    )
    .replace(
      "outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;",
      "outgoingLight = outgoingLight + ( sheenSpecularDirect + sheenSpecularIndirect ) * paperActivity;",
    )
    .replace(
      "outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;",
      "outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc * paperActivity ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * ( material.clearcoat * paperActivity );",
    );
}
