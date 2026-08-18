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
//   SUBSTACK_RSS_URL           full substack feed url
//   ANYAPI_KEY                 anyapi.com key -> recent X posts (preferred)
//   X_HANDLE                   X handle for the anyapi lookup, no leading @;
//                              defaults to DEFAULT_X_HANDLE below
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
const ANYAPI_TIMEOUT_MS = 20_000;

// This site's own letterboxd account. A username is public, so it belongs in
// the repo rather than in a secret: the film log then keeps refreshing without
// any configuration at all. LETTERBOXD_USER overrides it (say, on a fork).
const DEFAULT_LETTERBOXD_USER = "alantai";

// Same reasoning for the X handle: it is public, so baking it in keeps the
// posts flowing with only ANYAPI_KEY set. X_HANDLE overrides it.
const DEFAULT_X_HANDLE = "alan_tai1";

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

// X appends a t.co shortlink for any attached photo, video, or quoted post;
// it is furniture, not copy. Only a trailing run is dropped.
const TRAILING_TCO = /(?:\s*https?:\/\/t\.co\/[A-Za-z0-9]+)+\s*$/i;

// A repost is someone else's words under our byline.
const RETWEET_PREFIX = /^RT @[A-Za-z0-9_]{1,15}:/;

function postText(raw) {
  return decodeEntities(raw)
    .replace(TRAILING_TCO, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rssItems(xml) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = asRecord(parser.parse(xml));
  const channel = asRecord(asRecord(doc?.rss)?.channel);
  return toArray(channel?.item).flatMap((entry) => {
    const record = asRecord(entry);
    return record ? [record] : [];
  });
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
      const text = postText(raw);
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
        return fromAnyApiX(await response.json(), xHandle);
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
  return feeds;
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

  if (succeeded === 0) {
    console.warn(
      "refresh-media: every configured feed failed; leaving live.json untouched.",
    );
    return;
  }

  const deduped = [...new Map(items.map((item) => [item.id, item])).values()];
  const thumbs = await mirrorThumbnails(deduped);
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
export { fromAnyApiX };
