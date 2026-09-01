// Refreshes the build-time media snapshot at src/lib/media/live.json.
//
// For each configured feed it fetches, normalizes, and collects items; the
// snapshot is rewritten only when at least one feed succeeded, so a bad cron
// run can never blank the library. A feed that fails — or answers with no
// usable items — keeps whatever it contributed to the previous snapshot, so
// one source going dark never deletes another source's history. The site
// merges this snapshot with the hand-verified seed at load time (seed wins on
// id collisions — see src/lib/media/store.ts). Always exits 0 (cron-safe).
//
// NOTE: the tiny normalizers below INTENTIONALLY duplicate the logic in
// src/lib/media/normalize.ts. That module is the source of truth for the app,
// but it is TypeScript and this script must run under plain `node` (20+)
// with no build step or loader. If you change one, change both.
//
// Env (every feed is optional; unconfigured feeds are skipped):
//   LETTERBOXD_USER            letterboxd username -> https://letterboxd.com/<user>/rss/
//                              defaults to DEFAULT_LETTERBOXD_USER below, so
//                              `npm run refresh-media` works with no env at all
//   GOODREADS_USER_ID          numeric goodreads user id -> the "read" and
//                              "currently-reading" shelf feeds (free RSS);
//                              defaults to DEFAULT_GOODREADS_USER_ID below
//   SUBSTACK_RSS_URL           full substack feed url
//   ANYAPI_KEY                 anyapi.com key -> recent X posts AND linkedin
//                              posts (preferred; one key serves both)
//   X_HANDLE                   X handle for the anyapi lookup, no leading @;
//                              defaults to DEFAULT_X_HANDLE below
//   LINKEDIN_PROFILE_URL       full public linkedin profile url;
//                              defaults to DEFAULT_LINKEDIN_URL below
//   ANYAPI_ALWAYS=1            fetch the paid X and linkedin lanes even when
//                              they are not due (they refresh twice a week)
//   X_BEARER_TOKEN + X_USER_ID X API v2 recent posts (fallback, only used
//                              when ANYAPI_KEY is absent)

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { XMLParser } from "fast-xml-parser";

const LIVE_JSON_URL = new URL("../src/lib/media/live.json", import.meta.url);
const THUMBS_DIR_URL = new URL("../public/media/thumbs/", import.meta.url);
const THUMBS_PUBLIC_PATH = "/media/thumbs/";
const FETCH_TIMEOUT_MS = 10_000;
// AnyAPI proxies a live scrape rather than serving a cached file: its
// published p99 for this SKU is ~9.8s, which the shared 10s budget would clip
// into a spurious failure most nights. Give that one call room.
const ANYAPI_RUN_URL = "https://api.getanyapi.com/v1/run/twitter.user_posts";
const ANYAPI_LINKEDIN_URL =
  "https://api.getanyapi.com/v1/run/linkedin.profile_posts_full";
const ANYAPI_TIMEOUT_MS = 20_000;

// X's public syndication payload, the only place a post's attached media is
// exposed (see xMediaFromSyndication). One quick request per post, so it gets
// a short leash; the enrichment gives up entirely after a few misses, which
// is what a blocked or reshaped endpoint looks like.
const X_SYNDICATION_URL = "https://cdn.syndication.twimg.com/tweet-result";
const X_SYNDICATION_TIMEOUT_MS = 6_000;
const X_SYNDICATION_GIVE_UP_AFTER = 3;

const LINKEDIN_POST_LIMIT = 10;

// Both AnyAPI lanes cost money per call — X a flat $0.00075, LinkedIn ~$0.0195
// for ten posts because it bills per post returned — while letterboxd's RSS is
// free. Neither social feed changes more than a few times a week, so refetching
// them on all twelve of the day's cycles would spend ~$7/month re-reading
// identical data. They refresh twice a week instead and carry their items
// forward on every other cycle. The cron fires at :17 on even UTC hours
// (17 */2 * * *), so the hour below must be even for this to ever come due.
const ANYAPI_REFRESH_UTC_DAYS = new Set([1, 4]); // Monday and Thursday
const ANYAPI_REFRESH_UTC_HOUR = 6;

/**
 * Whether the paid AnyAPI lanes should actually fetch on this cycle.
 * ANYAPI_ALWAYS=1 forces one, which is what a manual run wants.
 */
function anyapiDue(env, now = new Date()) {
  if (env.ANYAPI_ALWAYS === "1") return true;
  return (
    ANYAPI_REFRESH_UTC_DAYS.has(now.getUTCDay()) &&
    now.getUTCHours() === ANYAPI_REFRESH_UTC_HOUR
  );
}

// This site's own letterboxd account. A username is public, so it belongs in
// the repo rather than in a secret: the film log then keeps refreshing without
// any configuration at all. LETTERBOXD_USER overrides it (say, on a fork).
const DEFAULT_LETTERBOXD_USER = "alantai";

// Same reasoning for the goodreads account: the numeric id is in every public
// profile URL, so the bookshelf keeps refreshing with no configuration at
// all. GOODREADS_USER_ID overrides it. Both shelves are read: finished books
// carry a finish date, open ones carry the READING mark.
const DEFAULT_GOODREADS_USER_ID = "169946288";
const GOODREADS_SHELVES = ["read", "currently-reading"];

// Same reasoning for the X handle: it is public, so baking it in keeps the
// posts flowing with only ANYAPI_KEY set. X_HANDLE overrides it.
const DEFAULT_X_HANDLE = "alan_tai1";

// Public profile, same reasoning as the two above.
const DEFAULT_LINKEDIN_URL = "https://www.linkedin.com/in/alan-tai-nu/";

// --- minimal helpers (mirror src/lib/media/normalize.ts) --------------------

const asRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : undefined;

const toArray = (value) =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];

function textOf(value) {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const record = asRecord(value);
  if (record && "#text" in record) return textOf(record["#text"]);
  return undefined;
}

function numOf(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const text = textOf(value);
  if (text === undefined) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isoDate(value) {
  const text = textOf(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function firstImgSrc(html) {
  if (!html) return undefined;
  const match = /<img[^>]*\ssrc=["']([^"']+)["']/i.exec(html);
  return match?.[1];
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&(?:nbsp|#160);/g, " ")
    .replace(/&(?:mdash|#8212);/g, "—");
}

function stripHtml(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const truncate = (text, max) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

function splitPostCopy(text) {
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

// AnyAPI timestamps a post as a UTC epoch in *seconds*; isoDate cannot read
// that (`new Date("1787071196")` is not a date), so it needs its own
// converter or every post silently loses publishedAt.
function epochSecondsToIso(value) {
  const seconds = typeof value === "number" ? value : Number(textOf(value));
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const X_STATUS_URL =
  /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/\d+/i;

function handleFromStatusUrl(url) {
  return url ? X_STATUS_URL.exec(url)?.[1] : undefined;
}

// X — and only X — appends a t.co shortlink for any attached photo, video, or
// quoted post; it is furniture, not copy. Applied at the X call site, never to
// LinkedIn copy, where a trailing shortlink is something the author typed.
const TRAILING_TCO = /(?:\s*https?:\/\/t\.co\/[A-Za-z0-9]+)+\s*$/i;

// A repost is someone else's words under our byline.
const RETWEET_PREFIX = /^RT @[A-Za-z0-9_]{1,15}:/;

function postText(raw) {
  return decodeEntities(raw).replace(/\s+/g, " ").trim();
}

// Only pass dimensions the schema will actually accept.
function isPositiveInt(value) {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

// One plate image, with only the dimensions the schema will accept.
function plateImage(src, width, height, title) {
  if (!src) return undefined;
  return {
    src,
    alt: truncate(`Image from the post “${title}”`, 240),
    width: isPositiveInt(width) ? width : undefined,
    height: isPositiveInt(height) ? height : undefined,
  };
}

// First usable still from a post: an attached image, else a video poster.
function postImage(images, videoThumbnail, title) {
  const first = asRecord(toArray(images)[0]);
  return plateImage(
    textOf(first?.url) ?? textOf(videoThumbnail),
    numOf(first?.width),
    numOf(first?.height),
    title,
  );
}

// See the long note in src/lib/media/normalize.ts: no AnyAPI X SKU returns
// media URLs, so a post's picture can only come from X's public syndication
// payload. No key involved; the token is derived from the post id.
function xMediaFromSyndication(json, title) {
  const first = asRecord(toArray(asRecord(json)?.mediaDetails)[0]);
  const info = asRecord(first?.original_info);
  return plateImage(
    textOf(first?.media_url_https),
    numOf(info?.width),
    numOf(info?.height),
    title,
  );
}

// htmlEntities: letterboxd writes apostrophes as numeric character
// references (`Don&#039;t`), which only decode under this option.
const rssParser = () =>
  new XMLParser({ ignoreAttributes: false, htmlEntities: true });

function rssItems(xml) {
  const doc = asRecord(rssParser().parse(xml));
  const channel = asRecord(asRecord(doc?.rss)?.channel);
  return toArray(channel?.item).flatMap((entry) => {
    const record = asRecord(entry);
    return record ? [record] : [];
  });
}

/**
 * Whether a body is an RSS document at all: an `<rss>` root with a
 * `<channel>` inside it, items or no items. A shelf with nothing on it is
 * still a feed and still passes; an HTML interstitial, a login page, or a
 * JSON error served with a 200 is not, and fails. Parse errors count as
 * "not a feed" rather than throwing, so the caller decides what a bad body
 * means.
 */
function isRssDocument(xml) {
  if (typeof xml !== "string") return false;
  try {
    const rss = asRecord(asRecord(rssParser().parse(xml))?.rss);
    return rss !== undefined && "channel" in rss;
  } catch {
    return false;
  }
}

/**
 * Hand the body back if it is a feed; throw if it is not. The per-feed
 * "0 usable items is a failure" guard only sees a lane's combined result,
 * and a lane made of several fetches — the two Goodreads shelves — can have
 * one of them answer 200 with a page that parses to nothing while the other
 * still delivers. Flattened together that reads as success, the vanished
 * shelf's books leave the snapshot, and the thumbnail prune deletes their
 * covers. Throwing here turns that into the lane failure it is, so
 * carry-forward keeps both shelves.
 */
function assertRssBody(xml, label) {
  if (!isRssDocument(xml)) {
    throw new Error(`${label}: body is not an RSS document`);
  }
  return xml;
}

/** Light validity gate; the app re-validates every item with zod on load. */
const isUsable = (item) =>
  typeof item.id === "string" &&
  item.id.length > 0 &&
  typeof item.title === "string" &&
  item.title.length > 0;

// --- minimal normalizers (mirror src/lib/media/normalize.ts) ----------------

const LETTERBOXD_DIARY_LINE = /^(?:re)?watched on\b/iu;

function letterboxdReview(html) {
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

function starsToRating(stars) {
  if (!stars) return undefined;
  let rating = 0;
  for (const glyph of stars) {
    if (glyph === "★") rating += 1;
    if (glyph === "½") rating += 0.5;
  }
  return rating > 0 ? rating : undefined;
}

function fromLetterboxdRss(xml) {
  return rssItems(xml)
    .map((item) => {
      const groups = LETTERBOXD_TITLE.exec(textOf(item.title) ?? "")?.groups;
      const title =
        textOf(item["letterboxd:filmTitle"]) ??
        groups?.title?.trim() ??
        textOf(item.title) ??
        "";
      const link = textOf(item.link);
      const description = textOf(item.description);
      const poster = firstImgSrc(description);
      // Undefined keys drop out of JSON.stringify, keeping the snapshot terse.
      const rewatch =
        textOf(item["letterboxd:rewatch"])?.toLowerCase() === "yes" || undefined;
      return {
        id: `letterboxd:${textOf(item.guid) ?? link ?? title}`,
        source: "letterboxd",
        kind: "film",
        title,
        url: link,
        excerpt: letterboxdReview(description),
        publishedAt: isoDate(item.pubDate),
        watchedAt: isoDate(item["letterboxd:watchedDate"]),
        year:
          numOf(item["letterboxd:filmYear"]) ??
          (groups?.year ? Number(groups.year) : undefined),
        rating:
          numOf(item["letterboxd:memberRating"]) ?? starsToRating(groups?.stars),
        isRewatch: rewatch,
        image: poster
          ? { src: poster, alt: `Poster for ${title}` }
          : undefined,
      };
    })
    .filter(isUsable);
}

// Goodreads writes 0 where a book was shelved unrated; zero stars is not a
// verdict, so it never reaches the plate.
function bookRating(value) {
  const rating = numOf(value);
  return rating !== undefined && rating > 0 ? rating : undefined;
}

// `book_published` is the first edition's year, negative for a classical text
// (Gorgias arrives as -380). Mirrors MediaItemSchema's year range: a value
// outside it would sink the whole item on load rather than just the year.
function bookYear(value) {
  const year = numOf(value);
  return year !== undefined && Number.isInteger(year) && year >= 1888 && year <= 2200
    ? year
    : undefined;
}

// The member's own review, as written; Goodreads allows light HTML in it.
function goodreadsReview(value) {
  const text = textOf(value);
  if (!text) return undefined;
  const copy = stripHtml(text);
  return copy ? truncate(copy, 280) : undefined;
}

// A size suffix (._SX318_.jpg, ._SY475_.jpg) is what makes a Goodreads cover
// plate-sized; a bare URL is the full scan (2.5 MB where the sized twin is
// 32 KB), so a bare one is given the standard large width before it is
// fetched or mirrored. Only a real cover — the `/books/<stamp>l/<id>.<ext>`
// shape — can take the suffix: Goodreads' stock "nophoto" placeholder has no
// sized twin, and suffixing it yields a 404 the mirror would retry every
// cycle, so anything off that path passes through untouched. Mirrors
// normalize.ts.
const GOODREADS_SIZED = /\._S[XY]\d+_\.(?:jpe?g|png|gif|webp)$/i;
const GOODREADS_BARE = /\.(?:jpe?g|png|gif|webp)$/i;
const GOODREADS_COVER_PATH = /\/books\//;

function goodreadsCover(value) {
  const src = textOf(value);
  if (!src) return undefined;
  if (!GOODREADS_COVER_PATH.test(src) || GOODREADS_SIZED.test(src)) return src;
  return src.replace(GOODREADS_BARE, "._SX318_$&");
}

// Every fact arrives twice, as an element and folded into an HTML description;
// only the elements are read. The feed does not label its shelf, so the call
// site passes it and the currently-reading shelf becomes the READING mark.
function fromGoodreadsRss(xml, shelf = "read") {
  return rssItems(xml)
    .map((item) => {
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
        // Undefined keys drop out of JSON.stringify, keeping the snapshot terse.
        isReading: shelf === "currently-reading" || undefined,
        image: cover ? { src: cover, alt: `Cover of ${title}` } : undefined,
      };
    })
    .filter(isUsable);
}

function fromSubstackRss(xml) {
  return rssItems(xml)
    .map((item) => {
      const title = textOf(item.title) ?? "";
      const link = textOf(item.link);
      const html = textOf(item.description);
      const enclosure = asRecord(item.enclosure);
      const enclosureType = textOf(enclosure?.["@_type"]);
      const enclosureSrc =
        enclosureType === undefined || enclosureType.startsWith("image/")
          ? textOf(enclosure?.["@_url"])
          : undefined;
      const imageSrc =
        enclosureSrc ?? textOf(asRecord(item["itunes:image"])?.["@_href"]);
      return {
        id: `substack:${textOf(item.guid) ?? link ?? title}`,
        source: "substack",
        kind: "article",
        title,
        url: link,
        excerpt: html ? truncate(stripHtml(html), 280) || undefined : undefined,
        author: textOf(item["dc:creator"]),
        publishedAt: isoDate(item.pubDate),
        image: imageSrc
          ? { src: imageSrc, alt: `Cover image for ${title}` }
          : undefined,
      };
    })
    .filter(isUsable);
}

function fromXApi(json) {
  return toArray(asRecord(json)?.data)
    .flatMap((entry) => {
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
    })
    .filter(isUsable);
}

function fromAnyApiX(json, fallbackHandle) {
  const envelope = asRecord(json);
  const output = asRecord(envelope?.output) ?? envelope;
  return toArray(asRecord(output?.data)?.tweets)
    .flatMap((entry) => {
      const record = asRecord(entry);
      const id = textOf(record?.id);
      const raw = textOf(record?.text);
      if (!record || !id || !raw) return [];
      const text = postText(raw.replace(TRAILING_TCO, ""));
      // Media-only posts keep no copy once the furniture goes, and a repost
      // is not ours to print under this byline.
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
            url ?? (handle ? `https://x.com/${handle}/status/${id}` : undefined),
          author: handle ? `@${handle}` : undefined,
          publishedAt: epochSecondsToIso(record.createdUtc),
        },
      ];
    })
    .filter(isUsable);
}

function fromAnyApiLinkedIn(json) {
  const envelope = asRecord(json);
  const output = asRecord(envelope?.output) ?? envelope;
  return toArray(asRecord(output?.data)?.items)
    .flatMap((entry) => {
      const record = asRecord(entry);
      const id = textOf(record?.id);
      const raw = textOf(record?.text);
      // A bare repost carries no copy of its own, only the quoted author's —
      // which is never ours to print. Read `text`, never `repostText`.
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
    })
    .filter(isUsable);
}

// --- fetching ---------------------------------------------------------------

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function configuredFeeds(env) {
  const feeds = [];
  // `||`, not `??`: an unset repository secret arrives as an empty string.
  const letterboxdUser = env.LETTERBOXD_USER || DEFAULT_LETTERBOXD_USER;
  if (letterboxdUser) {
    const url = `https://letterboxd.com/${encodeURIComponent(letterboxdUser)}/rss/`;
    feeds.push({
      name: "letterboxd",
      run: async () => fromLetterboxdRss(await (await fetchWithTimeout(url)).text()),
    });
  }
  // Goodreads' shelf feeds are public RSS like letterboxd's, so the book lane
  // rides the same two-hourly cadence with no key and no due gate. One feed
  // covers both shelves: its name doubles as the `source` every book carries,
  // so a shelf that fails carries the whole lane forward instead of deleting
  // the other shelf's history. Each shelf body is checked for being a feed
  // before it is parsed, because a 200 that is not one would otherwise
  // flatten into the other shelf's books and pass as success.
  const goodreadsUserId = env.GOODREADS_USER_ID || DEFAULT_GOODREADS_USER_ID;
  if (goodreadsUserId) {
    const shelfUrl = (shelf) =>
      `https://www.goodreads.com/review/list_rss/` +
      `${encodeURIComponent(goodreadsUserId)}?shelf=${shelf}`;
    feeds.push({
      name: "goodreads",
      run: async () => {
        const shelves = await Promise.all(
          GOODREADS_SHELVES.map(async (shelf) =>
            fromGoodreadsRss(
              assertRssBody(
                await (await fetchWithTimeout(shelfUrl(shelf))).text(),
                `goodreads/${shelf}`,
              ),
              shelf,
            ),
          ),
        );
        return shelves.flat();
      },
    });
  }
  if (env.SUBSTACK_RSS_URL) {
    feeds.push({
      name: "substack",
      run: async () =>
        fromSubstackRss(await (await fetchWithTimeout(env.SUBSTACK_RSS_URL)).text()),
    });
  }
  // Exactly one feed may be named "x". The name doubles as the `source` its
  // items carry, and carry-forward reclaims a failed feed by matching that
  // name — so a second "x" would double-count every post and leave
  // carry-forward restoring the wrong half. AnyAPI wins where it is
  // configured; the direct (paid) X API stays reachable only without it.
  const xHandle = env.X_HANDLE || DEFAULT_X_HANDLE;
  if (env.ANYAPI_KEY && xHandle) {
    feeds.push({
      name: "x",
      due: anyapiDue(env),
      run: async () => {
        const response = await fetchWithTimeout(
          ANYAPI_RUN_URL,
          {
            method: "POST",
            headers: {
              // The key travels in the header only; it is never logged, and
              // the error path below prints the URL, not the request.
              Authorization: `Bearer ${env.ANYAPI_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ handle: xHandle }),
          },
          ANYAPI_TIMEOUT_MS,
        );
        const posts = fromAnyApiX(await response.json(), xHandle);
        const withMedia = await attachXMedia(posts);
        console.log(
          `refresh-media: x: ${withMedia} of ${posts.length} post(s) ` +
            "carry an image",
        );
        return posts;
      },
    });
  } else if (env.X_BEARER_TOKEN && env.X_USER_ID) {
    const url =
      `https://api.x.com/2/users/${encodeURIComponent(env.X_USER_ID)}` +
      `/tweets?max_results=25&tweet.fields=created_at`;
    feeds.push({
      name: "x",
      run: async () => {
        const response = await fetchWithTimeout(url, {
          headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` },
        });
        return fromXApi(await response.json());
      },
    });
  }
  // Reuses ANYAPI_KEY — no second credential.
  const linkedinUrl = env.LINKEDIN_PROFILE_URL || DEFAULT_LINKEDIN_URL;
  if (env.ANYAPI_KEY && linkedinUrl) {
    feeds.push({
      name: "linkedin",
      due: anyapiDue(env),
      run: async () => {
        const response = await fetchWithTimeout(
          ANYAPI_LINKEDIN_URL,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.ANYAPI_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: linkedinUrl,
              limit: LINKEDIN_POST_LIMIT,
              // A bare repost carries no copy of ours to print.
              includeReposts: false,
            }),
          },
          ANYAPI_TIMEOUT_MS,
        );
        return fromAnyApiLinkedIn(await response.json());
      },
    });
  }
  return feeds;
}

/** The token embedded tweets send. Derived from the id — not a credential. */
function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

/**
 * Give each X post its picture. Best-effort by design: a post without media,
 * a failed lookup, or a reshaped payload simply leaves `image` unset, and the
 * post itself is never dropped over it.
 */
async function attachXMedia(items) {
  let found = 0;
  let misses = 0;
  for (const item of items) {
    const id = item.id.slice(2);
    if (!/^\d+$/.test(id)) continue;
    if (misses >= X_SYNDICATION_GIVE_UP_AFTER) break;
    const url =
      `${X_SYNDICATION_URL}?id=${encodeURIComponent(id)}` +
      `&token=${syndicationToken(id)}&lang=en`;
    try {
      const response = await fetchWithTimeout(url, {}, X_SYNDICATION_TIMEOUT_MS);
      const image = xMediaFromSyndication(await response.json(), item.title);
      if (image) {
        item.image = image;
        found += 1;
      }
      misses = 0;
    } catch {
      misses += 1;
    }
  }
  if (misses >= X_SYNDICATION_GIVE_UP_AFTER) {
    console.warn(
      "refresh-media: x: syndication lookups kept failing; " +
        "posts keep their copy but lose their pictures this run",
    );
  }
  return found;
}

// --- thumbnail mirror -------------------------------------------------------
//
// Remote thumbnail hosts rarely send CORS headers (letterboxd's CDN sends
// none), and the book's capture farm must fetch image bytes to rasterize
// pages into turn textures. Mirroring thumbnails into public/ makes every
// image same-origin: the live wall, the captured textures, and the deployed
// site all read the same local file. Failures keep the remote URL — a broken
// mirror must never lose an item.

const THUMB_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

function thumbFileName(src) {
  const hash = createHash("sha1").update(src).digest("hex").slice(0, 12);
  let extension = ".jpg";
  try {
    const match = /\.[a-z0-9]+$/i.exec(new URL(src).pathname);
    if (match && THUMB_EXTENSIONS.has(match[0].toLowerCase())) {
      extension = match[0].toLowerCase();
    }
  } catch {
    /* keep default */
  }
  return `${hash}${extension}`;
}

async function mirrorThumbnails(items) {
  const remote = items.filter((item) => /^https?:\/\//.test(item.image?.src ?? ""));
  if (remote.length === 0) return { mirrored: 0, kept: 0 };
  await mkdir(THUMBS_DIR_URL, { recursive: true });

  let mirrored = 0;
  for (const item of remote) {
    const source = item.image.src;
    const fileName = thumbFileName(source);
    try {
      const response = await fetchWithTimeout(source);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) throw new Error("empty body");
      await writeFile(new URL(fileName, THUMBS_DIR_URL), bytes);
      item.image.src = `${THUMBS_PUBLIC_PATH}${fileName}`;
      mirrored += 1;
    } catch (error) {
      console.warn(
        `refresh-media: thumb mirror failed for ${source} ` +
          `(${error?.message ?? error}); keeping remote URL.`,
      );
    }
  }

  // Prune only files nothing in the new snapshot points at. This reads the
  // final srcs rather than just this run's downloads, because an item carried
  // forward from the previous snapshot already holds a local path and must
  // keep the file behind it.
  const wanted = new Set(
    items
      .map((item) => item.image?.src ?? "")
      .filter((src) => src.startsWith(THUMBS_PUBLIC_PATH))
      .map((src) => src.slice(THUMBS_PUBLIC_PATH.length)),
  );
  try {
    for (const file of await readdir(THUMBS_DIR_URL)) {
      if (!wanted.has(file)) await unlink(new URL(file, THUMBS_DIR_URL));
    }
  } catch {
    /* pruning is best-effort */
  }

  return { mirrored, kept: remote.length - mirrored };
}

// --- change detection --------------------------------------------------------
//
// The snapshot carries a `generatedAt` stamp, so a naive rewrite "changes"
// the file on every run even when not a single item moved — and in CI every
// change is a published snapshot and a full Pages rebuild. Twelve cycles a day
// of identical items is exactly the churn this guard exists to swallow: the
// file is only rewritten when the items themselves differ.

/**
 * One canonical text for a JSON value: keys sorted, undefined dropped, so
 * two items compare equal whenever JSON.stringify would print them the same
 * regardless of the order their normalizer happened to assign the keys.
 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = asRecord(value);
  if (!record) return JSON.stringify(value) ?? "null";
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Whether the run produced exactly the previous snapshot's items, in the
 * same order. Only the items count — `generatedAt` is deliberately outside
 * the comparison, since it is new on every run by construction.
 */
function snapshotUnchanged(previousItems, nextItems) {
  return (
    previousItems.length === nextItems.length &&
    canonicalJson(previousItems) === canonicalJson(nextItems)
  );
}

/**
 * The previous snapshot's items whose source has no feed registered this run.
 * A source that is not configured — the paid lanes on a keyless laptop, say —
 * is not a feed that failed; it is simply absent, and absent must never mean
 * deleted. Without this, a by-hand baseline refresh would drop every post CI
 * last fetched and the thumbnail prune would delete their pictures with them.
 * To retire a source on purpose, delete the media-snapshot branch
 * (`git push origin --delete media-snapshot`): CI reads the previous snapshot
 * from that branch, not from main, so a hand edit to main's live.json is
 * overlaid away on the next run and the items ride on. With the branch gone,
 * the overlay's missing-branch fallback rebuilds from main's baseline instead.
 */
function carriedUnconfigured(previousItems, feedNames) {
  const configured = new Set(feedNames);
  return previousItems.filter(
    (item) => typeof item?.source === "string" && !configured.has(item.source),
  );
}

/** The previous snapshot's items, or [] when there is nothing readable yet. */
async function previousItems() {
  try {
    const parsed = JSON.parse(await readFile(LIVE_JSON_URL, "utf8"));
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function main() {
  const feeds = configuredFeeds(process.env);
  if (feeds.length === 0) {
    console.log(
      "refresh-media: no feeds configured " +
        "(set LETTERBOXD_USER, SUBSTACK_RSS_URL, ANYAPI_KEY, or " +
        "X_BEARER_TOKEN+X_USER_ID); leaving live.json untouched.",
    );
    return;
  }

  // Each feed name doubles as the `source` its items carry, so a feed that
  // fails this run can hand back exactly what it contributed last run.
  const previous = await previousItems();
  const items = [];
  let succeeded = 0;
  for (const feed of feeds) {
    // A feed that is configured but not due this cycle is neither a success
    // nor a failure: it keeps exactly what it contributed last run, and does
    // not count toward the "at least one feed succeeded" gate below.
    if (feed.due === false) {
      const carried = previous.filter((item) => item?.source === feed.name);
      items.push(...carried);
      console.log(
        `refresh-media: ${feed.name}: not due this cycle, ` +
          `keeping ${carried.length} item(s)`,
      );
      continue;
    }

    let feedItems;
    try {
      feedItems = await feed.run();
    } catch (error) {
      feedItems = undefined;
      console.warn(
        `refresh-media: ${feed.name}: failed (${error?.message ?? error})`,
      );
    }

    // An empty result from a feed that answered is treated as a failure: a
    // 200 that yields nothing is far more often an error page or a changed
    // format than a genuinely emptied diary, and running with it would drop
    // every film from the library.
    if (feedItems !== undefined && feedItems.length === 0) {
      console.warn(`refresh-media: ${feed.name}: answered with 0 usable item(s)`);
      feedItems = undefined;
    }

    if (feedItems === undefined) {
      const carried = previous.filter((item) => item?.source === feed.name);
      items.push(...carried);
      console.warn(
        `refresh-media: ${feed.name}: carrying ${carried.length} item(s) ` +
          "forward from the previous snapshot",
      );
      continue;
    }

    items.push(...feedItems);
    succeeded += 1;
    console.log(`refresh-media: ${feed.name}: ok, ${feedItems.length} item(s)`);
  }

  const unconfigured = carriedUnconfigured(
    previous,
    feeds.map((feed) => feed.name),
  );
  if (unconfigured.length > 0) {
    items.push(...unconfigured);
    const sources = [...new Set(unconfigured.map((item) => item.source))];
    console.log(
      `refresh-media: ${sources.join(", ")}: not configured this run, ` +
        `keeping ${unconfigured.length} item(s) from the previous snapshot`,
    );
  }

  if (succeeded === 0) {
    console.warn(
      "refresh-media: every configured feed failed; leaving live.json untouched.",
    );
    return;
  }

  const deduped = [...new Map(items.map((item) => [item.id, item])).values()];
  // Mirror before comparing: the previous snapshot already points at local
  // thumbs, and a fresh item only matches it once its src has been rewritten
  // to the same local path. Re-mirroring identical images is idempotent.
  const thumbs = await mirrorThumbnails(deduped);
  if (snapshotUnchanged(previous, deduped)) {
    console.log(
      `refresh-media: unchanged — ${deduped.length} item(s) from ` +
        `${succeeded}/${feeds.length} feed(s) match the previous snapshot; ` +
        "leaving src/lib/media/live.json untouched.",
    );
    return;
  }
  const snapshot = { items: deduped, generatedAt: new Date().toISOString() };
  await writeFile(LIVE_JSON_URL, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `refresh-media: wrote ${deduped.length} item(s) from ` +
      `${succeeded}/${feeds.length} feed(s) to src/lib/media/live.json ` +
      `(${thumbs.mirrored} thumb(s) mirrored${thumbs.kept ? `, ${thumbs.kept} remote` : ""})`,
  );
}

// Exit 0 always: a failed refresh must never fail the cron job or a build.
//
// Guarded on being the entry point so the test suite can import the
// normalizers above — and prove they still agree with src/lib/media/
// normalize.ts — without kicking off a live refresh on import.
// `node scripts/refresh-media.mjs` is unaffected.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.warn(
      `refresh-media: unexpected failure (${error?.message ?? error})`,
    );
  });
}

// Exported for the parity test only; the script's real interface is the CLI.
export {
  anyapiDue,
  assertRssBody,
  carriedUnconfigured,
  fromAnyApiLinkedIn,
  fromAnyApiX,
  fromGoodreadsRss,
  fromLetterboxdRss,
  isRssDocument,
  snapshotUnchanged,
  xMediaFromSyndication,
};
