import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fromLetterboxdRss,
  fromSubstackRss,
  fromXApi,
} from "@/lib/media/normalize";
import { MEDIA_SEED } from "@/lib/media/seed";
import { loadMedia, mergeMedia } from "@/lib/media/store";
import { MediaItemSchema, type MediaItem } from "@/lib/media/types";

const fixture = (name: string): string =>
  readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf8");

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
