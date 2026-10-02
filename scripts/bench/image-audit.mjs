/* What the book's pictures cost, and whether each one is the right size.

   The desktop book rasterizes every page before it opens, so each image on a
   page downloads first. This loads a build, waits for the book, and lists
   every image the capture farm shows: its bytes, its natural size, the slot
   it sits in (CSS px in the 640-px page layout), and its `fill` — how its
   pixels compare with the slot's largest footprint (scripts/lib/right-size.mjs,
   3.75× the slot). A fill under 1 is upscaled on the largest displays; over
   2 it carries more than four times the pixels any view can show, and wants
   a right-sized sibling.

     node scripts/bench/image-audit.mjs [--dist dist | --url https://…]
       [--viewport 1440x900@2] [--top 40] [--json out.json]            */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FOOTPRINT_FACTOR } from "../lib/right-size.mjs";
import { chromeExecutable, loadPlaywright, parseArgs } from "./browser.mjs";
import { serve } from "./serve.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = parseArgs();
const [, width, height, dpr] = /^(\d+)x(\d+)@([\d.]+)$/.exec(args.viewport || "1440x900@2") ?? [];
if (!width) throw new Error('bad --viewport (want "1440x900@2")');

const server = args.url ? null : await serve(resolve(ROOT, args.dist || "dist"));
const origin = (args.url || server.url).replace(/\/$/, "");
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: chromeExecutable(), headless: true });

let found;
try {
  const context = await browser.newContext({
    viewport: { width: Number(width), height: Number(height) },
    deviceScaleFactor: Number(dpr),
  });
  const page = await context.newPage();
  await page.goto(`${origin}/`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(
    () =>
      document.querySelector('.bstage[aria-busy="false"]') &&
      document.querySelector(".bstage__canvas"),
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(2000);
  found = await page.evaluate((factor) => {
    const resources = new Map();
    for (const entry of performance.getEntriesByType("resource")) {
      if (!/\.(jpe?g|png|webp|avif|gif|svg)(\?|$)/i.test(entry.name)) continue;
      const known = resources.get(entry.name) ?? { bytes: 0, network: 0, fetches: 0 };
      known.bytes = Math.max(known.bytes, entry.encodedBodySize);
      known.network += entry.transferSize;
      known.fetches += 1;
      resources.set(entry.name, known);
    }
    const slots = new Map();
    for (const img of document.querySelectorAll("[data-capture-farm] img")) {
      const src = img.currentSrc || img.src;
      if (!src || !img.naturalWidth) continue;
      const rect = img.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const cover = getComputedStyle(img).objectFit === "cover";
      // Source pixels per pixel of the slot's largest footprint, along the
      // side that binds: both for a cover-cropped slot, the width otherwise.
      const across = img.naturalWidth / (rect.width * factor);
      const down = img.naturalHeight / (rect.height * factor);
      const fill = cover ? Math.min(across, down) : across;
      const known = slots.get(src);
      // A picture used in several slots is sized by the most demanding one.
      if (!known || fill < known.fill) {
        slots.set(src, {
          natural: `${img.naturalWidth}x${img.naturalHeight}`,
          slot: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          fill,
        });
      }
    }
    return [...resources.entries()].map(([name, resource]) => ({
      name: name.replace(location.origin, ""),
      ...resource,
      ...(slots.get(name) ?? {}),
    }));
  }, FOOTPRINT_FACTOR);
  await context.close();
} finally {
  await browser.close();
  await server?.close();
}

const kb = (bytes) => Math.round(bytes / 1024);
const group = (name) =>
  name.startsWith("/media/thumbs/")
    ? "media thumbs"
    : name.startsWith("/images/projects/")
      ? "project artwork"
      : "everything else";
const totals = new Map();
for (const image of found) {
  const total = totals.get(group(image.name)) ?? { count: 0, bytes: 0, oversized: 0, upscaled: 0 };
  total.count += 1;
  total.bytes += image.bytes;
  if (image.fill > 2) total.oversized += image.bytes;
  if (image.fill < 1) total.upscaled += 1;
  totals.set(group(image.name), total);
}
const all = [...totals.values()];
const sum = (key) => all.reduce((total, entry) => total + entry[key], 0);

console.log(
  `${origin} at ${width}x${height}@${dpr}: ${found.length} images, ${kb(sum("bytes"))} KB before the book opens ` +
    `(${kb(found.reduce((total, image) => total + image.network, 0))} KB over the network)`,
);
for (const [name, total] of totals) {
  console.log(
    `  ${name.padEnd(16)} ${String(total.count).padStart(3)} images ${String(kb(total.bytes)).padStart(5)} KB` +
      `   ${kb(total.oversized)} KB in pictures over 2× their slot's footprint` +
      (total.upscaled ? `   ${total.upscaled} under 1×` : ""),
  );
}
console.log("\n   KB  fetches  natural     slot (CSS px)  fill   image");
for (const image of [...found].sort((a, b) => b.bytes - a.bytes).slice(0, Number(args.top || 40))) {
  console.log(
    `${String(kb(image.bytes)).padStart(5)}  ${String(image.fetches).padStart(7)}  ` +
      `${(image.natural ?? "—").padEnd(10)}  ${(image.slot ?? "—").padEnd(13)}  ` +
      `${image.fill === undefined ? "    —" : `${image.fill.toFixed(1).padStart(4)}×`}  ${image.name}`,
  );
}
if (args.json) writeFileSync(resolve(args.json), `${JSON.stringify(found, null, 1)}\n`);
