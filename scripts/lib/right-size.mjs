// Right-sized WebP variants for images the book shows in small slots.
//
// The desktop book rasterizes every page before it opens, so each image on a
// page is downloaded up front — and feeds hand over photos many times larger
// than the slot they land in (a 2040-px LinkedIn photo in a 166-px plate). A
// variant is that image resized to the largest footprint any view gives its
// slot, as WebP. The original stays on disk beside it, unreferenced, so a
// later change of size never has to fetch the source again.
//
// A variant must show the same picture at every size the site uses, so the
// rules lean conservative: never upscale, never touch an image that already
// fits, keep the orientation and the colour profile the browser would have
// honoured, keep screenshots lossless, and never ship a variant that is not
// smaller than its source.
//
// It will not match, pixel for pixel, what the browser makes of the original.
// Chrome and Firefox shrink a 2000-px image to 300 px with a cheap filter
// that leaves lettering jagged and thin lines broken; a variant is filtered
// properly here and shrunk only about twice there, so it comes out smoother.
// That difference is measured, and was accepted, in scripts/bench/image-parity.mjs.

import { readFile, stat, writeFile } from "node:fs/promises";
import sharp from "sharp";

/** The largest device-pixel footprint of a slot, as a multiple of its CSS
    size in the 640-px page layout. The book's visible page tops out at 1188
    CSS px wide (1.86× the layout) on a 3200×1800 viewport, which at DPR 2 is
    3.71×. Page textures cap at 3× (capturePixelRatio, pageTextures.tsx). */
export const FOOTPRINT_FACTOR = 3.75;
/** Variant sizes round up to a multiple of this. */
const SIZE_STEP = 32;
const WEBP_QUALITY = 82;
const WEBP_EFFORT = 6;

/** Pixels a slot dimension needs, from its CSS size in the page layout. */
export function footprintPixels(cssPixels) {
  return Math.ceil((cssPixels * FOOTPRINT_FACTOR) / SIZE_STEP) * SIZE_STEP;
}

/**
 * The size a `width`×`height` source should be resized to so it fills `box`
 * the way `object-fit: cover` does — `box.height` is left out for a slot only
 * its width constrains — or null when the source already fits and must be
 * used as it is.
 */
export function variantSize(source, box) {
  const scale = Math.max(
    box.width / source.width,
    box.height ? box.height / source.height : 0,
  );
  if (!(scale < 1)) return null;
  // Up, never down: a rounded-down side would leave the box a pixel short.
  return {
    width: Math.ceil(source.width * scale - 1e-9),
    height: Math.ceil(source.height * scale - 1e-9),
  };
}

/** `photo.jpg` → `photo.w640.webp`. */
export function variantName(fileName, width) {
  return `${fileName.replace(/\.[a-z0-9]+$/i, "")}.w${width}.webp`;
}

async function exists(url) {
  try {
    await stat(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Makes sure the variant of `fileName` (in directory URL `dir`) that fills
 * `box` exists, and reports which file a page should point at.
 *
 * Returns `{ fileName, written }` — the variant, and whether this call made
 * it — or `{ fileName: null, reason }` when the original is the right file:
 * it already `fits`, is `animated`, is in a colour space WebP cannot hold
 * (`cmyk`), or its variant would be `no-smaller`. A variant already on disk
 * is never rewritten, so a sharp upgrade cannot change published files.
 * Throws when the source cannot be read or decoded.
 */
export async function rightSize({ dir, fileName, box }) {
  const source = await readFile(new URL(fileName, dir));
  const meta = await sharp(source).metadata();
  if (!meta.width || !meta.height) throw new Error("no dimensions");
  if ((meta.pages ?? 1) > 1) return { fileName: null, reason: "animated" };
  if (meta.space === "cmyk") return { fileName: null, reason: "cmyk" };

  // EXIF orientations 5–8 turn the image on its side.
  const turned = (meta.orientation ?? 1) >= 5;
  const size = variantSize(
    turned
      ? { width: meta.height, height: meta.width }
      : { width: meta.width, height: meta.height },
    box,
  );
  if (!size) return { fileName: null, reason: "fits" };

  const target = variantName(fileName, size.width);
  const targetUrl = new URL(target, dir);
  if (await exists(targetUrl)) return { fileName: target, written: false };

  const resized = sharp(source)
    // Bake the EXIF orientation in: the browser applied it to the original.
    .rotate()
    .keepIccProfile()
    .resize({ width: size.width, kernel: "lanczos3" });
  const encoded = await (meta.format === "png"
    ? resized.webp({ lossless: true, effort: WEBP_EFFORT })
    : resized.webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
  ).toBuffer();
  if (encoded.length >= source.length) {
    return { fileName: null, reason: "no-smaller" };
  }
  await writeFile(targetUrl, encoded);
  return { fileName: target, written: true };
}
