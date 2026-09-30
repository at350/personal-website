/* Benchmark harness for the book. Drives Chrome for Testing (headless, real
   GPU) through scripted scenarios against a production build, the way a
   visitor meets it: served gzip + cacheable like GitHub Pages, from a cold
   profile each run. See "Performance" in README.md.

   npm run build
   node scripts/bench/bench.mjs --dist dist --label mine --runs 3 \
     --scenarios load,idle,turns,riffle,drag,ignite,drift,mobile --cpu 1,4

   --dist <dir>   serve this build (default: dist) — or --url <origin>
   --cpu 1,4      CPU throttle rates (4 approximates a mid-range laptop)
   --append 1     add runs to an existing --out file (used by ab.mjs)
   Results land in bench-results/<label>.json; summarize.mjs prints them. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromeExecutable, loadPlaywright, parseArgs } from "./browser.mjs";
import { serve } from "./serve.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const INSTRUMENT = readFileSync(join(HERE, "instrument.js"), "utf8");

const args = parseArgs();
const LABEL = args.label || "run";
const RUNS = Number(args.runs || 3);
const SCENARIOS = (args.scenarios || "load,idle,turns,riffle,drag,ignite,drift,mobile").split(",");
const CPU_RATES = (args.cpu || "1").split(",").map(Number);
const OUT = args.out || join(ROOT, "bench-results", `${LABEL}.json`);
const VERBOSE = Boolean(args.verbose);
let URL_BASE = args.url || "";
const { chromium } = await loadPlaywright();
const CHROME = chromeExecutable();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${LABEL}]`, ...a);

async function selectMode(page, name) {
  const dock = await page.evaluate(() => {
    const r = document.querySelector(".experience-dock").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  // The dock only fans out its buttons while hovered.
  await page.mouse.move(dock.x, dock.y, { steps: 5 });
  await sleep(800);
  const r = await page.evaluate((n) => {
    const el = [...document.querySelectorAll(".experience-dock__mode")].find((b) =>
      b.getAttribute("aria-label").startsWith(n),
    );
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, name);
  await page.mouse.move(r.x, r.y, { steps: 3 });
  await sleep(200);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(
    (n) => document.querySelector(".bstage")?.dataset.experience === n.toLowerCase(),
    name,
    { timeout: 10000 },
  );
}

/* ---------- OS-level CPU accounting for the browser's process tree ---------- */
function parseCpuTime(s) {
  // [[dd-]hh:]mm:ss.ss
  let days = 0;
  if (s.includes("-")) {
    const [d, rest] = s.split("-");
    days = Number(d);
    s = rest;
  }
  const parts = s.split(":").map(Number);
  let secs = 0;
  for (const p of parts) secs = secs * 60 + p;
  return secs + days * 86400;
}
function processTree(rootPid) {
  const out = execFileSync("ps", ["-A", "-o", "pid=,ppid=,time=,command="], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      return m && { pid: +m[1], ppid: +m[2], cpu: parseCpuTime(m[3]), cmd: m[4] };
    })
    .filter(Boolean);
  const kids = new Map();
  for (const r of rows) {
    if (!kids.has(r.ppid)) kids.set(r.ppid, []);
    kids.get(r.ppid).push(r);
  }
  const acc = { gpu: 0, renderer: 0, browser: 0, other: 0 };
  const visit = (pid) => {
    for (const r of kids.get(pid) || []) {
      const type = r.cmd.match(/--type=([\w-]+)/)?.[1];
      if (type === "gpu-process") acc.gpu += r.cpu;
      else if (type === "renderer") acc.renderer += r.cpu;
      else acc.other += r.cpu;
      visit(r.pid);
    }
  };
  const self = rows.find((r) => r.pid === rootPid);
  if (self) acc.browser = self.cpu;
  visit(rootPid);
  return acc;
}

/* System-wide Apple GPU utilization (noisy: includes other apps). */
function gpuUtil() {
  try {
    const out = execFileSync("ioreg", ["-r", "-d", "1", "-w", "0", "-c", "IOAccelerator"], {
      encoding: "utf8",
    });
    const m = out.match(/"Device Utilization %"=(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}
function startGpuSampler() {
  const samples = [];
  const id = setInterval(() => {
    const v = gpuUtil();
    if (v !== null) samples.push(v);
  }, 200);
  return () => {
    clearInterval(id);
    return samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
  };
}

/* ---------- stats ---------- */
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const median = (arr) => {
  const v = arr.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
function frameStats(rec) {
  const t = rec.t || [];
  const deltas = [];
  for (let i = 1; i < t.length; i += 1) deltas.push(t[i] - t[i - 1]);
  const duration = t.length > 1 ? t[t.length - 1] - t[0] : 0;
  const drawn = (rec.draws || []).filter((d) => d > 0).length;
  const draws = (rec.draws || []).reduce((a, b) => a + b, 0);
  const uploads = (rec.uploads || []).reduce((a, b) => a + b, 0);
  return {
    frames: t.length,
    durationMs: duration,
    fps: duration ? ((t.length - 1) / duration) * 1000 : 0,
    p50: pct(deltas, 50),
    p95: pct(deltas, 95),
    p99: pct(deltas, 99),
    max: deltas.length ? Math.max(...deltas) : null,
    // a frame is "janky" when it took longer than 1.5 vsyncs
    jankPct: deltas.length ? (deltas.filter((d) => d > 25).length / deltas.length) * 100 : 0,
    renderedFrames: drawn,
    renderedPerSec: duration ? (drawn / duration) * 1000 : 0,
    drawsPerFrame: t.length ? draws / t.length : 0,
    uploads,
  };
}

/* ---------- browser plumbing ---------- */
let launchSeq = 0;
function findBrowserPid(marker) {
  const out = execFileSync("ps", ["-A", "-o", "pid=,command="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  for (const line of out.split("\n")) {
    if (line.includes(marker) && !line.includes("--type=")) return Number(line.trim().split(/\s+/)[0]);
  }
  return null;
}
async function launch() {
  const marker = `--bench-marker=${process.pid}-${launchSeq++}`;
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      marker,
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--no-first-run",
      "--hide-scrollbars",
      "--mute-audio",
    ],
  });
  browser.__pid = findBrowserPid(marker);
  return browser;
}

async function newPage(browser, { mobile = false, cpu = 1 } = {}) {
  const context = await browser.newContext(
    mobile
      ? {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
        }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  );
  await context.addInitScript(INSTRUMENT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable", { timeDomain: "timeTicks" });
  if (cpu !== 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  if (VERBOSE) page.on("console", (m) => console.log("  [page]", m.type(), m.text()));
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  return { context, page, cdp };
}

async function cdpMetrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}

/** Everything the harness measures over a window of interaction. */
async function measureWindow(ctx, fn) {
  const { page, cdp, browser } = ctx;
  const pid = browser.__pid;
  const m0 = await cdpMetrics(cdp);
  const p0 = pid ? processTree(pid) : null;
  const lt0 = await page.evaluate(() => window.__perf.longTasks.length);
  const stopGpu = startGpuSampler();
  await page.evaluate(() => window.__perf.startFrames());
  const wall0 = Date.now();
  const extra = (await fn()) || {};
  const wall = Date.now() - wall0;
  const rec = await page.evaluate(() => window.__perf.stopFrames());
  const gpuAvg = stopGpu();
  const m1 = await cdpMetrics(cdp);
  const p1 = pid ? processTree(pid) : null;
  const longTasks = await page.evaluate((n) => window.__perf.longTasks.slice(n), lt0);
  const fs = frameStats(rec);
  const secs = wall / 1000;
  return {
    ...fs,
    wallMs: wall,
    mainThreadMs: (m1.TaskDuration - m0.TaskDuration) * 1000,
    scriptMs: (m1.ScriptDuration - m0.ScriptDuration) * 1000,
    layoutMs: (m1.LayoutDuration - m0.LayoutDuration) * 1000,
    styleMs: (m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000,
    mainThreadPerFrameMs: fs.frames ? ((m1.TaskDuration - m0.TaskDuration) * 1000) / fs.frames : null,
    rendererCpuPct: p0 ? ((p1.renderer - p0.renderer) / secs) * 100 : null,
    gpuProcCpuPct: p0 ? ((p1.gpu - p0.gpu) / secs) * 100 : null,
    browserCpuPct: p0 ? ((p1.browser - p0.browser) / secs) * 100 : null,
    gpuUtilPct: gpuAvg,
    longTaskCount: longTasks.length,
    longTaskMs: longTasks.reduce((a, [, d]) => a + d, 0),
    blockingMs: longTasks.reduce((a, [, d]) => a + Math.max(0, d - 50), 0),
    heapMB: m1.JSHeapUsedSize / 1048576,
    ...extra,
  };
}

async function waitReady(page, timeout = 90000) {
  await page.waitForFunction(() => window.__perf?.marks?.ready, null, { timeout, polling: 50 });
}

async function openBook(ctx, path = "/") {
  await ctx.page.goto(URL_BASE + path, { waitUntil: "load", timeout: 90000 });
  await waitReady(ctx.page);
}

async function busy(page) {
  return page.evaluate(() => document.querySelector(".bstage")?.getAttribute("aria-busy"));
}

async function waitTurn(page, timeout = 15000) {
  const t0 = Date.now();
  // wait until the stage reports busy (turn launched), then until it rests
  while (Date.now() - t0 < 600 && (await busy(page)) !== "true") await sleep(10);
  await page.waitForFunction(
    () => document.querySelector(".bstage")?.getAttribute("aria-busy") === "false",
    null,
    { timeout, polling: 16 },
  );
}

async function hoverBook(page) {
  await page.mouse.move(720, 450, { steps: 4 });
}

/* ---------- scenarios ---------- */
const scenarios = {
  async load(ctx) {
    const { page, cdp } = ctx;
    await page.goto(URL_BASE + "/", { waitUntil: "load", timeout: 90000 });
    await waitReady(page);
    await sleep(1500);
    // Count live DOM, not detached capture clones still awaiting collection.
    await cdp.send("HeapProfiler.collectGarbage");
    const m = await cdpMetrics(cdp);
    const r = await page.evaluate(() => {
      const P = window.__perf;
      const nav = performance.getEntriesByType("navigation")[0];
      const res = performance.getEntriesByType("resource");
      const sum = (f) => res.filter(f).reduce((a, e) => a + (e.encodedBodySize || 0), 0);
      const readyAt = P.marks.ready;
      const caps = P.captureTimes.filter(([, text]) => /^\s*0?[1-9]|^\s*[1-9]/.test(text) && !/^00/.test(text));
      return {
        fcp: P.fcp,
        lcp: P.lcp,
        cls: P.cls,
        domContentLoaded: nav.domContentLoadedEventEnd,
        loadEvent: nav.loadEventEnd,
        stageMounted: P.marks.stage,
        firstCapture: caps.length ? caps[0][0] : null,
        lastCapture: caps.length ? caps[caps.length - 1][0] : null,
        ready: readyAt,
        firstDraw: P.firstDraw,
        blockingToReadyMs: P.longTasks
          .filter(([s]) => s < readyAt + 1000)
          .reduce((a, [, d]) => a + Math.max(0, d - 50), 0),
        longTasksToReady: P.longTasks.filter(([s]) => s < readyAt + 1000).length,
        maxLongTaskMs: P.longTasks.reduce((a, [, d]) => Math.max(a, d), 0),
        jsKB: sum((e) => e.initiatorType === "script" || /\.js(\?|$)/.test(e.name)) / 1024,
        cssKB: sum((e) => /\.css(\?|$)/.test(e.name)) / 1024,
        fontKB: sum((e) => /\.(woff2?|ttf|otf)(\?|$)/.test(e.name)) / 1024,
        imgKB: sum((e) => /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/.test(e.name)) / 1024,
        totalKB: (sum(() => true) + (nav.encodedBodySize || 0)) / 1024,
        requests: res.length + 1,
        uploadsAtReady: P.uploads,
        uploadMPixAtReady: P.uploadPixels / 1e6,
      };
    });
    r.captureSpanMs = r.firstCapture && r.lastCapture ? r.lastCapture - (r.stageMounted ?? r.firstCapture) : null;
    r.mainThreadMsToSettle = m.TaskDuration * 1000;
    r.scriptMsToSettle = m.ScriptDuration * 1000;
    r.heapMB = m.JSHeapUsedSize / 1048576;
    r.domNodes = m.Nodes;
    return r;
  },

  async idle(ctx) {
    const { page } = ctx;
    await openBook(ctx);
    await hoverBook(page);
    // 4-9 s after the flatten: its springs are still finishing their
    // sub-pixel tails, which the render gate draws.
    await sleep(4000);
    const flat = await measureWindow(ctx, () => sleep(5000));
    // 12-17 s: settled.
    await sleep(3000);
    const settled = await measureWindow(ctx, () => sleep(5000));
    // Pointer leaves the book: the display stance breathes.
    await page.mouse.move(1420, 30, { steps: 4 });
    await sleep(4000);
    const posed = await measureWindow(ctx, () => sleep(5000));
    return { flat, settled, posed };
  },

  async turns(ctx) {
    const { page } = ctx;
    await openBook(ctx);
    await hoverBook(page);
    await sleep(2500);
    const perTurn = [];
    const win = await measureWindow(ctx, async () => {
      for (let i = 0; i < 6; i += 1) {
        const t0 = Date.now();
        await page.keyboard.press("ArrowRight");
        await waitTurn(page);
        perTurn.push(Date.now() - t0);
      }
    });
    win.turnMs = median(perTurn);
    return win;
  },

  async riffle(ctx) {
    const { page } = ctx;
    await openBook(ctx);
    await hoverBook(page);
    await sleep(2500);
    const legs = [];
    const win = await measureWindow(ctx, async () => {
      for (const key of ["End", "Home"]) {
        const t0 = Date.now();
        await page.keyboard.press(key);
        await waitTurn(page, 20000);
        legs.push(Date.now() - t0);
      }
    });
    win.legMs = median(legs);
    return win;
  },

  async drag(ctx) {
    const { page } = ctx;
    await openBook(ctx);
    await hoverBook(page);
    await sleep(2500);
    const win = await measureWindow(ctx, async () => {
      for (let i = 0; i < 3; i += 1) {
        const box = await page.evaluate(() => {
          const r = document.querySelector(".bstage__edge--fore").getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        await page.mouse.move(box.x, box.y - 60, { steps: 2 });
        await page.mouse.down();
        await page.mouse.move(box.x - 500, box.y - 90, { steps: 25 });
        await page.mouse.move(box.x - 1000, box.y - 60, { steps: 25 });
        await page.mouse.up();
        await waitTurn(page);
        await hoverBook(page);
        await sleep(400);
      }
    });
    return win;
  },

  async ignite(ctx) {
    const { page } = ctx;
    await openBook(ctx);
    await hoverBook(page);
    await sleep(1500);
    // Open to an inner spread so both faces carry paper.
    await page.keyboard.press("ArrowRight");
    await waitTurn(page);
    await sleep(800);
    await selectMode(page, "Ignite");
    await page.waitForSelector(".bstage--ignite-ready", { timeout: 20000 });
    await sleep(800);
    const win = await measureWindow(ctx, async () => {
      await page.mouse.move(820, 450, { steps: 3 });
      await page.mouse.down();
      const t0 = Date.now();
      let i = 0;
      while (Date.now() - t0 < 8000) {
        const a = i * 0.15;
        await page.mouse.move(720 + Math.cos(a) * 380, 450 + Math.sin(a * 1.3) * 250, { steps: 1 });
        await sleep(30);
        i += 1;
      }
      await page.mouse.up();
      await sleep(1000);
      return {
        igniteProgress: await page.evaluate(
          () => document.querySelector(".ignite-hud__track")?.getAttribute("aria-valuenow"),
        ),
      };
    });
    return win;
  },

  async drift(ctx) {
    const { page } = ctx;
    await openBook(ctx);
    await hoverBook(page);
    await sleep(1500);
    await page.keyboard.press("ArrowRight");
    await waitTurn(page);
    await sleep(800);
    await selectMode(page, "Drift");
    await page.waitForSelector(".bstage--drift-ready", { timeout: 20000 });
    await sleep(1500);
    const adrift = await measureWindow(ctx, async () => {
      const t0 = Date.now();
      let i = 0;
      while (Date.now() - t0 < 8000) {
        const a = i * 0.12;
        await page.mouse.move(720 + Math.cos(a) * 420, 450 + Math.sin(a * 2) * 260, { steps: 1 });
        if (i % 60 === 30) {
          await page.mouse.down();
          await page.mouse.up();
        }
        await sleep(30);
        i += 1;
      }
    });
    await page.mouse.move(1420, 880, { steps: 3 });
    const t0 = Date.now();
    const landing = await measureWindow(ctx, async () => {
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector(".bstage--drift"), null, {
        timeout: 30000,
        polling: 16,
      });
      return { landMs: Date.now() - t0 };
    });
    return { adrift, landing };
  },

  async mobile(ctx) {
    const { page, cdp } = ctx;
    await page.goto(URL_BASE + "/", { waitUntil: "load", timeout: 90000 });
    await sleep(3000);
    const m = await cdpMetrics(cdp);
    const r = await page.evaluate(() => {
      const P = window.__perf;
      const nav = performance.getEntriesByType("navigation")[0];
      const res = performance.getEntriesByType("resource");
      const sum = (f) => res.filter(f).reduce((a, e) => a + (e.encodedBodySize || 0), 0);
      return {
        fcp: P.fcp,
        lcp: P.lcp,
        cls: P.cls,
        domContentLoaded: nav.domContentLoadedEventEnd,
        loadEvent: nav.loadEventEnd,
        blockingMs: P.longTasks.reduce((a, [, d]) => a + Math.max(0, d - 50), 0),
        longTasks: P.longTasks.length,
        jsKB: sum((e) => /\.js(\?|$)/.test(e.name)) / 1024,
        totalKB: (sum(() => true) + (nav.encodedBodySize || 0)) / 1024,
        requests: res.length + 1,
      };
    });
    r.mainThreadMs = m.TaskDuration * 1000;
    r.heapMB = m.JSHeapUsedSize / 1048576;
    return r;
  },
};

/* ---------- driver ---------- */
async function main() {
  let server = null;
  if (!URL_BASE) {
    server = await serve(resolve(ROOT, args.dist || "dist"));
    URL_BASE = server.url;
  }
  mkdirSync(dirname(OUT), { recursive: true });
  let results = { label: LABEL, url: URL_BASE, when: new Date().toISOString(), runs: {} };
  if (args.append) {
    try {
      results = JSON.parse(readFileSync(OUT, "utf8"));
    } catch {
      // First run of an A/B: start a fresh file.
    }
  }
  for (const scenario of SCENARIOS) {
    for (const cpu of CPU_RATES) {
      const key = `${scenario}@${cpu}x`;
      results.runs[key] = args.append ? results.runs[key] || [] : [];
      for (let run = 0; run < RUNS; run += 1) {
        const browser = await launch();
        try {
          const { context, page, cdp } = await newPage(browser, { mobile: scenario === "mobile", cpu });
          const t0 = Date.now();
          const r = await scenarios[scenario]({ browser, context, page, cdp });
          results.runs[key].push(r);
          log(`${key} run ${results.runs[key].length}/${args.append ? "+" : RUNS} (${((Date.now() - t0) / 1000).toFixed(1)}s)`, VERBOSE ? JSON.stringify(r) : "");
        } catch (error) {
          log(`${key} run ${run + 1} FAILED: ${error.message.split("\n")[0]}`);
          results.runs[key].push({ error: error.message.split("\n")[0] });
        } finally {
          await browser.close();
        }
        writeFileSync(OUT, JSON.stringify(results, null, 2));
      }
    }
  }
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  log(`wrote ${OUT}`);
  await server?.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
