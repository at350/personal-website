import { XMLParser } from "fast-xml-parser";
import { MediaItemSchema, type MediaItem } from "./types";

/**
 * Browser-safe feed normalizers. Each takes raw feed payloads and returns
 * schema-validated `MediaItem`s. Journalism rules apply downstream: excerpts
 * are verbatim-or-absent, so nothing here invents or rewrites source text.
 *
 * Failure policy: any unexpected shape returns `[]` (the seed always carries
 * the page), and one bad item never kills the batch — items are validated
 * one by one and invalid ones are dropped.
 *
 * NOTE: `scripts/refresh-media.mjs` intentionally duplicates a minimal copy of
 * this logic so it can run under plain node. This module is the source of
 * truth; keep the two in sync.
 */

type XmlNode = Record<string, unknown>;

function asRecord(value: unknown): XmlNode | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as XmlNode)
    : undefined;
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Extract the text of an XML node (plain scalar or `{ "#text": … }`). */
function textOf(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const record = asRecord(value);
  if (record && "#text" in record) return textOf(record["#text"]);
  return undefined;
}

function numOf(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const text = textOf(value);
  if (text === undefined) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isoDate(value: unknown): string | undefined {
  const text = textOf(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function firstImgSrc(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const match = /<img[^>]*\ssrc=["']([^"']+)["']/i.exec(html);
  return match?.[1];
}

/** Decode the handful of entities feeds actually emit, in a fixed order. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&(?:nbsp|#160);/g, " ")
    .replace(/&(?:mdash|#8212);/g, "—");
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Split one post into a headline and a non-overlapping continuation. */
function splitPostCopy(text: string): { title: string; excerpt?: string } {
  if (text.length <= 60) return { title: text };
  const window = text.slice(0, 59);
  const wordBreak = window.lastIndexOf(" ");
  const cut = wordBreak >= 30 ? wordBreak : window.length;
  const title = `${text.slice(0, cut).trimEnd()}…`;
  const remainder = text.slice(cut).trimStart();
  return {
    title,
    excerpt: remainder ? truncate(remainder, 500) : undefined,
  };
}

/**
 * AnyAPI timestamps a post as a UTC epoch in *seconds*. `isoDate` cannot read
 * that — `new Date("1787071196")` is not a date — so the number needs its own
 * converter. Without one every post silently loses `publishedAt` and sinks to
 * the bottom of the library instead of leading it.
 */
function epochSecondsToIso(value: unknown): string | undefined {
  const seconds = typeof value === "number" ? value : Number(textOf(value));
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** `https://x.com/<handle>/status/<id>` — where the byline is stated. */
const X_STATUS_URL =
  /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/\d+/i;

function handleFromStatusUrl(url: string | undefined): string | undefined {
  return url ? X_STATUS_URL.exec(url)?.[1] : undefined;
}

/**
 * X — and only X — appends a t.co shortlink for any attached photo, video, or
 * quoted post. That link is furniture, not copy: left in, it becomes the
 * headline of a short post ("my fav https://t.co/…"). Only a trailing run is
 * dropped, so a link someone wrote mid-sentence still reads as written. It is
 * applied at the X call site, never to LinkedIn copy, where a trailing
 * shortlink would be something the author actually typed.
 */
const TRAILING_TCO = /(?:\s*https?:\/\/t\.co\/[A-Za-z0-9]+)+\s*$/i;

/**
 * A repost is someone else's words under our byline, and every item this
 * normalizer emits is authored by the account it fetched. Dropping them keeps
 * the library from attributing a stranger's post to Alan.
 */
const RETWEET_PREFIX = /^RT @[A-Za-z0-9_]{1,15}:/;

/** Post copy as written: entities decoded, newlines folded to spaces. */
function postText(raw: string): string {
  return decodeEntities(raw).replace(/\s+/g, " ").trim();
}

/** Only pass dimensions the schema will actually accept. */
function isPositiveInt(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

/** One plate image, with only the dimensions the schema will accept. */
function plateImage(
  src: string | undefined,
  width: number | undefined,
  height: number | undefined,
  title: string,
): MediaItem["image"] | undefined {
  if (!src) return undefined;
  return {
    src,
    alt: truncate(`Image from the post “${title}”`, 240),
    width: isPositiveInt(width) ? width : undefined,
    height: isPositiveInt(height) ? height : undefined,
  };
}

/** First usable still from a post: an attached image, else a video poster. */
function postImage(
  images: unknown,
  videoThumbnail: unknown,
  title: string,
): MediaItem["image"] | undefined {
  const first = asRecord(toArray(images)[0]);
  return plateImage(
    textOf(first?.url) ?? textOf(videoThumbnail),
    numOf(first?.width),
    numOf(first?.height),
    title,
  );
}

function rssItems(xml: string): XmlNode[] {
  // Letterboxd writes apostrophes as numeric character references
  // (`Don&#039;t`), which this parser only decodes under `htmlEntities` —
  // without it the reference reaches the plate as literal text.
  const parser = new XMLParser({ ignoreAttributes: false, htmlEntities: true });
  const doc = asRecord(parser.parse(xml));
  const channel = asRecord(asRecord(doc?.rss)?.channel);
  return toArray(channel?.item).flatMap((entry) => {
    const record = asRecord(entry);
    return record ? [record] : [];
  });
}

/** Validate candidates one by one; drop (never throw on) invalid items. */
function validateItems(candidates: unknown[]): MediaItem[] {
  return candidates.flatMap((candidate) => {
    const result = MediaItemSchema.safeParse(candidate);
    return result.success ? [result.data] : [];
  });
}

/**
 * Letterboxd packs the poster and a "Watched on <date>." line into every
 * entry's description; a review adds the member's own copy alongside them.
 * Strip the furniture so only that copy survives (verbatim or absent).
 */
const LETTERBOXD_DIARY_LINE = /^(?:re)?watched on\b/iu;

function letterboxdReview(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const copy = html
    .replace(/<img[^>]*>/gi, " ")
    .split(/<\/p\s*>/i)
    .map((chunk) => stripHtml(chunk))
    .filter((text) => text.length > 0 && !LETTERBOXD_DIARY_LINE.test(text))
    .join(" ")
    .trim();
  return copy ? truncate(copy, 280) : undefined;
}

const LETTERBOXD_TITLE =
  /^(?<title>.+?)(?:,\s*(?<year>\d{4}))?(?:\s*-\s*(?<stars>[★½]+))?\s*$/u;

function starsToRating(stars: string | undefined): number | undefined {
  if (!stars) return undefined;
  let rating = 0;
  for (const glyph of stars) {
    if (glyph === "★") rating += 1;
    if (glyph === "½") rating += 0.5;
  }
  return rating > 0 ? rating : undefined;
}

/** Fallback parse of a letterboxd item title: `Film Name, 2024 - ★★★★`. */
function parseLetterboxdTitle(raw: string): {
  title: string;
  year: number | undefined;
  rating: number | undefined;
} {
  const groups = LETTERBOXD_TITLE.exec(raw)?.groups;
  return {
    title: groups?.title?.trim() ?? raw.trim(),
    year: groups?.year ? Number(groups.year) : undefined,
    rating: starsToRating(groups?.stars),
  };
}

export function fromLetterboxdRss(xml: string): MediaItem[] {
  try {
    const candidates = rssItems(xml).map((item) => {
      const fromTitle = parseLetterboxdTitle(textOf(item.title) ?? "");
      const title = textOf(item["letterboxd:filmTitle"]) ?? fromTitle.title;
      const link = textOf(item.link);
      const guid = textOf(item.guid);
      const description = textOf(item.description);
      const poster = firstImgSrc(description);
      return {
        id: `letterboxd:${guid ?? link ?? title}`,
        source: "letterboxd",
        kind: "film",
        title,
        url: link,
        excerpt: letterboxdReview(description),
        publishedAt: isoDate(item.pubDate),
        watchedAt: isoDate(item["letterboxd:watchedDate"]),
        year: numOf(item["letterboxd:filmYear"]) ?? fromTitle.year,
        rating: numOf(item["letterboxd:memberRating"]) ?? fromTitle.rating,
        isRewatch:
          textOf(item["letterboxd:rewatch"])?.toLowerCase() === "yes",
        image: poster
          ? { src: poster, alt: `Poster for ${title}` }
          : undefined,
      };
    });
    return validateItems(candidates);
  } catch {
    return [];
  }
}

/** The two Goodreads shelves the library reads; the name is the RSS `shelf=`. */
export type GoodreadsShelf = "read" | "currently-reading";

/**
 * Goodreads writes 0 where a book was shelved without a rating, and prints
 * "rating: 0" in the description to match. Zero stars is not a verdict, so it
 * never reaches the plate.
 */
function bookRating(value: unknown): number | undefined {
  const rating = numOf(value);
  return rating !== undefined && rating > 0 ? rating : undefined;
}

/**
 * `book_published` is the first edition's year, and for a classical text that
 * is negative — Gorgias' Encomium of Helen arrives as -380. The schema's year
 * range belongs to the film era, and a value outside it would sink the whole
 * item rather than just the year, so only a year the schema accepts is kept.
 */
function bookYear(value: unknown): number | undefined {
  const year = numOf(value);
  return year !== undefined && MediaItemSchema.shape.year.safeParse(year).success
    ? year
    : undefined;
}

/** The member's own review, as written; Goodreads allows light HTML in it. */
function goodreadsReview(value: unknown): string | undefined {
  const text = textOf(value);
  if (!text) return undefined;
  const copy = stripHtml(text);
  return copy ? truncate(copy, 280) : undefined;
}

/**
 * A Goodreads cover URL usually ends in a size suffix (`._SX318_.jpg`,
 * `._SY475_.jpg`) that the CDN resolves to a plate-sized file. Some covers
 * arrive bare, and a bare URL is the full scan: one such cover weighed 2.5 MB
 * against 32 KB for its sized twin. The CDN honours the suffix on any cover,
 * so a bare URL is given the standard large width before it is ever fetched
 * or mirrored.
 *
 * Only a real cover can take the suffix, though. A book with no cover on
 * file arrives with Goodreads' stock "nophoto" placeholder instead
 * (`…/assets/nophoto/book/111x148-….png`), and that file has no sized twin:
 * suffixing it yields a URL the CDN answers 404, which ships a broken plate
 * and has the mirror retrying it every cycle. Real covers all live under a
 * `/books/<stamp>l/<id>.<ext>` path, so only that shape is ever rewritten;
 * anything else is passed through untouched, and the bare placeholder loads
 * as-is.
 */
const GOODREADS_SIZED = /\._S[XY]\d+_\.(?:jpe?g|png|gif|webp)$/i;
const GOODREADS_BARE = /\.(?:jpe?g|png|gif|webp)$/i;
const GOODREADS_COVER_PATH = /\/books\//;

function goodreadsCover(value: unknown): string | undefined {
  const src = textOf(value);
  if (!src) return undefined;
  if (!GOODREADS_COVER_PATH.test(src) || GOODREADS_SIZED.test(src)) return src;
  return src.replace(GOODREADS_BARE, "._SX318_$&");
}

/**
 * Goodreads publishes every fact twice: once as its own element and once
 * folded into an HTML description ("author: …", "rating: …"). The elements are
 * read; the description is furniture and is never parsed. The `read` shelf
 * is the default; pass `"currently-reading"` for the open books, which the
 * feed itself does not label.
 */
export function fromGoodreadsRss(
  xml: string,
  shelf: GoodreadsShelf = "read",
): MediaItem[] {
  try {
    const candidates = rssItems(xml).map((item) => {
      const title = textOf(item.title) ?? "";
      const link = textOf(item.link);
      const cover = goodreadsCover(item.book_large_image_url);
      return {
        id: `goodreads:${textOf(item.book_id) ?? textOf(item.guid) ?? link ?? title}`,
        source: "goodreads",
        kind: "book",
        title,
        url: link,
        author: textOf(item.author_name),
        excerpt: goodreadsReview(item.user_review),
        publishedAt: isoDate(item.pubDate),
        readAt: isoDate(item.user_read_at),
        rating: bookRating(item.user_rating),
        year: bookYear(item.book_published),
        isReading: shelf === "currently-reading",
        image: cover ? { src: cover, alt: `Cover of ${title}` } : undefined,
      };
    });
    return validateItems(candidates);
  } catch {
    return [];
  }
}

export function fromSubstackRss(xml: string): MediaItem[] {
  try {
    const candidates = rssItems(xml).map((item) => {
      const title = textOf(item.title) ?? "";
      const link = textOf(item.link);
      const guid = textOf(item.guid);
      const html = textOf(item.description);
      const excerpt = html ? truncate(stripHtml(html), 280) : undefined;
      const enclosure = asRecord(item.enclosure);
      const enclosureType = textOf(enclosure?.["@_type"]);
      const enclosureSrc =
        enclosureType === undefined || enclosureType.startsWith("image/")
          ? textOf(enclosure?.["@_url"])
          : undefined;
      const imageSrc =
        enclosureSrc ?? textOf(asRecord(item["itunes:image"])?.["@_href"]);
      return {
        id: `substack:${guid ?? link ?? title}`,
        source: "substack",
        kind: "article",
        title,
        url: link,
        excerpt: excerpt || undefined,
        author: textOf(item["dc:creator"]),
        publishedAt: isoDate(item.pubDate),
        image: imageSrc
          ? { src: imageSrc, alt: `Cover image for ${title}` }
          : undefined,
      };
    });
    return validateItems(candidates);
  } catch {
    return [];
  }
}

/** Normalize the JSON body of X API v2 `GET /2/users/:id/tweets`. */
export function fromXApi(json: unknown): MediaItem[] {
  try {
    const data = asRecord(json)?.data;
    const candidates = toArray(data).flatMap((entry) => {
      const record = asRecord(entry);
      const id = textOf(record?.id);
      const text = textOf(record?.text)?.trim();
      if (!record || !id || !text) return [];
      const copy = splitPostCopy(text);
      return [
        {
          id: `x:${id}`,
          source: "x",
          kind: "post",
          ...copy,
          url: `https://x.com/alan_tai1/status/${id}`,
          author: "@alan_tai1",
          publishedAt: isoDate(record.created_at),
        },
      ];
    });
    return validateItems(candidates);
  } catch {
    return [];
  }
}

/**
 * Normalize AnyAPI's `twitter.user_posts` body (`POST /v1/run/…`), whose
 * timeline sits at `output.data.tweets`. Accepts the full response envelope or
 * a bare `output`. The byline is read back out of each post's canonical URL
 * rather than assumed; `fallbackHandle` only covers a record that arrives
 * without one.
 */
export function fromAnyApiX(
  json: unknown,
  fallbackHandle?: string,
): MediaItem[] {
  try {
    const envelope = asRecord(json);
    const output = asRecord(envelope?.output) ?? envelope;
    const candidates = toArray(asRecord(output?.data)?.tweets).flatMap(
      (entry) => {
        const record = asRecord(entry);
        const id = textOf(record?.id);
        const raw = textOf(record?.text);
        if (!record || !id || !raw) return [];
        const text = postText(raw.replace(TRAILING_TCO, ""));
        // A media-only post has no copy left once the furniture is gone, and
        // a repost is not ours to print under this byline.
        if (!text || RETWEET_PREFIX.test(text)) return [];
        const url = textOf(record.url);
        const handle = handleFromStatusUrl(url) ?? fallbackHandle;
        return [
          {
            id: `x:${id}`,
            source: "x",
            kind: "post",
            ...splitPostCopy(text),
            url:
              url ??
              (handle ? `https://x.com/${handle}/status/${id}` : undefined),
            author: handle ? `@${handle}` : undefined,
            publishedAt: epochSecondsToIso(record.createdUtc),
          },
        ];
      },
    );
    return validateItems(candidates);
  } catch {
    return [];
  }
}

/**
 * Normalize AnyAPI's `linkedin.profile_posts_full` body, whose posts sit at
 * `output.data.items`. Only the author's own `text` is ever read: a quote post
 * also carries `repostText`, which belongs to whoever was quoted and must
 * never be printed as this author's copy.
 */
export function fromAnyApiLinkedIn(json: unknown): MediaItem[] {
  try {
    const envelope = asRecord(json);
    const output = asRecord(envelope?.output) ?? envelope;
    const candidates = toArray(asRecord(output?.data)?.items).flatMap(
      (entry) => {
        const record = asRecord(entry);
        const id = textOf(record?.id);
        const raw = textOf(record?.text);
        // A bare repost carries no copy of its own; only the quoted author's.
        if (!record || !id || !raw) return [];
        const text = postText(raw);
        if (!text) return [];
        const author = asRecord(record.author);
        const copy = splitPostCopy(text);
        return [
          {
            id: `linkedin:${id}`,
            source: "linkedin",
            kind: "post",
            ...copy,
            url: textOf(record.url),
            author: textOf(author?.name) ?? textOf(author?.handle),
            publishedAt: epochSecondsToIso(record.createdUtc),
            image: postImage(record.images, record.videoThumbnail, copy.title),
          },
        ];
      },
    );
    return validateItems(candidates);
  } catch {
    return [];
  }
}

/**
 * Pull a post's attached media out of X's public syndication payload — the
 * same one embedded tweets read.
 *
 * No AnyAPI X SKU returns media URLs at all: `twitter.user_posts`,
 * `twitter.user_tweets` and `twitter.tweet` were each checked against a post
 * that demonstrably has a photo, and none of them carry a media field. This
 * endpoint needs no key and no credential — the `token` is derived from the
 * post id — so it stays the one way to give an X post its picture.
 */
export function xMediaFromSyndication(
  json: unknown,
  title: string,
): MediaItem["image"] | undefined {
  const first = asRecord(toArray(asRecord(json)?.mediaDetails)[0]);
  const info = asRecord(first?.original_info);
  return plateImage(
    textOf(first?.media_url_https),
    numOf(info?.width),
    numOf(info?.height),
    title,
  );
}
