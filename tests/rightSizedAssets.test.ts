// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { projects } from "@/lib/content";

/* The right-sized files the repo carries — the project tiles and the media
   baseline's thumbnails — are held to the rule that made them: a sibling
   fills its slot's largest footprint, sits beside the original it came from,
   and shows the same picture. Replacing an artwork without remaking its
   sibling (scripts/right-size-project-tiles.mjs --force) fails here. */

interface RightSize {
  footprintPixels: (cssPixels: number) => number;
  variantSize: (
    source: { width: number; height: number },
    box: { width: number; height?: number },
  ) => { width: number; height: number } | null;
}
const lib = (await import(
  /* @vite-ignore */
  pathToFileURL(join(process.cwd(), "scripts", "lib", "right-size.mjs")).href
)) as RightSize;

const SIBLING = /\.w\d+\.webp$/;
const publicPath = (src: string) => join(process.cwd(), "public", src);

/** Pixel size as the browser shows it: EXIF orientation applied. */
async function dimensions(file: string) {
  const { width, height, orientation } = await sharp(file).metadata();
  if (!width || !height) throw new Error(`${file}: no dimensions`);
  return (orientation ?? 1) >= 5
    ? { width: height, height: width }
    : { width, height };
}

/** Mean absolute difference per channel, 0–255, between a sibling and its
    original resized to the same pixels. WebP at the helper's quality lands
    under 3; another picture, or another palette, lands far above. */
async function difference(original: string, sibling: string) {
  const { width, height } = await sharp(sibling).metadata();
  const [a, b] = await Promise.all([
    sharp(original)
      .rotate()
      .resize({ width, height, fit: "fill", kernel: "lanczos3" })
      .removeAlpha()
      .raw()
      .toBuffer(),
    sharp(sibling).removeAlpha().raw().toBuffer(),
  ]);
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}
const SAME_PICTURE = 4;

// Decoding and comparing a few dozen images: quick on a laptop, slower on the
// shared CI runner. The budget is for that runner.
describe("right-sized files in the repo", { timeout: 120_000 }, () => {
  it("gives tile-only projects a sibling that fills the tile, and features their full file", async () => {
    const tile = { width: lib.footprintPixels(125), height: lib.footprintPixels(128) };
    const withArt = projects.filter((project) => project.image);
    expect(withArt.length).toBeGreaterThan(0);

    for (const project of withArt) {
      const src = project.image!.src;
      if (project.featureOrder !== undefined) {
        // Features also fill the 588-px well plate.
        expect(src, project.id).not.toMatch(SIBLING);
        continue;
      }
      expect(src, project.id).toMatch(SIBLING);
      const original = publicPath(src.replace(SIBLING, ".webp"));
      expect(existsSync(original), `${project.id}: original kept`).toBe(true);

      const made = await dimensions(publicPath(src));
      expect(made.width, project.id).toBeGreaterThanOrEqual(tile.width);
      expect(made.height, project.id).toBeGreaterThanOrEqual(tile.height);
      expect(made.width, project.id).toBe(
        lib.variantSize(await dimensions(original), tile)?.width,
      );
      expect(await difference(original, publicPath(src)), project.id).toBeLessThan(SAME_PICTURE);
    }
  });

  it("points oversized media thumbs at a 640-px sibling of the original beside it", async () => {
    const thumbs = join(process.cwd(), "public", "media", "thumbs");
    const mirrored = existsSync(thumbs) ? readdirSync(thumbs) : [];
    const snapshot = JSON.parse(
      readFileSync(join(process.cwd(), "src", "lib", "media", "live.json"), "utf8"),
    ) as { items: { id: string; image?: { src: string } }[] };

    for (const item of snapshot.items) {
      const src = item.image?.src ?? "";
      if (!src.startsWith("/media/thumbs/")) continue;
      const file = src.slice("/media/thumbs/".length);
      expect(mirrored, item.id).toContain(file);
      if (!SIBLING.test(file)) continue;

      const hash = file.slice(0, 12);
      const original = mirrored.find(
        (name) => name.startsWith(`${hash}.`) && !SIBLING.test(name),
      );
      expect(original, `${item.id}: original kept`).toBeDefined();
      const source = await dimensions(join(thumbs, original!));
      expect(source.width, item.id).toBeGreaterThan(lib.footprintPixels(166));
      expect((await dimensions(join(thumbs, file))).width, item.id).toBe(
        lib.footprintPixels(166),
      );
      expect(
        await difference(join(thumbs, original!), join(thumbs, file)),
        item.id,
      ).toBeLessThan(SAME_PICTURE);
    }
  });
});
