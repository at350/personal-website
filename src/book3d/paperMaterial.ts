import { SHEET_REST_ENERGY } from "./settle";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The low optical response shared by resting DOM pages, stack tops, and the
    active leaf. Motion adds to this floor; it never creates glare from zero. */
export const PAPER_BASE_RESPONSE = 0.16;

export function paperOpticalResponse(motionActivity: number) {
  return PAPER_BASE_RESPONSE + (1 - PAPER_BASE_RESPONSE) * clamp01(motionActivity);
}

/** If the physical settle gate reaches its safety timeout with residual sheet
    energy, fade that last motion response over the hold instead of cutting it
    on the unmount frame. Normal low-energy landings already return zero. */
export function fadeSettlingActivity(
  motionActivity: number,
  heldFor: number,
  holdMax: number,
) {
  if (holdMax <= 0) return 0;
  const t = clamp01(heldFor / holdMax);
  const eased = t * t * (3 - 2 * t);
  return clamp01(motionActivity) * (1 - eased);
}

/**
 * Motion response is strongest in the air and zero on either stack. Squaring
 * the sine gives the boost a zero slope at both endpoints, so it grows out of
 * the always-on paper sheen instead of appearing on the first moving frame.
 */
export function paperTurnActivity(progress: number) {
  const clamped = clamp01(progress);
  if (clamped === 0 || clamped === 1) return 0;
  const airborne = Math.sin(Math.PI * clamped);
  return airborne * airborne;
}

/** How strongly sheet motion (normalized mean vertex speed) keeps the gleam
    alive, and how bright that late, physical gleam may get relative to
    mid-flight. The cap keeps the settling shimmer quieter than the turn. */
export const GLEAM_ENERGY_GAIN = 3.2;
export const GLEAM_MOTION_CAP = 0.5;
/** Motion gleam is fully faded in by this energy; it is EXACTLY zero at and
    below SHEET_REST_ENERGY, the level the settle gate swaps to the DOM on —
    ordinary low-energy landings are already on the shared optical baseline. */
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
 * the sheet rests; the shared baseline response remains underneath it.
 */
export function paperGleamActivity(progress: number, energy: number) {
  return Math.min(1, Math.max(paperTurnActivity(progress), motionGleam(energy)));
}

/**
 * Patch three's meshphysical fragment template so EVERY lighting term runs
 * through one optical response: an always-on paper floor plus the motion
 * activity envelope. The base line gets the paper model, and
 * — critically — the sheen and clearcoat post-mixes that three applies AFTER
 * that line are gated too: ungated, clearcoat alone dims a resting page ~2%
 * (times Fresnel at grazing angles) and both otherwise bypass that envelope.
 * At paperActivity = 1 the response is full; at 0 the common low sheen remains
 * so the resting stack, first active frame, and landing frame agree.
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
        float paperResponse = mix(${PAPER_BASE_RESPONSE.toFixed(3)}, 1.0, paperActivity);
        float pageAlbedoLuma = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.035);
        float pageLightLuma = dot(totalDiffuse, vec3(0.2126, 0.7152, 0.0722)) / pageAlbedoLuma;
        float pageLight = smoothstep(0.25, 1.05, pageLightLuma);
        float movingShade = mix(0.94, 1.012, pageLight);
        float paperShade = mix(1.0, movingShade, paperResponse);
        float paperFresnel = pow(
          1.0 - saturate(dot(geometryNormal, geometryViewDir)),
          2.0
        );
        vec3 paperGleam =
          totalSpecular * (1.7 * paperResponse) +
          vec3(paperFresnel * 0.12 * paperResponse);
        vec3 outgoingLight = diffuseColor.rgb * paperShade + paperGleam;
      `,
    )
    .replace(
      "outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;",
      "outgoingLight = outgoingLight + ( sheenSpecularDirect + sheenSpecularIndirect ) * paperResponse;",
    )
    .replace(
      "outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;",
      "outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc * paperResponse ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * ( material.clearcoat * paperResponse );",
    );
}
