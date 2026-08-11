import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import { MEDIA_SEED, RECENT_X_FALLBACKS } from "./seed";
import {
  MediaApiResponseSchema,
  MediaItemSchema,
  type MediaApiResponse,
  type MediaFeedReport,
  type MediaItem,
} from "./types";

const FETCH_TIMEOUT_MS = 3_500;
const MAX_FEED_BYTES = 750_000;
const MAX_FEED_ITEMS = 32;
const MAX_LIBRARY_ITEMS = 100;

type UnknownRecord = Record<string, unknown>;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  trimValues: true,
});

const XResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        created_at: z.string().optional(),
        note_tweet: z.object({ text: z.string() }).optional(),
      })
    )
    .optional(),
});

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function localName(value: string): string {
  return value.toLowerCase().split(":").at(-1) ?? value.toLowerCase();
}

function named(record: UnknownRecord | undefined, names: string[]): unknown {
  if (!record) return undefined;

  for (const name of names) {
    if (name in record) return record[name];
  }

  for (const name of names) {
    const wanted = localName(name);
    const match = Object.entries(record).find(([key]) => localName(key) === wanted);
    if (match) return match[1];
  }

  return undefined;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = textValue(entry);
      if (text) return text;
    }
    return undefined;
  }

  const record = asRecord(value);
  if (!record) return undefined;
  return textValue(record["#text"] ?? record["__cdata"]);
}

function decodeEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi,
    (entity, code: string) => {
      if (code[0] !== "#") return namedEntities[code.toLowerCase()] ?? entity;

      const hex = code[1]?.toLowerCase() === "x";
      const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(point) || point < 0 || point > 0x10ffff) return "";

      try {
        return String.fromCodePoint(point);
      } catch {
        return "";
      }
    }
  );
}

function truncateAtWord(value: string, maxLength: number): string {
  const characters = Array.from(value);
  if (characters.length <= maxLength) return value;

  const clipped = characters.slice(0, Math.max(1, maxLength - 1)).join("");
  const lastSpace = clipped.lastIndexOf(" ");
  const end = lastSpace > maxLength * 0.65 ? clipped.slice(0, lastSpace) : clipped;
  return `${end.trimEnd()}…`;
}

/** Converts untrusted feed HTML into bounded plain text for JSON consumers. */
export function toSafePlainText(value: unknown, maxLength = 500): string {
  if (typeof value !== "string") return "";

  // Decode twice because some feeds entity-encode an already encoded excerpt.
  let text = decodeEntities(decodeEntities(value));
  text = text
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\p{Cc}/gu, " ")
    .replace(/[\u200b-\u200d\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

  return truncateAtWord(text, maxLength);
}

function safeHttpUrl(value: unknown): string | undefined {
  const text = toSafePlainText(textValue(value), 2_048);
  if (!text) return undefined;

  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function safeFeedUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = safeHttpUrl(value);
  if (!url) return undefined;

  return new URL(url).protocol === "https:" ? url : undefined;
}

function attribute(record: UnknownRecord | undefined, name: string): unknown {
  return record?.[`@_${name}`] ?? record?.[name];
}

function extractLink(value: unknown): string | undefined {
  for (const candidate of asArray(value)) {
    const record = asRecord(candidate);
    if (record) {
      const rel = toSafePlainText(textValue(attribute(record, "rel")), 40);
      const href = safeHttpUrl(attribute(record, "href") ?? attribute(record, "url"));
      if (href && (!rel || rel === "alternate")) return href;
    }

    const text = safeHttpUrl(candidate);
    if (text) return text;
  }

  return undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const number = Number.parseInt(textValue(value) ?? "", 10);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function extractHtmlImage(value: unknown): string | undefined {
  const html = decodeEntities(decodeEntities(textValue(value) ?? ""));
  const match = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  return safeHttpUrl(match?.[1]);
}

function extractImage(record: UnknownRecord, title: string): MediaItem["image"] {
  const media =
    named(record, ["media:thumbnail"]) ??
    named(record, ["media:content"]) ??
    named(record, ["enclosure"]);

  for (const candidate of asArray(media)) {
    const mediaRecord = asRecord(candidate);
    const type = toSafePlainText(textValue(attribute(mediaRecord, "type")), 80);
    const src = safeHttpUrl(
      attribute(mediaRecord, "url") ?? attribute(mediaRecord, "href") ?? candidate
    );
    if (!src || (type && !type.startsWith("image/"))) continue;

    return {
      src,
      alt: `Image for ${title}`,
      width: positiveInteger(attribute(mediaRecord, "width")),
      height: positiveInteger(attribute(mediaRecord, "height")),
    };
  }

  const body = named(record, ["content:encoded", "description", "summary", "content"]);
  const src = extractHtmlImage(body);
  return src ? { src, alt: `Image for ${title}` } : undefined;
}

function isoDate(value: unknown): string | undefined {
  const text = textValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function uniqueTags(values: unknown[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const value of values.flatMap(asArray)) {
    const tag = toSafePlainText(textValue(value), 48);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === 12) break;
  }

  return tags;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function feedEntries(xml: string): UnknownRecord[] {
  const document = asRecord(xmlParser.parse(xml));
  if (!document) return [];

  const rss = asRecord(named(document, ["rss"]));
  const channel = asRecord(named(rss, ["channel"]));
  const atom = asRecord(named(document, ["feed"]));
  const rdf = asRecord(named(document, ["rdf:RDF", "RDF"]));
  const rawEntries =
    named(channel, ["item"]) ?? named(atom, ["entry"]) ?? named(rdf, ["item"]);

  return asArray(rawEntries)
    .map(asRecord)
    .filter((entry): entry is UnknownRecord => Boolean(entry))
    .slice(0, MAX_FEED_ITEMS);
}

function feedAuthor(record: UnknownRecord): string | undefined {
  const raw = named(record, ["dc:creator", "creator", "author"]);
  const authorRecord = asRecord(raw);
  return (
    toSafePlainText(textValue(named(authorRecord, ["name"])), 120) ||
    toSafePlainText(textValue(raw), 120) ||
    undefined
  );
}

export function parseLetterboxdFeed(xml: string): MediaItem[] {
  return feedEntries(xml).flatMap((entry) => {
    const fallbackTitle = toSafePlainText(textValue(named(entry, ["title"])), 200);
    const filmTitle =
      toSafePlainText(textValue(named(entry, ["letterboxd:filmTitle"])), 200) ||
      fallbackTitle;
    const url = extractLink(named(entry, ["link"]));
    if (!filmTitle || !url) return [];

    const rawYear = positiveInteger(named(entry, ["letterboxd:filmYear"]));
    const year = rawYear && rawYear >= 1888 && rawYear <= 2200 ? rawYear : undefined;
    const rawRating = Number.parseFloat(
      textValue(named(entry, ["letterboxd:memberRating"])) ?? ""
    );
    const rating =
      Number.isFinite(rawRating) && rawRating >= 0 && rawRating <= 5
        ? rawRating
        : undefined;
    const body = named(entry, ["description", "content:encoded", "summary"]);
    const excerpt = toSafePlainText(textValue(body), 500);
    const identity = textValue(named(entry, ["guid", "id"])) ?? url;

    const parsed = MediaItemSchema.safeParse({
      id: `letterboxd:${stableHash(identity)}`,
      source: "letterboxd",
      kind: "film",
      title: filmTitle,
      excerpt: excerpt || undefined,
      url,
      author: feedAuthor(entry),
      publishedAt: isoDate(named(entry, ["pubDate", "published", "updated"])),
      image: extractImage(entry, filmTitle),
      tags: uniqueTags(["Film", named(entry, ["category"])]),
      rating,
      year,
    });

    return parsed.success ? [parsed.data] : [];
  });
}

export function parseSubstackFeed(xml: string): MediaItem[] {
  return feedEntries(xml).flatMap((entry) => {
    const title = toSafePlainText(textValue(named(entry, ["title"])), 200);
    const url = extractLink(named(entry, ["link"]));
    if (!title || !url) return [];

    const body = named(entry, ["content:encoded", "description", "summary", "content"]);
    const excerpt = toSafePlainText(textValue(body), 500);
    const identity = textValue(named(entry, ["guid", "id"])) ?? url;
    const parsed = MediaItemSchema.safeParse({
      id: `substack:${stableHash(identity)}`,
      source: "substack",
      kind: "article",
      title,
      excerpt: excerpt || undefined,
      url,
      author: feedAuthor(entry),
      publishedAt: isoDate(named(entry, ["pubDate", "published", "updated"])),
      image: extractImage(entry, title),
      tags: uniqueTags(["Writing", named(entry, ["category"])]),
    });

    return parsed.success ? [parsed.data] : [];
  });
}

async function fetchBoundedText(
  url: string,
  init: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Upstream responded with ${response.status}`);

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
      throw new Error("Upstream response is too large");
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_FEED_BYTES) {
      throw new Error("Upstream response is too large");
    }
    return new TextDecoder().decode(bytes);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFeed(
  url: string,
  parser: (xml: string) => MediaItem[]
): Promise<MediaItem[]> {
  const xml = await fetchBoundedText(url, {
    headers: {
      accept: "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9",
    },
  });
  const items = parser(xml);
  if (items.length === 0) throw new Error("Feed contained no usable items");
  return items;
}

async function fetchXPosts(token: string, userId: string): Promise<MediaItem[]> {
  if (!/^\d+$/.test(userId)) throw new Error("X_USER_ID must be numeric");

  const query = new URLSearchParams({
    max_results: "10",
    exclude: "retweets,replies",
    "tweet.fields": "created_at,note_tweet",
  });
  const body = await fetchBoundedText(
    `https://api.x.com/2/users/${encodeURIComponent(userId)}/tweets?${query}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    }
  );
  const response = XResponseSchema.parse(JSON.parse(body));

  return (response.data ?? []).flatMap((post) => {
    const excerpt = toSafePlainText(post.note_tweet?.text ?? post.text, 500);
    if (!excerpt) return [];

    const parsed = MediaItemSchema.safeParse({
      id: `x:${post.id}`,
      source: "x",
      kind: "post",
      title: truncateAtWord(excerpt, 96),
      excerpt,
      url: `https://x.com/alan_tai1/status/${post.id}`,
      author: "@alan_tai1",
      publishedAt: isoDate(post.created_at),
      tags: ["X"],
    });
    return parsed.success ? [parsed.data] : [];
  });
}

function canonicalUrl(value: string | undefined): string | undefined {
  if (!value || value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    const status = url.pathname.match(/\/status\/(\d+)/);
    if (status && /(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(url.hostname)) {
      return `x:status:${status[1]}`;
    }

    url.hash = "";
    for (const parameter of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(parameter)) url.searchParams.delete(parameter);
    }
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString();
  } catch {
    return undefined;
  }
}

function mergeLiveOverFallback(fallback: MediaItem, live: MediaItem): MediaItem {
  const tags = uniqueTags([...fallback.tags, ...live.tags]);
  const relatedLinks = fallback.relatedLinks.length
    ? fallback.relatedLinks
    : live.relatedLinks;

  return MediaItemSchema.parse({
    ...fallback,
    ...live,
    title: fallback.title,
    tags,
    relatedLinks,
    isFallback: false,
  });
}

export function dedupeMediaItems(items: MediaItem[]): MediaItem[] {
  const result: MediaItem[] = [];
  const keyToIndex = new Map<string, number>();

  for (const candidate of items) {
    const externalUrl =
      candidate.url && !candidate.url.startsWith("/")
        ? canonicalUrl(candidate.url)
        : undefined;
    const keys = [
      `id:${candidate.id}`,
      externalUrl ? `url:${externalUrl}` : undefined,
    ].filter((key): key is string => Boolean(key));
    const existingIndex = keys
      .map((key) => keyToIndex.get(key))
      .find((index): index is number => index !== undefined);

    if (existingIndex === undefined) {
      const index = result.push(candidate) - 1;
      for (const key of keys) keyToIndex.set(key, index);
      continue;
    }

    const existing = result[existingIndex];
    if (existing.isFallback && !candidate.isFallback) {
      result[existingIndex] = mergeLiveOverFallback(existing, candidate);
    }
    for (const key of keys) keyToIndex.set(key, existingIndex);
  }

  return result;
}

function byPublishedDate(left: MediaItem, right: MediaItem): number {
  if (!left.publishedAt && !right.publishedAt) return 0;
  if (!left.publishedAt) return 1;
  if (!right.publishedAt) return -1;
  return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
}

interface SourceResult {
  items: MediaItem[];
  report: MediaFeedReport;
  warning?: string;
  failed: boolean;
}

async function optionalFeed(
  rawUrl: string | undefined,
  label: string,
  parser: (xml: string) => MediaItem[]
): Promise<SourceResult> {
  if (!rawUrl) {
    return {
      items: [],
      report: { state: "disabled", itemCount: 0 },
      failed: false,
    };
  }

  const url = safeFeedUrl(rawUrl);
  if (!url) {
    return {
      items: [],
      report: { state: "unavailable", itemCount: 0 },
      warning: `${label} feed is misconfigured; saved items are still available.`,
      failed: true,
    };
  }

  try {
    const items = await fetchFeed(url, parser);
    return {
      items,
      report: { state: "live", itemCount: items.length },
      failed: false,
    };
  } catch {
    return {
      items: [],
      report: { state: "unavailable", itemCount: 0 },
      warning: `${label} feed is temporarily unavailable; saved items are still available.`,
      failed: true,
    };
  }
}

async function optionalXFeed(
  token: string | undefined,
  userId: string | undefined
): Promise<SourceResult> {
  const fallbackCount = RECENT_X_FALLBACKS.length;
  if (!token && !userId) {
    return {
      items: [],
      report: { state: "fallback", itemCount: fallbackCount },
      failed: false,
    };
  }
  if (!token || !userId) {
    return {
      items: [],
      report: { state: "fallback", itemCount: fallbackCount },
      warning: "X is partially configured; showing verified saved posts.",
      failed: true,
    };
  }

  try {
    const items = await fetchXPosts(token, userId);
    return {
      items,
      report: { state: "live", itemCount: items.length },
      failed: false,
    };
  } catch {
    return {
      items: [],
      report: { state: "fallback", itemCount: fallbackCount },
      warning: "X is temporarily unavailable; showing verified saved posts.",
      failed: true,
    };
  }
}

export async function getMediaLibrary(
  environment: NodeJS.ProcessEnv = process.env
): Promise<MediaApiResponse> {
  const [x, letterboxd, substack] = await Promise.all([
    optionalXFeed(environment.X_BEARER_TOKEN, environment.X_USER_ID),
    optionalFeed(
      environment.LETTERBOXD_RSS_URL,
      "Letterboxd",
      parseLetterboxdFeed
    ),
    optionalFeed(environment.SUBSTACK_RSS_URL, "Substack", parseSubstackFeed),
  ]);

  const items = dedupeMediaItems([
    ...MEDIA_SEED,
    ...x.items,
    ...letterboxd.items,
    ...substack.items,
  ])
    .sort(byPublishedDate)
    .slice(0, MAX_LIBRARY_ITEMS);
  const results = [x, letterboxd, substack];

  return MediaApiResponseSchema.parse({
    items,
    generatedAt: new Date().toISOString(),
    degraded: results.some((result) => result.failed),
    feeds: {
      x: x.report,
      letterboxd: letterboxd.report,
      substack: substack.report,
    },
    warnings: results.flatMap((result) =>
      result.warning ? [result.warning] : []
    ),
  });
}
