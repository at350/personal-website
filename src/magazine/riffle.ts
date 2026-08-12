/** Pure planning and timing for a fast multi-sheet page riffle. */

export const RIFFLE_VISIBLE_MAX = 5;
export const RIFFLE_LEAF_DURATION = 0.34;
export const RIFFLE_STAGGER = 0.045;

export interface RiffleTransition {
  from: number;
  to: number;
  direction: 1 | -1;
  /** Every physical sheet crossed, in turn order. */
  sheets: readonly number[];
  /** Representative sheets rendered when the jump crosses more than five. */
  visibleSheets: readonly number[];
}

export interface RiffleStackCounts {
  left: number;
  right: number;
  flying: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Physical sheet boundaries crossed while moving between two spreads. */
export function crossedSheets(from: number, to: number): number[] {
  if (from === to) return [];
  const direction: 1 | -1 = to > from ? 1 : -1;
  const sheets: number[] = [];

  for (
    let sheet = direction === 1 ? from : from - 1;
    direction === 1 ? sheet < to : sheet >= to;
    sheet += direction
  ) {
    sheets.push(sheet);
  }

  return sheets;
}

/**
 * Cap the rendered packet while preserving its first sheet, last sheet, and
 * physical order. Long jumps still land at the exact destination.
 */
export function sampleRiffleSheets(
  sheets: readonly number[],
  maxVisible = RIFFLE_VISIBLE_MAX,
): number[] {
  const limit = Math.max(0, Math.floor(maxVisible));
  if (limit === 0 || sheets.length === 0) return [];
  if (sheets.length <= limit) return [...sheets];
  if (limit === 1) return [sheets[0]!];

  return Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.round((index * (sheets.length - 1)) / (limit - 1));
    return sheets[sourceIndex]!;
  });
}

export function createRiffleTransition(
  from: number,
  to: number,
  maxVisible = RIFFLE_VISIBLE_MAX,
): RiffleTransition | null {
  const sheets = crossedSheets(from, to);
  if (sheets.length < 2) return null;
  return {
    from,
    to,
    direction: to > from ? 1 : -1,
    sheets,
    visibleSheets: sampleRiffleSheets(sheets, maxVisible),
  };
}

/** Total seconds for a packet: one leaf flight plus the short launch stagger. */
export function riffleDuration(visibleCount: number): number {
  if (visibleCount <= 0) return 0;
  return RIFFLE_LEAF_DURATION + (visibleCount - 1) * RIFFLE_STAGGER;
}

/** Eased 0..1 completion for one leaf on the shared riffle clock. */
export function riffleLeafCompletion(elapsed: number, ordinal: number): number {
  const linear = clamp01(
    (elapsed - ordinal * RIFFLE_STAGGER) / RIFFLE_LEAF_DURATION,
  );
  return linear * linear * (3 - 2 * linear);
}

/** Physical page-turn progress: forward is 0→1; backward is 1→0. */
export function riffleLeafProgress(
  elapsed: number,
  ordinal: number,
  direction: 1 | -1,
): number {
  const completion = riffleLeafCompletion(elapsed, ordinal);
  return direction === 1 ? completion : 1 - completion;
}

/** Static stacks while every crossed sheet is represented by the flying packet. */
export function riffleStackCounts(
  totalLeaves: number,
  transition: Pick<RiffleTransition, "from" | "to">,
): RiffleStackCounts {
  const left = Math.min(transition.from, transition.to);
  const right = totalLeaves - Math.max(transition.from, transition.to);
  return {
    left,
    right,
    flying: Math.abs(transition.to - transition.from),
  };
}
