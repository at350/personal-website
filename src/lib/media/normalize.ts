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

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&(?:nbsp|#160);/g, " ")
    .replace(/&(?:mdash|#8212);/g, "—")
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

function rssItems(xml: string): XmlNode[] {
  const parser = new XMLParser({ ignoreAttributes: false });
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
