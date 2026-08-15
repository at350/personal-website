import { SHEET_REST_ENERGY } from "./settle";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The persistent sheen is baked into the canonical page texture. Physical
    lighting is therefore motion-only and deliberately capped: it accents the
    bend without turning the moving sheet into a different paper stock. */
export const PAPER_MOTION_RESPONSE_MAX = 0.18;

export function paperOpticalResponse(motionActivity: number) {
  return PAPER_MOTION_RESPONSE_MAX * clamp01(motionActivity);
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
 * the baked-in page sheen instead of appearing on the first moving frame.
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

/** Progress distance from either stack inside which the energy gleam is fully
    retired, and the distance where it is unrestricted. A landed sheet keeps
    waving (and holding energy) for a beat before the canonical texture swap;
    without this ramp that residual energy paints the settled page with a gray
    specular wash until the physics finally rest. */
export const GLEAM_LANDING_FADE_START = 0.045;
export const GLEAM_LANDING_FADE_END = 0.16;

function landingProximityFade(progress: number) {
  const p = clamp01(progress);
  const edgeDistance = Math.min(p, 1 - p);
  const t = clamp01(
    (edgeDistance - GLEAM_LANDING_FADE_START) /
      (GLEAM_LANDING_FADE_END - GLEAM_LANDING_FADE_START),
  );
  return t * t * (3 - 2 * t);
}

/** Motion-only gleam for the weightless drift leaves. No turn-position term
    exists in open air; the shared energy knee still guarantees a resting leaf
    shows the exact canonical pixels the DOM swap needs. */
export function paperDriftActivity(energy: number) {
  return motionGleam(energy);
}

/**
 * The gleam envelope the materials actually follow. Position gives the broad
 * mid-flight gloss; motion keeps it breathing while the under-damped sheet is
 * still airborne. Both terms fade out continuously over the final approach —
 * a sheet lying on a stack must show the exact canonical pixels even while it
 * finishes waving, or the landed page reads as a lingering gray wash next to
 * the unlit stacks and the DOM twin it must match.
 */
export function paperGleamActivity(progress: number, energy: number) {
  return Math.min(
    1,
    Math.max(
      paperTurnActivity(progress),
      motionGleam(energy) * landingProximityFade(progress),
    ),
  );
}

/**
 * Patch three's meshphysical fragment template so EVERY lighting term runs
 * through one capped, motion-only optical response. The base line gets the
 * paper model, and
 * — critically — the sheen and clearcoat post-mixes that three applies AFTER
 * that line are gated too. At paperActivity = 0 the output is the captured
 * page texture exactly, including its persistent sheen; motion adds only a
 * capped view-dependent accent, then returns to those same pixels at landing.
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
        float paperResponse = ${PAPER_MOTION_RESPONSE_MAX.toFixed(3)} * paperActivity;
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
