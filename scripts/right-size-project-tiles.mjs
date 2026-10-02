// Right-sizes the project artwork the book only ever shows as a small tile.
//
// The Projects opener lays every project's artwork out in a four-column
// strip: each tile is about 125 × 128 CSS px in the 640-px page
// (.proj-count__plate, projects.css), cover-cropped. The two featured
// projects also fill a 588-px plate in the feature well and keep their full
// files; the rest appear nowhere else, so a 1536-px study is forty times the
// pixels its tile can show. Each of those gets a WebP sibling that fills the
// tile at its largest footprint (scripts/lib/right-size.mjs), and
// src/lib/content.ts points at the sibling. The original stays beside it.
//
//   node scripts/right-size-project-tiles.mjs           make missing siblings
//   node scripts/right-size-project-tiles.mjs --force   remake them all — run
//                                                        this after replacing
//                                                        an artwork file
//
// tests/projectTiles.test.ts holds content.ts to what this writes.

import { readdir, unlink } from "node:fs/promises";
import process from "node:process";
import { footprintPixels, rightSize } from "./lib/right-size.mjs";

const DIR = new URL("../public/images/projects/editorial/", import.meta.url);
/** The opener tile, in CSS px in the 640-px page layout. */
const TILE_CSS = { width: 125, height: 128 };
/** Artwork that appears only as an opener tile: every project with an image
    and no `featureOrder` in src/lib/content.ts. */
const TILE_ONLY = [
  "architec-study.webp",
  "arrival-study.webp",
  "greenchain-study.webp",
  "terrablade-study.webp",
  "vox-vera-study.webp",
];

const box = {
  width: footprintPixels(TILE_CSS.width),
  height: footprintPixels(TILE_CSS.height),
};

if (process.argv.includes("--force")) {
  const stems = TILE_ONLY.map((name) => name.replace(/\.[a-z0-9]+$/i, ""));
  for (const file of await readdir(DIR)) {
    if (stems.some((stem) => new RegExp(`^${stem}\\.w\\d+\\.webp$`).test(file))) {
      await unlink(new URL(file, DIR));
    }
  }
}

for (const fileName of TILE_ONLY) {
  const result = await rightSize({ dir: DIR, fileName, box });
  console.log(
    result.fileName
      ? `${fileName} -> ${result.fileName}${result.written ? "" : " (already there)"}`
      : `${fileName}: kept as it is (${result.reason})`,
  );
}
