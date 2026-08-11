import { z } from "zod";
import { MEDIA_SEED } from "./seed";
import { MediaItemSchema, type MediaItem } from "./types";
// `?raw` keeps the import browser-safe and side-steps resolveJsonModule:
// the snapshot is parsed and zod-validated below, item by item.
import liveRaw from "./live.json?raw";

/**
 * The media store merges the build-time snapshot (`live.json`, written by
 * `scripts/refresh-media.mjs`) with the hand-verified seed. The seed always
 * wins on id collisions so a feed can never overwrite verified content, and
 * any invalid snapshot item is silently dropped — failures never break the
 * page.
 */

const LiveSnapshotSchema = z.object({
  items: z.array(z.unknown()).default([]),
  generatedAt: z.string().nullable().default(null),
});

function parseLiveItems(raw: string): MediaItem[] {
  try {
    const snapshot = LiveSnapshotSchema.safeParse(JSON.parse(raw));
    if (!snapshot.success) return [];
    return snapshot.data.items.flatMap((entry) => {
      const item = MediaItemSchema.safeParse(entry);
      return item.success ? [item.data] : [];
    });
  } catch {
    return [];
  }
}

function byPublishedAtDesc(a: MediaItem, b: MediaItem): number {
  if (a.publishedAt === b.publishedAt) return 0;
  if (a.publishedAt === undefined) return 1;
  if (b.publishedAt === undefined) return -1;
  // ISO 8601 strings sort chronologically as text.
  return b.publishedAt.localeCompare(a.publishedAt);
}

/** Merge live items into the seed: seed wins on id collision, newest first. */
export function mergeMedia(seed: MediaItem[], live: MediaItem[]): MediaItem[] {
  const byId = new Map<string, MediaItem>();
  for (const item of live) byId.set(item.id, item);
  for (const item of seed) byId.set(item.id, item);
  return [...byId.values()].sort(byPublishedAtDesc);
}

export function loadMedia(): MediaItem[] {
  return mergeMedia(MEDIA_SEED, parseLiveItems(liveRaw));
}
