// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* A right-sized thumbnail must show the same picture as the file it replaces
   at every size the site uses, so these pin the conservative rules: never
   upscale, never touch what already fits, keep orientation, keep screenshots
   lossless, never ship a bigger file, never rewrite a file that exists — and
   never lose an item, whatever happens to its picture. */

interface Box {
  width: number;
  height?: number;
}
type Sized =
  | { fileName: string; written: boolean }
  | { fileName: null; reason: string };
interface RightSize {
  FOOTPRINT_FACTOR: number;
  footprintPixels: (cssPixels: number) => number;
  variantSize: (
    source: { width: number; height: number },
    box: Box,
  ) => { width: number; height: number } | null;
  variantName: (fileName: string, width: number) => string;
  rightSize: (options: { dir: URL; fileName: string; box: Box }) => Promise<Sized>;
}
interface Item {
  id: string;
  image?: { src: string; alt: string };
}
interface RefreshScript {
  mirrorThumbnails: (items: Item[], dir?: URL) => Promise<{ mirrored: number; kept: number }>;
  repairThumbnails: (items: Item[], dir?: URL) => Promise<{ restored: number; dropped: number }>;
  rightSizeThumbnails: (items: Item[], dir?: URL) => Promise<{ sized: number; written: number }>;
  pruneThumbnails: (items: Item[], dir?: URL) => Promise<void>;
}

const script = (name: string) =>
  pathToFileURL(join(process.cwd(), "scripts", name)).href;
const loadLib = async () =>
  (await import(/* @vite-ignore */ script("lib/right-size.mjs"))) as RightSize;
const loadRefresh = async () =>
  (await import(/* @vite-ignore */ script("refresh-media.mjs"))) as RefreshScript;

/** Deterministic noise: a photo-like image that does not compress to nothing. */
function noise(width: number, height: number, channels: 3 | 4 = 3) {
  const data = Buffer.alloc(width * height * channels);
  let seed = 0x2545f491;
  for (let i = 0; i < data.length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = seed >>> 24;
  }
  return sharp(data, { raw: { width, height, channels } });
}

let dirPath: string;
let dir: URL;
const put = (name: string, bytes: Buffer) => writeFile(join(dirPath, name), bytes);
const files = async () => (await readdir(dirPath)).sort();
const local = (name: string) => `/media/thumbs/${name}`;
const item = (id: string, src?: string): Item =>
  src === undefined ? { id } : { id, image: { src, alt: id } };

beforeEach(async () => {
  dirPath = await mkdtemp(join(tmpdir(), "right-size-"));
  dir = pathToFileURL(`${dirPath}/`);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await rm(dirPath, { recursive: true, force: true });
});

describe("the sizing rule", () => {
  it("covers the largest footprint of each slot", async () => {
    const { FOOTPRINT_FACTOR, footprintPixels } = await loadLib();
    // The book's page on a 3200×1800 viewport, at DPR 2, over the 640-px layout.
    const largestPage = Math.min(0.46 * 3200, 0.66 * 1800, (3200 - 160) / 2);
    expect(FOOTPRINT_FACTOR).toBeGreaterThanOrEqual((largestPage / 640) * 2);
    // Page textures never exceed 3× the layout (capturePixelRatio).
    expect(FOOTPRINT_FACTOR).toBeGreaterThanOrEqual(3);
    expect(footprintPixels(166)).toBe(640); // a media plate
    expect(footprintPixels(125)).toBe(480); // a project tile, across
    expect(footprintPixels(128)).toBe(480); // …and down
  });

  it("resizes only what is larger than its box, and fills the box", async () => {
    const { variantSize } = await loadLib();
    expect(variantSize({ width: 2040, height: 1536 }, { width: 640 })).toEqual({
      width: 640,
      height: 482,
    });
    expect(variantSize({ width: 640, height: 900 }, { width: 640 })).toBeNull();
    expect(variantSize({ width: 600, height: 900 }, { width: 640 })).toBeNull();

    const tile = { width: 480, height: 480 };
    // A 3:2 picture in a square slot is bound by its height.
    expect(variantSize({ width: 1536, height: 1024 }, tile)).toEqual({
      width: 720,
      height: 480,
    });
    expect(variantSize({ width: 1254, height: 1254 }, tile)).toEqual(tile);
    // Too short to cover the slot even at full size: left alone.
    expect(variantSize({ width: 1000, height: 300 }, tile)).toBeNull();
    for (const source of [
      { width: 1999, height: 1333 },
      { width: 903, height: 1199 },
      { width: 1001, height: 997 },
    ]) {
      const size = variantSize(source, tile)!;
      expect(size.width).toBeGreaterThanOrEqual(tile.width);
      expect(size.height).toBeGreaterThanOrEqual(tile.height);
    }
  });

  it("names a variant after its source and width", async () => {
    const { variantName } = await loadLib();
    expect(variantName("dd8ea5a8d8f6.jpg", 640)).toBe("dd8ea5a8d8f6.w640.webp");
    expect(variantName("arrival-study.webp", 480)).toBe("arrival-study.w480.webp");
  });
});

// These encode real images, which the shared CI runner does several times
// slower than a laptop; the budget is for that runner.
describe("rightSize", { timeout: 60_000 }, () => {
  const box = { width: 640 };

  it("writes a smaller WebP at the box width, once", async () => {
    const { rightSize } = await loadLib();
    const source = await noise(1600, 1200).jpeg({ quality: 90 }).toBuffer();
    await put("photo.jpg", source);

    expect(await rightSize({ dir, fileName: "photo.jpg", box })).toEqual({
      fileName: "photo.w640.webp",
      written: true,
    });
    const variant = await readFile(join(dirPath, "photo.w640.webp"));
    const meta = await sharp(variant).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 640, 480]);
    expect(variant.length).toBeLessThan(source.length);
    // The original is still there, untouched.
    expect((await readFile(join(dirPath, "photo.jpg"))).equals(source)).toBe(true);

    // A variant on disk is never rewritten, whatever it holds.
    await put("photo.w640.webp", Buffer.from("already here"));
    expect(await rightSize({ dir, fileName: "photo.jpg", box })).toEqual({
      fileName: "photo.w640.webp",
      written: false,
    });
    expect((await readFile(join(dirPath, "photo.w640.webp"))).toString()).toBe(
      "already here",
    );
  });

  it("leaves an image that already fits alone", async () => {
    const { rightSize } = await loadLib();
    await put("poster.jpg", await noise(600, 900).jpeg().toBuffer());
    expect(await rightSize({ dir, fileName: "poster.jpg", box })).toEqual({
      fileName: null,
      reason: "fits",
    });
    expect(await files()).toEqual(["poster.jpg"]);
  });

  it("bakes the EXIF orientation in, as the browser shows the original", async () => {
    const { rightSize } = await loadLib();
    // Stored on its side: 1600×1200 pixels the browser shows as 1200×1600.
    const source = await noise(1600, 1200)
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 90 })
      .toBuffer();
    await put("turned.jpg", source);
    expect(await rightSize({ dir, fileName: "turned.jpg", box })).toMatchObject({
      fileName: "turned.w640.webp",
    });
    const meta = await sharp(await readFile(join(dirPath, "turned.w640.webp"))).metadata();
    expect([meta.width, meta.height]).toEqual([640, 853]);
    expect(meta.orientation ?? 1).toBe(1);
  });

  it("keeps a screenshot lossless", async () => {
    const { rightSize } = await loadLib();
    const source = await noise(900, 600, 4).png().toBuffer();
    await put("shot.png", source);
    expect(await rightSize({ dir, fileName: "shot.png", box })).toMatchObject({
      fileName: "shot.w640.webp",
    });
    const variant = await sharp(await readFile(join(dirPath, "shot.w640.webp")))
      .raw()
      .toBuffer();
    const exact = await sharp(source)
      .resize({ width: 640, kernel: "lanczos3" })
      .raw()
      .toBuffer();
    expect(variant.equals(exact)).toBe(true);
  });

  it("never ships a variant that is not smaller", async () => {
    const { rightSize } = await loadLib();
    // Barely over the box and crushed to blocks: a faithful copy weighs more.
    await put("crushed.jpg", await noise(700, 520).jpeg({ quality: 3 }).toBuffer());
    expect(await rightSize({ dir, fileName: "crushed.jpg", box })).toEqual({
      fileName: null,
      reason: "no-smaller",
    });
    expect(await files()).toEqual(["crushed.jpg"]);
  });

  it("leaves an animation alone rather than freezing it", async () => {
    const { rightSize } = await loadLib();
    const frame = (background: string) =>
      sharp({ create: { width: 800, height: 600, channels: 3, background } })
        .png()
        .toBuffer();
    const animation = await sharp([await frame("#f00"), await frame("#00f")], {
      join: { animated: true },
    })
      .gif()
      .toBuffer();
    await put("loop.gif", animation);
    expect(await rightSize({ dir, fileName: "loop.gif", box })).toEqual({
      fileName: null,
      reason: "animated",
    });
  });

  it("throws on a file it cannot read as an image", async () => {
    const { rightSize } = await loadLib();
    await put("broken.jpg", Buffer.from("not a picture"));
    await expect(rightSize({ dir, fileName: "broken.jpg", box })).rejects.toThrow();
  });
});

describe("refresh-media thumbnails", { timeout: 60_000 }, () => {
  const WIDE = "aaaaaaaaaaaa.jpg";
  const WIDE_VARIANT = "aaaaaaaaaaaa.w640.webp";
  const POSTER = "bbbbbbbbbbbb.jpg";
  const ORPHAN = "cccccccccccc.jpg";

  async function seed() {
    await put(WIDE, await noise(1600, 1200).jpeg({ quality: 90 }).toBuffer());
    await put(POSTER, await noise(600, 900).jpeg().toBuffer());
    await put(ORPHAN, await noise(400, 300).jpeg().toBuffer());
    return [
      item("wide", local(WIDE)),
      item("poster", local(POSTER)),
      item("remote", "https://example.com/pic.jpg"),
      item("no-picture"),
    ];
  }

  it("points oversized thumbs at a right-sized sibling and nothing else", async () => {
    const { rightSizeThumbnails } = await loadRefresh();
    const items = await seed();
    expect(await rightSizeThumbnails(items, dir)).toEqual({ sized: 1, written: 1 });
    expect(items.map((entry) => entry.image?.src)).toEqual([
      local(WIDE_VARIANT),
      local(POSTER),
      "https://example.com/pic.jpg",
      undefined,
    ]);

    // Again, with the items as the next run finds them: nothing to do.
    const before = await readFile(join(dirPath, WIDE_VARIANT));
    expect(await rightSizeThumbnails(items, dir)).toEqual({ sized: 1, written: 0 });
    expect(items[0]!.image!.src).toBe(local(WIDE_VARIANT));
    expect((await readFile(join(dirPath, WIDE_VARIANT))).equals(before)).toBe(true);
  });

  it("prunes what nothing uses but keeps each original beside its sibling", async () => {
    const { rightSizeThumbnails, pruneThumbnails } = await loadRefresh();
    const items = await seed();
    await rightSizeThumbnails(items, dir);
    // A sibling at a width nothing points at any more.
    await put("aaaaaaaaaaaa.w320.webp", Buffer.from("old width"));
    await pruneThumbnails(items, dir);
    expect(await files()).toEqual([WIDE, WIDE_VARIANT, POSTER]);

    // The item goes: so do its original and its sibling.
    await pruneThumbnails(items.slice(1), dir);
    expect(await files()).toEqual([POSTER]);
  });

  /** The three steps in the order refresh-media runs them. */
  async function settle(items: Item[]) {
    const script = await loadRefresh();
    const repaired = await script.repairThumbnails(items, dir);
    const sized = await script.rightSizeThumbnails(items, dir);
    await script.pruneThumbnails(items, dir);
    return { ...repaired, ...sized };
  }
  /** Every item is on a file that exists: nothing published points at nothing. */
  async function expectNoMissingFiles(items: Item[]) {
    const present = await files();
    for (const entry of items) {
      const src = entry.image?.src ?? "";
      if (src.startsWith("/media/thumbs/")) {
        expect(present, entry.id).toContain(src.slice("/media/thumbs/".length));
      }
    }
  }

  it("makes a missing sibling again from the original", async () => {
    const items = await seed();
    await settle(items);
    await unlink(join(dirPath, WIDE_VARIANT));
    expect(await settle(items)).toEqual({ restored: 1, dropped: 0, sized: 1, written: 1 });
    expect(items[0]!.image!.src).toBe(local(WIDE_VARIANT));
    await expectNoMissingFiles(items);
  });

  it("falls back to the original when a missing sibling cannot be made again", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const items = await seed();
    await settle(items);
    expect(items[0]!.image!.src).toBe(local(WIDE_VARIANT));

    // The sibling is gone and the original no longer decodes.
    await unlink(join(dirPath, WIDE_VARIANT));
    await put(WIDE, Buffer.from("not a picture"));
    expect(await settle(items)).toEqual({ restored: 1, dropped: 0, sized: 0, written: 0 });
    expect(items[0]!.image!.src).toBe(local(WIDE));
    expect(warn).toHaveBeenCalledTimes(1);
    await expectNoMissingFiles(items);
  });

  it("drops only the picture when there is nothing left to show", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const items = await seed();
    await settle(items);

    // A sibling and its original both gone, and a plain original gone.
    await unlink(join(dirPath, WIDE_VARIANT));
    await unlink(join(dirPath, WIDE));
    await unlink(join(dirPath, POSTER));
    expect(await settle(items)).toEqual({ restored: 0, dropped: 2, sized: 0, written: 0 });
    expect(items.map((entry) => [entry.id, entry.image?.src])).toEqual([
      ["wide", undefined],
      ["poster", undefined],
      ["remote", "https://example.com/pic.jpg"],
      ["no-picture", undefined],
    ]);
    expect(warn).toHaveBeenCalledTimes(2);
    await expectNoMissingFiles(items);
  });

  it("keeps a picture it could not check", async () => {
    const { repairThumbnails } = await loadRefresh();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A directory that is really a file: the check fails, but not with "no such file".
    await put("blocker", Buffer.from("x"));
    const blocked = pathToFileURL(`${join(dirPath, "blocker")}/`);
    const items = [item("wide", local(WIDE))];
    expect(await repairThumbnails(items, blocked)).toEqual({ restored: 0, dropped: 0 });
    expect(items[0]!.image!.src).toBe(local(WIDE));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("keeps the mirrored file when a picture cannot be right-sized", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await put("dddddddddddd.jpg", Buffer.from("not a picture"));
    const items = [item("broken", local("dddddddddddd.jpg")), ...(await seed())];
    expect(await settle(items)).toEqual({ restored: 0, dropped: 0, sized: 1, written: 1 });
    expect(items[0]!.image!.src).toBe(local("dddddddddddd.jpg"));
    expect(items[1]!.image!.src).toBe(local(WIDE_VARIANT));
    expect(warn).toHaveBeenCalledTimes(1);
    await expectNoMissingFiles(items);
  });

  it("makes the sibling again when the source changes under the same URL", async () => {
    const { mirrorThumbnails } = await loadRefresh();
    const first = await noise(1600, 1200).jpeg({ quality: 90 }).toBuffer();
    const second = await noise(1280, 960).jpeg({ quality: 90 }).toBuffer();
    let body = first;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(body))),
    );
    const fresh = () => [item("post", "https://example.com/photo.jpg")];

    let items = fresh();
    expect(await mirrorThumbnails(items, dir)).toEqual({ mirrored: 1, kept: 0 });
    await settle(items);
    const [original, variant] = await files();
    expect(items[0]!.image!.src).toBe(local(variant!));
    const made = await readFile(join(dirPath, variant!));

    // The same bytes again: the sibling is not touched.
    items = fresh();
    await mirrorThumbnails(items, dir);
    expect(await settle(items)).toMatchObject({ sized: 1, written: 0 });

    // New bytes at the same URL, while another item, carried forward from the
    // last snapshot, still points at the sibling made from the old picture.
    body = second;
    items = [item("carried", local(variant!)), ...fresh()];
    await mirrorThumbnails(items, dir);
    expect(await files()).toEqual([original]);
    expect(await settle(items)).toEqual({ restored: 1, dropped: 0, sized: 2, written: 1 });
    expect(items.map((entry) => entry.image!.src)).toEqual([local(variant!), local(variant!)]);
    const remade = await readFile(join(dirPath, variant!));
    expect(remade.equals(made)).toBe(false);
    expect((await sharp(remade).metadata()).height).toBe(480);
    await expectNoMissingFiles(items);
  });
});
