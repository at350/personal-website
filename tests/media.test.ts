import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  fromAnyApiX,
  fromLetterboxdRss,
  fromSubstackRss,
  fromXApi,
} from "@/lib/media/normalize";
import { MEDIA_SEED } from "@/lib/media/seed";
import { loadMedia, mergeMedia } from "@/lib/media/store";
import { MediaItemSchema, type MediaItem } from "@/lib/media/types";

const fixture = (name: string): string =>
  readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf8");

/** Shapes a broken or throttled AnyAPI response can actually take. */
const GARBAGE: unknown[] = [
  null,
  undefined,
  "nope",
  "<html><body>429 Too Many Requests</body></html>",
  {},
  { error: "missing credential", code: "unauthorized" },
  { output: { found: false, data: null } },
  { output: { found: true, data: { tweets: [], nextCursor: null } } },
  { output: { data: { tweets: "not an array" } } },
];

const makeItem = (
  overrides: Partial<MediaItem> & { id: string; title: string },
): MediaItem =>
  MediaItemSchema.parse({ source: "web", kind: "link", ...overrides });

describe("fromLetterboxdRss", () => {
  const items = fromLetterboxdRss(fixture("letterboxd.rss.xml"));

  it("parses every item with source and kind", () => {
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.source).toBe("letterboxd");
      expect(item.kind).toBe("film");
    }
  });

  it("extracts clean title, year, and namespaced rating", () => {
    expect(items[0]).toMatchObject({
      title: "Past Lives",
      year: 2023,
      rating: 4.5,
      url: "https://letterboxd.com/alantai/film/past-lives/",
      publishedAt: "2026-08-01T08:04:12.000Z",
    });
  });

  it("derives title, year, and ★★★½ = 3.5 from the title when namespace fields are absent", () => {
    expect(items[1]).toMatchObject({
      title: "Perfect Days",
      year: 2023,
      rating: 3.5,
    });
  });

  it("records the night it was watched, not just when the entry posted", () => {
    // Both dates are kept: the diary's watched date is the fact the plate
    // prints, and it can sit days behind the post date (see the review below).
    expect(items[0]).toMatchObject({
      publishedAt: "2026-08-01T08:04:12.000Z",
      watchedAt: "2026-08-01T00:00:00.000Z",
      isRewatch: false,
    });
    expect(items[1]?.watchedAt).toBe("2026-07-19T00:00:00.000Z");
  });

  it("keeps a review verbatim and flags the rewatch", () => {
    expect(items[2]).toMatchObject({
      title: "In the Mood for Love",
      year: 2000,
      rating: 5,
      isRewatch: true,
      watchedAt: "2026-07-12T00:00:00.000Z",
      excerpt: "Every frame is a held breath & the score does the rest.",
    });
  });

  it("leaves a plain watch with no excerpt to print", () => {
    // Description is only the poster and "Watched on …" furniture.
    expect(items[0]?.excerpt).toBeUndefined();
    expect(items[1]?.excerpt).toBeUndefined();
  });

  it("truncates a long review to 280 characters", () => {
    const body = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const xml = `<?xml version="1.0"?>
      <rss xmlns:letterboxd="https://letterboxd.com"><channel>
        <item>
          <title>Long One, 2021 - ★★★★</title>
          <link>https://letterboxd.com/alantai/film/long-one/</link>
          <description><![CDATA[ <p><img src="https://a.ltrbxd.com/p.jpg"/></p> <p>${body}</p> ]]></description>
        </item>
      </channel></rss>`;
    const excerpt = fromLetterboxdRss(xml)[0]?.excerpt ?? "";
    expect(excerpt.length).toBeLessThanOrEqual(280);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).not.toContain("<");
    expect(excerpt).not.toContain("ltrbxd");
  });

  it("pulls the poster out of the description html", () => {
    expect(items[0]?.image).toMatchObject({
      src: "https://a.ltrbxd.com/resized/film-poster/8/5/2/1/2/9/852129-past-lives-0-600-0-900-crop.jpg",
    });
    expect(items[0]?.image?.alt).toContain("Past Lives");
  });

  it("returns [] on malformed or empty xml", () => {
    expect(fromLetterboxdRss("this is << not xml >>")).toEqual([]);
    expect(fromLetterboxdRss("")).toEqual([]);
    expect(fromLetterboxdRss("<html><body>404</body></html>")).toEqual([]);
  });

  it("drops a bad item without killing the batch", () => {
    const xml = `<?xml version="1.0"?>
      <rss xmlns:letterboxd="https://letterboxd.com"><channel>
        <item>
          <title>Good Film, 2020 - ★★★</title>
          <link>https://letterboxd.com/alantai/film/good-film/</link>
        </item>
        <item><description>no title at all</description></item>
      </channel></rss>`;
    const parsed = fromLetterboxdRss(xml);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      title: "Good Film",
      year: 2020,
      rating: 3,
      isRewatch: false,
    });
    expect(parsed[0]?.watchedAt).toBeUndefined();
  });
});

describe("fromSubstackRss", () => {
  const items = fromSubstackRss(fixture("substack.rss.xml"));

  it("parses title, link, author, and ISO date", () => {
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: "substack",
      kind: "article",
      title: "On slow software",
      url: "https://alantai.substack.com/p/on-slow-software",
      author: "Alan Tai",
      publishedAt: "2026-08-04T16:30:00.000Z",
    });
  });

  it("strips html from the excerpt and truncates to 280 chars", () => {
    const excerpt = items[0]?.excerpt ?? "";
    expect(excerpt.length).toBeLessThanOrEqual(280);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).toContain("slow software");
    expect(excerpt).toContain("&"); // entity decoded
    expect(excerpt).not.toContain("<");
  });

  it("keeps short excerpts verbatim and image absent without an enclosure", () => {
    expect(items[1]?.excerpt).toBe(
      "A quick tour of the tiny scripts holding this site together.",
    );
    expect(items[1]?.image).toBeUndefined();
  });

  it("uses the enclosure as the image", () => {
    expect(items[0]?.image?.src).toContain("substackcdn.com");
  });

  it("returns [] on malformed xml", () => {
    expect(fromSubstackRss("<<<")).toEqual([]);
  });
});

describe("fromXApi", () => {
  const longText = Array.from({ length: 120 }, (_, index) => `word${index}`).join(" ");
  const payload = {
    data: [
      {
        id: "9000000000000000001",
        text: longText,
        created_at: "2026-08-11T07:17:42.000Z",
      },
      { id: "9000000000000000002", text: "short post" },
    ],
    meta: { result_count: 2 },
  };

  it("normalizes tweets into posts", () => {
    const items = fromXApi(payload);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "x:9000000000000000001",
      source: "x",
      kind: "post",
      url: "https://x.com/alan_tai1/status/9000000000000000001",
      author: "@alan_tai1",
      publishedAt: "2026-08-11T07:17:42.000Z",
    });
    expect(items[1]?.title).toBe("short post");
    expect(items[1]?.excerpt).toBeUndefined();
  });

  it("splits a long post into non-overlapping title and excerpt copy", () => {
    const [item] = fromXApi(payload);
    expect(item?.title.length).toBeLessThanOrEqual(60);
    expect(item?.excerpt?.length).toBeLessThanOrEqual(500);
    expect(item?.excerpt?.startsWith(item.title.replace(/…$/, ""))).toBe(false);
  });

  it("returns [] on garbage or missing data", () => {
    expect(fromXApi(null)).toEqual([]);
    expect(fromXApi("nope")).toEqual([]);
    expect(fromXApi({})).toEqual([]);
    expect(fromXApi({ data: [{ id: "1" }] })).toEqual([]); // no text
  });
});

describe("fromAnyApiX", () => {
  // A real `POST /v1/run/twitter.user_posts` body, trimmed to eight posts and
  // scrubbed of the account-scoped cursor. Two of them are reposts.
  const captured: unknown = JSON.parse(fixture("anyapi.x.user_posts.json"));
  const items = fromAnyApiX(captured);

  const post = (fields: Record<string, unknown>) => ({
    output: { found: true, data: { tweets: [fields], nextCursor: null } },
  });

  it("normalizes the captured timeline into schema-valid posts", () => {
    expect(items).toHaveLength(6);
    for (const item of items) {
      expect(item.source).toBe("x");
      expect(item.kind).toBe("post");
      // Stable across runs, and deliberately collides with the four seeded
      // `x:<id>` posts so the seed keeps winning those.
      expect(item.id).toMatch(/^x:\d+$/);
      expect(MediaItemSchema.safeParse(item).success).toBe(true);
      expect(item.title.length).toBeLessThanOrEqual(200);
      expect(item.excerpt?.length ?? 0).toBeLessThanOrEqual(500);
    }
  });

  it("derives the byline from each post URL rather than assuming it", () => {
    for (const item of items) {
      expect(item.author).toBe("@alan_tai1");
      expect(item.url).toBe(
        `https://x.com/alan_tai1/status/${item.id.slice(2)}`,
      );
    }
  });

  it("reads createdUtc epoch seconds, which the shared isoDate cannot", () => {
    // Regression guard. AnyAPI sends `createdUtc: 1787008275`, and
    // `new Date("1787008275")` is Invalid Date — reusing isoDate here would
    // strip publishedAt from every post and sink the feed to the bottom of
    // the library instead of leading it.
    expect(items.find((item) => item.id === "x:2089490269695877177")).
      toMatchObject({ publishedAt: "2026-08-17T23:11:15.000Z" });
    for (const item of items) {
      expect(item.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    }
  });

  it("drops reposts so a stranger's words never carry Alan's byline", () => {
    for (const item of items) {
      expect(item.title.startsWith("RT @")).toBe(false);
    }
    expect(fromAnyApiX(post({
      id: "1",
      url: "https://x.com/alan_tai1/status/1",
      text: "RT @someone_else: my entire feed is just people complaining",
      createdUtc: 1787071196,
    }))).toEqual([]);
  });

  it("strips X's trailing t.co furniture but keeps a link written inline", () => {
    // "my fav https://t.co/Zl2bNy4Ru6" — the shortlink is the attached media,
    // not copy, and left in it becomes the whole headline.
    expect(items.find((item) => item.id === "x:2087716252676771992")).
      toMatchObject({ title: "my fav" });
    const inline = items.find((item) => item.id === "x:2088145901445599539");
    expect(`${inline?.title ?? ""} ${inline?.excerpt ?? ""}`).
      toContain("canvasui.dev");
    for (const item of items) {
      expect(item.title).not.toContain("t.co/");
      expect(item.excerpt ?? "").not.toContain("t.co/");
    }
  });

  it("drops a media-only post, which has no copy left of its own", () => {
    expect(fromAnyApiX(post({
      id: "2",
      url: "https://x.com/alan_tai1/status/2",
      text: "https://t.co/AbCd1234",
      createdUtc: 1787071196,
    }))).toEqual([]);
  });

  it("leaves image unset: this endpoint returns no media URLs", () => {
    // Documented, not aspirational — the SKU's payload carries no photo or
    // video field, so there is nothing for mirrorThumbnails() to localize.
    for (const item of items) expect(item.image).toBeUndefined();
  });

  it("splits a long post into non-overlapping title and excerpt copy", () => {
    const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const [item] = fromAnyApiX(post({
      id: "3",
      url: "https://x.com/alan_tai1/status/3",
      text,
      createdUtc: 1787071196,
    }));
    expect(item?.title.length).toBeLessThanOrEqual(200);
    expect(item?.excerpt?.length).toBeLessThanOrEqual(500);
    expect(item?.excerpt?.endsWith("…")).toBe(true);
    expect(item?.excerpt?.startsWith(item.title.replace(/…$/, ""))).toBe(false);
  });

  it("decodes the entities X escapes into the post text", () => {
    const [item] = fromAnyApiX(post({
      id: "4",
      url: "https://x.com/alan_tai1/status/4",
      text: "1,400 students &amp; 52 companies",
      createdUtc: 1787071196,
    }));
    expect(item?.title).toBe("1,400 students & 52 companies");
  });

  it("falls back to the requested handle when a record carries no URL", () => {
    const [item] = fromAnyApiX(
      post({ id: "5", text: "hello", createdUtc: 1787071196 }),
      "alan_tai1",
    );
    expect(item).toMatchObject({
      author: "@alan_tai1",
      url: "https://x.com/alan_tai1/status/5",
    });
  });

  it("accepts a bare output as well as the full response envelope", () => {
    expect(fromAnyApiX((captured as { output: unknown }).output)).
      toEqual(items);
  });

  it("returns [] on garbage, an error body, or a changed shape", () => {
    for (const bad of GARBAGE) expect(fromAnyApiX(bad)).toEqual([]);
  });

  it("drops one bad record without killing the batch", () => {
    const good = (index: number) => ({
      id: `90000000000000000${index}`,
      url: `https://x.com/alan_tai1/status/90000000000000000${index}`,
      text: `a perfectly fine post ${index}`,
      createdUtc: 1787071196,
    });
    const parsed = fromAnyApiX({
      output: {
        found: true,
        data: {
          tweets: [
            good(1),
            { id: "2", url: "https://x.com/alan_tai1/status/2" }, // no text
            { text: "no id at all" },
            null,
            "not an object",
            { id: "3", text: "", createdUtc: 1787071196 },
            good(2),
          ],
          nextCursor: null,
        },
      },
    });
    expect(parsed).toHaveLength(2);
    expect(parsed.map((item) => item.title)).toEqual([
      "a perfectly fine post 1",
      "a perfectly fine post 2",
    ]);
  });
});

describe("refresh-media.mjs / normalize.ts parity", () => {
  it("normalizes AnyAPI bodies identically to the app's normalizer", async () => {
    // Invariant: the .mjs duplicates normalize.ts so it can run under plain
    // node. Drift there is silent — the cron would write a snapshot the app
    // then parses differently — so compare the two on the same inputs.
    // Round-tripping through JSON and the schema is exactly what the script
    // writes and store.ts reads back.
    // jsdom serves import.meta.url over http:, which the ESM loader refuses;
    // reach the script on disk instead.
    const script = (await import(
      /* @vite-ignore */
      pathToFileURL(join(process.cwd(), "scripts", "refresh-media.mjs")).href
    )) as { fromAnyApiX: (json: unknown, handle?: string) => unknown[] };

    const inputs: unknown[] = [
      JSON.parse(fixture("anyapi.x.user_posts.json")),
      ...GARBAGE,
      {
        output: {
          data: {
            tweets: [
              { id: "1", text: "RT @a_person: not ours", createdUtc: 1787071196 },
              { id: "2", text: "https://t.co/OnlyMedia", createdUtc: 1787071196 },
              { id: "3", text: "kept &amp; counted", createdUtc: 1787071196 },
              { id: "4", text: "no date at all" },
              { id: "5", text: "x".repeat(900), createdUtc: 1787071196 },
            ],
          },
        },
      },
    ];

    for (const input of inputs) {
      const viaScript = script
        .fromAnyApiX(input, "alan_tai1")
        .map((item) => MediaItemSchema.parse(JSON.parse(JSON.stringify(item))));
      expect(viaScript).toEqual(fromAnyApiX(input, "alan_tai1"));
    }
  });
});

describe("media store", () => {
  it("mergeMedia lets the seed win on id collisions", () => {
    const seed = [
      makeItem({
        id: "a",
        title: "seed a",
        publishedAt: "2026-01-02T00:00:00.000Z",
      }),
      makeItem({ id: "b", title: "seed b" }),
    ];
    const live = [
      makeItem({
        id: "a",
        title: "live a",
        publishedAt: "2026-05-01T00:00:00.000Z",
      }),
      makeItem({
        id: "c",
        title: "live c",
        publishedAt: "2026-03-01T00:00:00.000Z",
      }),
    ];
    const merged = mergeMedia(seed, live);
    expect(merged.find((item) => item.id === "a")?.title).toBe("seed a");
    expect(merged).toHaveLength(3);
  });

  it("mergeMedia sorts publishedAt desc with undefined dates sinking", () => {
    const seed = [
      makeItem({
        id: "a",
        title: "seed a",
        publishedAt: "2026-01-02T00:00:00.000Z",
      }),
      makeItem({ id: "b", title: "seed b" }),
    ];
    const live = [
      makeItem({
        id: "c",
        title: "live c",
        publishedAt: "2026-03-01T00:00:00.000Z",
      }),
    ];
    expect(mergeMedia(seed, live).map((item) => item.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("loadMedia returns the full verified seed, valid and sorted", () => {
    const items = loadMedia();
    expect(items.length).toBeGreaterThanOrEqual(MEDIA_SEED.length);
    for (const seeded of MEDIA_SEED) {
      expect(items.some((item) => item.id === seeded.id)).toBe(true);
    }
    for (const item of items) {
      expect(MediaItemSchema.safeParse(item).success).toBe(true);
    }
    const dates = items
      .map((item) => item.publishedAt)
      .filter((date): date is string => date !== undefined);
    expect(dates).toEqual([...dates].sort().reverse());
    const firstUndefined = items.findIndex(
      (item) => item.publishedAt === undefined,
    );
    if (firstUndefined !== -1) {
      for (const item of items.slice(firstUndefined)) {
        expect(item.publishedAt).toBeUndefined();
      }
    }
  });
});
