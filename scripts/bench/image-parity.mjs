/* Before/after picture parity for image changes: right-sized variants,
   re-encodes, a new artwork pipeline.

   Reads the book's own page textures and the resting DOM spread from two
   Vite DEV servers — a `before` checkout and an `after` one — and scores
   every <img> that shows a media thumb or project artwork with SSIM. Dev
   servers, because the script imports /src/book3d/pageTextures.tsx inside
   the page: that is the module instance the app itself is using, so
   getPageTexture(key).image is the very canvas the book draws with, and no
   hook in the app is needed.

   Read the crops, not just the scores. A re-encode at the same size should
   score 0.99 and up. A resize will not, and that is not damage: Chrome and
   Firefox shrink a large image with a cheap filter that leaves fine detail
   jagged, and a right-sized file comes out smoother, so a screenshot's
   lettering can score 0.8 against its jagged self. What a low score must
   never show is a different picture, a shifted crop, blur, or banding.

     git worktree add ../before origin/main
     (cd ../before && npm ci && npx vite --port 5201 --strictPort) &
     npx vite --port 5202 --strictPort &
     node scripts/bench/image-parity.mjs \
       --before http://localhost:5201 --after http://localhost:5202

   [--viewports 1440x900@2,2560x1440@2] [--min <ssim>] [--match <path regex>]
   [--out bench-results/image-parity] [--engine chromium|webkit|firefox]

   Browsers shrink a large image in different ways, so the same change can
   score differently in each: --engine webkit or firefox runs Playwright's
   own build of that engine (`npx playwright-core install webkit firefox`).

   Writes before / after / difference crops and report.md under --out and
   prints the report. With --min it exits 1 when any region scores lower;
   without it, only a missing or resized region fails the run. */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromeExecutable, loadPlaywright, parseArgs } from "./browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = parseArgs();
if (!args.before || !args.after) {
  console.error(
    "usage: node scripts/bench/image-parity.mjs --before <dev server> --after <dev server>",
  );
  process.exit(1);
}
const MIN = args.min === undefined ? null : Number(args.min);
const MATCH = args.match || "^/(media/thumbs|images/projects)/";
const OUT = resolve(ROOT, args.out || "bench-results/image-parity");
const VIEWPORTS = (args.viewports || "1440x900@2,2560x1440@2").split(",").map((spec) => {
  const [, width, height, dpr] = /^(\d+)x(\d+)@([\d.]+)$/.exec(spec) ?? [];
  if (!width) throw new Error(`bad viewport "${spec}" (want 1440x900@2)`);
  return { spec, width: Number(width), height: Number(height), dpr: Number(dpr) };
});
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/* ---------- reading one side ---------- */

const ready = (page) =>
  page.waitForFunction(
    () =>
      document.querySelector('.bstage[aria-busy="false"]') &&
      document.querySelector(".bstage__canvas"),
    null,
    { timeout: 180000 },
  );

/** Every page texture that shows a matching image, with where each one sits. */
function readTextures(page) {
  return page.evaluate(async (pattern) => {
    const match = new RegExp(pattern);
    const pathOf = (img) => new URL(img.currentSrc || img.src, location.href).pathname;
    // One id for a picture and its right-sized sibling.
    const idOf = (path) =>
      path.replace(/\.w\d+\.webp$/, "").replace(/\.[a-z0-9]+$/i, "");
    const textures = await import("/src/book3d/pageTextures.tsx");
    const out = [];
    for (const key of textures.ALL_PAGE_KEYS) {
      const face = document.querySelector(
        `[data-capture-farm] [data-capture-key="${CSS.escape(key)}"]`,
      );
      if (!face) continue;
      const images = [...face.querySelectorAll("img")].filter((img) =>
        match.test(pathOf(img)),
      );
      if (images.length === 0) continue;
      const canvas = textures.getPageTexture(key)?.image;
      if (!canvas) throw new Error(`no texture for ${key}`);
      const box = face.getBoundingClientRect();
      const scale = canvas.width / box.width;
      // The part of a picture the page shows: clipped by the page itself and
      // by any scrolling or overflow-hidden box between the two.
      const shown = (img) => {
        const rect = img.getBoundingClientRect();
        const part = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        for (let node = img.parentElement; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (node === face || style.overflowX !== "visible" || style.overflowY !== "visible") {
            const clip = node.getBoundingClientRect();
            part.left = Math.max(part.left, clip.left);
            part.top = Math.max(part.top, clip.top);
            part.right = Math.min(part.right, clip.right);
            part.bottom = Math.min(part.bottom, clip.bottom);
          }
          if (node === face) break;
        }
        return part;
      };
      const regions = images
        .map((img) => {
          const part = shown(img);
          return {
            id: idOf(pathOf(img)),
            x: Math.round((part.left - box.left) * scale),
            y: Math.round((part.top - box.top) * scale),
            width: Math.round((part.right - part.left) * scale),
            height: Math.round((part.bottom - part.top) * scale),
          };
        })
        .filter((region) => region.width >= 16 && region.height >= 16);
      if (regions.length === 0) continue;
      out.push({ where: key, png: canvas.toDataURL("image/png"), regions });
    }
    return out;
  }, MATCH);
}

async function turn(page) {
  const busy = () =>
    page.evaluate(() => document.querySelector(".bstage")?.getAttribute("aria-busy"));
  await page.keyboard.press("ArrowRight");
  const started = Date.now();
  while (Date.now() - started < 800 && (await busy()) !== "true") await sleep(10);
  await page.waitForFunction(
    () => document.querySelector(".bstage")?.getAttribute("aria-busy") === "false",
    null,
    { timeout: 30000 },
  );
}

/** Screenshots of every matching image on each spread, as live DOM at rest. */
async function readSpreads(page, viewport) {
  // The pointer over the book flattens it, and the flat spread is real DOM.
  await page.mouse.move(viewport.width / 2, viewport.height / 2, { steps: 4 });
  const spreads = await page.evaluate(
    async () => (await import("/src/magazine/folio.ts")).SPREADS.length,
  );
  const out = [];
  for (let spread = 0; spread < spreads; spread += 1) {
    if (spread > 0) await turn(page);
    // The handoff has finished and the pictures have arrived.
    await page.waitForFunction(
      (pattern) => {
        const overlay = document.querySelector(".bstage__spread");
        if (!overlay || getComputedStyle(overlay).opacity !== "1") return false;
        const match = new RegExp(pattern);
        return [...overlay.querySelectorAll("img")]
          .filter((img) => match.test(new URL(img.currentSrc || img.src, location.href).pathname))
          .every((img) => img.complete && img.naturalWidth > 0);
      },
      MATCH,
      { timeout: 30000 },
    );
    // The Library's wall drifts forever, so the live page never holds still.
    // Park every endless loop at its start and finish everything else: both
    // sides are then looking at the same moment.
    await page.evaluate(async () => {
      for (const animation of document.getAnimations()) {
        if (animation.effect?.getComputedTiming().iterations === Infinity) {
          animation.pause();
          animation.currentTime = 0;
        } else {
          animation.finish();
        }
      }
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    const measure = () => page.evaluate((pattern) => {
      const match = new RegExp(pattern);
      const pathOf = (img) => new URL(img.currentSrc || img.src, location.href).pathname;
      const idOf = (path) =>
        path.replace(/\.w\d+\.webp$/, "").replace(/\.[a-z0-9]+$/i, "");
      const overlay = document.querySelector(".bstage__spread");
      const shown = (img) => {
        const rect = img.getBoundingClientRect();
        const part = {
          left: Math.max(rect.left, 0),
          top: Math.max(rect.top, 0),
          right: Math.min(rect.right, innerWidth),
          bottom: Math.min(rect.bottom, innerHeight),
        };
        for (let node = img.parentElement; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (node === overlay || style.overflowX !== "visible" || style.overflowY !== "visible") {
            const clip = node.getBoundingClientRect();
            part.left = Math.max(part.left, clip.left);
            part.top = Math.max(part.top, clip.top);
            part.right = Math.min(part.right, clip.right);
            part.bottom = Math.min(part.bottom, clip.bottom);
          }
          if (node === overlay) break;
        }
        return part;
      };
      return [...overlay.querySelectorAll("img")]
        .filter((img) => match.test(pathOf(img)))
        .map((img) => {
          const part = shown(img);
          // Whole CSS pixels inside the picture, so no neighbour bleeds in.
          const x = Math.ceil(part.left);
          const y = Math.ceil(part.top);
          return {
            id: idOf(pathOf(img)),
            x,
            y,
            width: Math.floor(part.right) - x,
            height: Math.floor(part.bottom) - y,
          };
        })
        .filter((region) => region.width >= 8 && region.height >= 8);
    }, MATCH);
    // Wait for the layout to stop moving: three identical readings in a row.
    let regions = await measure();
    for (let same = 0, tries = 0; same < 3 && tries < 40; tries += 1) {
      await sleep(250);
      const next = await measure();
      same = JSON.stringify(next) === JSON.stringify(regions) ? same + 1 : 0;
      regions = next;
    }
    for (const region of regions) {
      out.push({
        where: `spread ${spread}`,
        id: region.id,
        png: await page.screenshot({ clip: region, type: "png" }),
      });
    }
  }
  return out;
}

async function readSide(browser, origin, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`[${origin}] ${error.message}`));
  await page.goto(`${origin}/`, { waitUntil: "load", timeout: 120000 });
  await ready(page);
  const textures = await readTextures(page);
  const spreads = await readSpreads(page, viewport);
  await context.close();
  return { textures, spreads };
}

/* ---------- scoring ---------- */

const KERNEL = (() => {
  const taps = Array.from({ length: 11 }, (_, i) => Math.exp(-((i - 5) ** 2) / (2 * 1.5 ** 2)));
  const sum = taps.reduce((a, b) => a + b, 0);
  return taps.map((tap) => tap / sum);
})();

/** 11-tap Gaussian (σ 1.5) over the valid area, rows then columns. */
function blur(values, width, height) {
  const w = width - 10;
  const h = height - 10;
  const rows = new Float64Array(w * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let k = 0; k < 11; k += 1) sum += values[y * width + x + k] * KERNEL[k];
      rows[y * w + x] = sum;
    }
  }
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let k = 0; k < 11; k += 1) sum += rows[(y + k) * w + x] * KERNEL[k];
      out[y * w + x] = sum;
    }
  }
  return out;
}

/** Mean SSIM of two 8-bit luma planes (Wang et al., K1 0.01, K2 0.03). */
function ssim(a, b, width, height) {
  if (width < 11 || height < 11) return 1;
  const size = width * height;
  const aa = new Float64Array(size);
  const bb = new Float64Array(size);
  const ab = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    aa[i] = a[i] * a[i];
    bb[i] = b[i] * b[i];
    ab[i] = a[i] * b[i];
  }
  const [ma, mb, maa, mbb, mab] = [a, b, aa, bb, ab].map((plane) => blur(plane, width, height));
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let total = 0;
  for (let i = 0; i < ma.length; i += 1) {
    const va = maa[i] - ma[i] * ma[i];
    const vb = mbb[i] - mb[i] * mb[i];
    const cov = mab[i] - ma[i] * mb[i];
    total +=
      ((2 * ma[i] * mb[i] + c1) * (2 * cov + c2)) /
      ((ma[i] * ma[i] + mb[i] * mb[i] + c1) * (va + vb + c2));
  }
  return total / ma.length;
}

async function pixels(png, region) {
  let image = sharp(png).removeAlpha();
  if (region) image = image.extract(region);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function luma({ data, width, height }) {
  const out = new Float64Array(width * height);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];
  }
  return out;
}

const toPng = ({ data, width, height }) =>
  sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();

/** Scores one picture and writes its before / after / difference crops. */
async function score(before, after, file) {
  if (before.width !== after.width || before.height !== after.height) {
    return { size: `${before.width}x${before.height} vs ${after.width}x${after.height}`, ssim: 0, mean: NaN, max: NaN };
  }
  let sum = 0;
  let max = 0;
  const difference = Buffer.alloc(before.data.length);
  for (let i = 0; i < before.data.length; i += 1) {
    const delta = Math.abs(before.data[i] - after.data[i]);
    sum += delta;
    if (delta > max) max = delta;
    // Eight times over, so a difference no eye could find is findable.
    difference[i] = Math.min(255, delta * 8);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}-before.png`, await toPng(before));
  writeFileSync(`${file}-after.png`, await toPng(after));
  writeFileSync(`${file}-diff.png`, await toPng({ ...before, data: difference }));
  return {
    size: `${before.width}x${before.height}`,
    ssim: ssim(luma(before), luma(after), before.width, before.height),
    mean: sum / before.data.length,
    max,
  };
}

const dataUrlToBuffer = (url) => Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
const fileSafe = (text) => text.replace(/^\/+/, "").replace(/[^a-z0-9.-]+/gi, "_");
const clampRegion = (region, image) => {
  const left = Math.min(Math.max(0, region.x), image.width - 1);
  const top = Math.min(Math.max(0, region.y), image.height - 1);
  return {
    left,
    top,
    width: Math.max(1, Math.min(image.width - left, region.width)),
    height: Math.max(1, Math.min(image.height - top, region.height)),
  };
};

/* ---------- run ---------- */

const ENGINE = args.engine || "chromium";
const playwright = await loadPlaywright();
if (!["chromium", "webkit", "firefox"].includes(ENGINE)) throw new Error(`unknown --engine ${ENGINE}`);
const browser = await playwright[ENGINE].launch(
  ENGINE === "chromium"
    ? { executablePath: chromeExecutable(), headless: true }
    : { headless: true },
);
rmSync(OUT, { recursive: true, force: true });
const rows = [];
try {
  for (const viewport of VIEWPORTS) {
    console.error(`reading ${viewport.spec} …`);
    const before = await readSide(browser, args.before, viewport);
    const after = await readSide(browser, args.after, viewport);

    for (const face of before.textures) {
      const other = after.textures.find((entry) => entry.where === face.where);
      if (!other) throw new Error(`${viewport.spec}: page ${face.where} has no pictures after`);
      const [a, b] = [dataUrlToBuffer(face.png), dataUrlToBuffer(other.png)];
      const meta = await sharp(a).metadata();
      const remaining = [...other.regions];
      for (const [index, region] of face.regions.entries()) {
        const at = remaining.findIndex((entry) => entry.id === region.id);
        if (at < 0) throw new Error(`${viewport.spec}: ${region.id} missing after on ${face.where}`);
        const [twin] = remaining.splice(at, 1);
        const result = await score(
          await pixels(a, clampRegion(region, meta)),
          await pixels(b, clampRegion(twin, meta)),
          join(OUT, viewport.spec, `texture-${fileSafe(face.where)}-${index}-${fileSafe(region.id)}`),
        );
        rows.push({ viewport: viewport.spec, surface: "texture", where: face.where, id: region.id, ...result });
      }
    }

    const remaining = [...after.spreads];
    for (const [index, shot] of before.spreads.entries()) {
      const at = remaining.findIndex((entry) => entry.where === shot.where && entry.id === shot.id);
      if (at < 0) throw new Error(`${viewport.spec}: ${shot.id} missing after on ${shot.where}`);
      const [twin] = remaining.splice(at, 1);
      const result = await score(
        await pixels(shot.png),
        await pixels(twin.png),
        join(OUT, viewport.spec, `dom-${fileSafe(shot.where)}-${index}-${fileSafe(shot.id)}`),
      );
      rows.push({ viewport: viewport.spec, surface: "DOM", where: shot.where, id: shot.id, ...result });
    }
  }
} finally {
  await browser.close();
}

// A region whose size changed scores 0: the layout moved, whatever --min says.
const failing = rows.filter((row) => !(row.ssim >= (MIN ?? Number.MIN_VALUE)));
const worst = (list) => list.reduce((low, row) => (row.ssim < low.ssim ? row : low), list[0]);
const lines = [
  `# Image parity (${ENGINE}): ${args.before} → ${args.after}`,
  "",
  MIN === null
    ? `${rows.length} picture regions; ${rows.filter((row) => row.ssim < 0.99).length} under SSIM 0.99.`
    : `${rows.length} picture regions; ${failing.length} under SSIM ${MIN}.`,
  "",
  "| Viewport | Surface | Regions | Lowest SSIM | Mean SSIM | Largest mean difference (of 255) |",
  "| --- | --- | --- | --- | --- | --- |",
];
for (const viewport of VIEWPORTS) {
  for (const surface of ["texture", "DOM"]) {
    const group = rows.filter((row) => row.viewport === viewport.spec && row.surface === surface);
    if (group.length === 0) continue;
    const low = worst(group);
    lines.push(
      `| ${viewport.spec} | ${surface} | ${group.length} | ${low.ssim.toFixed(4)} (${low.id.split("/").pop()}) | ` +
        `${(group.reduce((sum, row) => sum + row.ssim, 0) / group.length).toFixed(4)} | ` +
        `${Math.max(...group.map((row) => row.mean)).toFixed(2)} |`,
    );
  }
}
lines.push("", "| Viewport | Surface | Where | Picture | Size | SSIM | Mean diff | Max diff |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const row of [...rows].sort((a, b) => a.ssim - b.ssim)) {
  lines.push(
    `| ${row.viewport} | ${row.surface} | ${row.where} | ${row.id.split("/").pop()} | ${row.size} | ` +
      `${row.ssim.toFixed(4)}${failing.includes(row) ? " ✗" : ""} | ${row.mean.toFixed(2)} | ${row.max} |`,
  );
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "report.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
console.error(`\ncrops and report.md: ${OUT}`);
process.exit(failing.length > 0 || rows.length === 0 ? 1 : 0);
