import { z } from "zod/mini";

export const MediaSourceSchema = z.enum([
  "local",
  "x",
  "linkedin",
  "letterboxd",
  "goodreads",
  "substack",
  "youtube",
  "web",
]);

export const MediaKindSchema = z.enum([
  "photo",
  "post",
  "film",
  "book",
  "article",
  "video",
  "link",
]);

const safeLink = z.string().check(
  z.trim(),
  z.maxLength(2_048),
  z.refine((value) => {
    if (value.startsWith("/") && !value.startsWith("//")) return true;

    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Expected an http(s) URL or a root-relative path"),
);

const trimmedString = (minimum: number, maximum: number) =>
  z.string().check(
    z.trim(),
    z.minLength(minimum),
    z.maxLength(maximum),
  );

const boundedInteger = (minimum: number, maximum: number) =>
  z.number().check(
    z.int(),
    z.minimum(minimum),
    z.maximum(maximum),
  );

const positiveBoundedInteger = (maximum: number) =>
  z.number().check(
    z.int(),
    z.positive(),
    z.maximum(maximum),
  );

export const MediaImageSchema = z.object({
  src: safeLink,
  alt: trimmedString(1, 240),
  width: z.optional(positiveBoundedInteger(20_000)),
  height: z.optional(positiveBoundedInteger(20_000)),
});

export const MediaRelatedLinkSchema = z.object({
  label: trimmedString(1, 160),
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
  id: trimmedString(1, 180),
  source: MediaSourceSchema,
  kind: MediaKindSchema,
  title: trimmedString(1, 200),
  excerpt: z.optional(trimmedString(1, 500)),
  note: z.optional(trimmedString(1, 500)),
  url: z.optional(safeLink),
  author: z.optional(trimmedString(1, 120)),
  publishedAt: z.optional(z.iso.datetime({ offset: true })),
  /**
   * When the thing itself happened, as opposed to when the entry was posted.
   * Letterboxd logs both: a diary entry published today can record a film
   * watched last week, so film plates print this and the sort keeps using
   * `publishedAt` (the shared activity axis across every source).
   */
  watchedAt: z.optional(z.iso.datetime({ offset: true })),
  /**
   * The same distinction for a book. Goodreads stamps a shelf entry with
   * the day it was posted and, separately, the day the book was finished;
   * book plates print the finish, and a title still on the
   * currently-reading shelf has none yet.
   */
  readAt: z.optional(z.iso.datetime({ offset: true })),
  image: z.optional(MediaImageSchema),
  relatedLinks: z._default(z.array(MediaRelatedLinkSchema).check(z.maxLength(4)), []),
  tags: z._default(z.array(trimmedString(1, 48)).check(z.maxLength(12)), []),
  rating: z.optional(z.number().check(z.minimum(0), z.maximum(5))),
  year: z.optional(boundedInteger(1888, 2200)),
  /** Letterboxd marks a repeat viewing; printed as a mark on the plate. */
  isRewatch: z._default(z.boolean(), false),
  /** Goodreads' currently-reading shelf: an open book, not a finished one. */
  isReading: z._default(z.boolean(), false),
  isFallback: z._default(z.boolean(), false),
});

export const MediaFeedStateSchema = z.enum([
  "live",
  "fallback",
  "disabled",
  "unavailable",
]);

export const MediaFeedReportSchema = z.object({
  state: MediaFeedStateSchema,
  itemCount: z.number().check(z.int(), z.nonnegative()),
});

export const MediaApiResponseSchema = z.object({
  items: z.array(MediaItemSchema),
  generatedAt: z.iso.datetime({ offset: true }),
  degraded: z.boolean(),
  feeds: z.object({
    x: MediaFeedReportSchema,
    linkedin: MediaFeedReportSchema,
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
