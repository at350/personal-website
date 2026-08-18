import { z } from "zod";

export const MediaSourceSchema = z.enum([
  "local",
  "x",
  "letterboxd",
  "substack",
  "youtube",
  "web",
]);

export const MediaKindSchema = z.enum([
  "photo",
  "post",
  "film",
  "article",
  "video",
  "link",
]);

const safeLink = z.string().trim().max(2_048).refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) return true;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}, "Expected an http(s) URL or a root-relative path");

export const MediaImageSchema = z.object({
  src: safeLink,
  alt: z.string().trim().min(1).max(240),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
});

export const MediaRelatedLinkSchema = z.object({
  label: z.string().trim().min(1).max(160),
  url: safeLink,
});

/**
 * One presentation-neutral item in the media library.
 *
 * `excerpt` is text supplied by, or neutrally describing, the source.
 * `note` is reserved for Alan's own editorial aside so the two are never
 * accidentally presented as the same claim.
 */
export const MediaItemSchema = z.object({
  id: z.string().trim().min(1).max(180),
  source: MediaSourceSchema,
  kind: MediaKindSchema,
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().min(1).max(500).optional(),
  note: z.string().trim().min(1).max(500).optional(),
  url: safeLink.optional(),
  author: z.string().trim().min(1).max(120).optional(),
  publishedAt: z.string().datetime({ offset: true }).optional(),
  /**
   * When the thing itself happened, as opposed to when the entry was posted.
   * Letterboxd logs both: a diary entry published today can record a film
   * watched last week, so film plates print this and the sort keeps using
   * `publishedAt` (the shared activity axis across every source).
   */
  watchedAt: z.string().datetime({ offset: true }).optional(),
  image: MediaImageSchema.optional(),
  relatedLinks: z.array(MediaRelatedLinkSchema).max(4).default([]),
  tags: z.array(z.string().trim().min(1).max(48)).max(12).default([]),
  rating: z.number().min(0).max(5).optional(),
  year: z.number().int().min(1888).max(2200).optional(),
  /** Letterboxd marks a repeat viewing; printed as a mark on the plate. */
  isRewatch: z.boolean().default(false),
  isFallback: z.boolean().default(false),
});

export const MediaFeedStateSchema = z.enum([
  "live",
  "fallback",
  "disabled",
  "unavailable",
]);

export const MediaFeedReportSchema = z.object({
  state: MediaFeedStateSchema,
  itemCount: z.number().int().nonnegative(),
});

export const MediaApiResponseSchema = z.object({
  items: z.array(MediaItemSchema),
  generatedAt: z.string().datetime({ offset: true }),
  degraded: z.boolean(),
  feeds: z.object({
    x: MediaFeedReportSchema,
    letterboxd: MediaFeedReportSchema,
    substack: MediaFeedReportSchema,
  }),
  warnings: z.array(z.string()),
});

export type MediaSource = z.infer<typeof MediaSourceSchema>;
export type MediaKind = z.infer<typeof MediaKindSchema>;
export type MediaImage = z.infer<typeof MediaImageSchema>;
export type MediaItem = z.infer<typeof MediaItemSchema>;
export type MediaFeedState = z.infer<typeof MediaFeedStateSchema>;
export type MediaFeedReport = z.infer<typeof MediaFeedReportSchema>;
export type MediaApiResponse = z.infer<typeof MediaApiResponseSchema>;

