// Refreshes the build-time media snapshot at src/lib/media/live.json.
//
// For each configured feed it fetches, normalizes, and collects items; the
// snapshot is rewritten only when at least one feed succeeded, so a bad cron
// run can never blank the library. The site merges this snapshot with the
// hand-verified seed at load time (seed wins on id collisions — see
// src/lib/media/store.ts). Always exits 0 (cron-safe).
//
// NOTE: the tiny normalizers below INTENTIONALLY duplicate the logic in
// src/lib/media/normalize.ts. That module is the source of truth for the app,
// but it is TypeScript and this script must run under plain `node` (20+)
// with no build step or loader. If you change one, change both.
//
// Env (every feed is optional; unconfigured feeds are skipped):
//   LETTERBOXD_USER            letterboxd username -> https://letterboxd.com/<user>/rss/
//   SUBSTACK_RSS_URL           full substack feed url
//   X_BEARER_TOKEN + X_USER_ID X API v2 recent posts

import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import process from "node:process";
import { XMLParser } from "fast-xml-parser";

const LIVE_JSON_URL = new URL("../src/lib/media/live.json", import.meta.url);
const THUMBS_DIR_URL = new URL("../public/media/thumbs/", import.meta.url);
const THUMBS_PUBLIC_PATH = "/media/thumbs/";
const FETCH_TIMEOUT_MS = 10_000;

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

function stripHtml(html) {
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

const truncate = (text, max) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

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
      const poster = firstImgSrc(textOf(item.description));
      return {
        id: `letterboxd:${textOf(item.guid) ?? link ?? title}`,
        source: "letterboxd",
        kind: "film",
        title,
        url: link,
        publishedAt: isoDate(item.pubDate),
        year:
          numOf(item["letterboxd:filmYear"]) ??
          (groups?.year ? Number(groups.year) : undefined),
        rating:
          numOf(item["letterboxd:memberRating"]) ?? starsToRating(groups?.stars),
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
      return [
        {
          id: `x:${id}`,
          source: "x",
          kind: "post",
          title: truncate(text, 60),
          excerpt: truncate(text, 500),
          url: `https://x.com/alan_tai1/status/${id}`,
          author: "@alan_tai1",
          publishedAt: isoDate(record.created_at),
        },
      ];
    })
    .filter(isUsable);
}

// --- fetching ---------------------------------------------------------------

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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
  if (env.LETTERBOXD_USER) {
    const url = `https://letterboxd.com/${encodeURIComponent(env.LETTERBOXD_USER)}/rss/`;
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
  if (env.X_BEARER_TOKEN && env.X_USER_ID) {
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
  const wanted = new Set();
  for (const item of remote) {
    const source = item.image.src;
    const fileName = thumbFileName(source);
    try {
      const response = await fetchWithTimeout(source);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) throw new Error("empty body");
      await writeFile(new URL(fileName, THUMBS_DIR_URL), bytes);
      item.image.src = `${THUMBS_PUBLIC_PATH}${fileName}`;
      wanted.add(fileName);
      mirrored += 1;
    } catch (error) {
      console.warn(
        `refresh-media: thumb mirror failed for ${source} ` +
          `(${error?.message ?? error}); keeping remote URL.`,
      );
    }
  }

  // Prune mirrored files no longer referenced by the new snapshot.
  try {
    for (const file of await readdir(THUMBS_DIR_URL)) {
      if (!wanted.has(file)) await unlink(new URL(file, THUMBS_DIR_URL));
    }
  } catch {
    /* pruning is best-effort */
  }

  return { mirrored, kept: remote.length - mirrored };
}

async function main() {
  const feeds = configuredFeeds(process.env);
  if (feeds.length === 0) {
    console.log(
      "refresh-media: no feeds configured " +
        "(set LETTERBOXD_USER, SUBSTACK_RSS_URL, or X_BEARER_TOKEN+X_USER_ID); " +
        "leaving live.json untouched.",
    );
    return;
  }

  const items = [];
  let succeeded = 0;
  for (const feed of feeds) {
    try {
      const feedItems = await feed.run();
      items.push(...feedItems);
      succeeded += 1;
      console.log(`refresh-media: ${feed.name}: ok, ${feedItems.length} item(s)`);
    } catch (error) {
      console.warn(
        `refresh-media: ${feed.name}: failed (${error?.message ?? error})`,
      );
    }
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
main().catch((error) => {
  console.warn(`refresh-media: unexpected failure (${error?.message ?? error})`);
});
