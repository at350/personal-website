/* Traces one scenario and summarizes where the renderer's main thread spends
   its time: the top self-time functions of the sampled V8 CPU profile and
   the main-thread event mix (style, layout, paint, GC, …). Profile an
   unminified build to get readable function names:

   npx vite build --minify false --outDir /tmp/dist-prof && cp -R public/. /tmp/dist-prof/
   node scripts/bench/profile.mjs --dist /tmp/dist-prof --scenario load --cpu 4

   Scenarios: load, idle, posed, turns, riffle, ignite, drift; --mobile 1
   profiles the phone load. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromeExecutable, loadPlaywright, parseArgs } from "./browser.mjs";
import { serve } from "./serve.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const INSTRUMENT = readFileSync(join(HERE, "instrument.js"), "utf8");
const args = parseArgs();
const SCENARIO = args.scenario || "load";
const CPU = Number(args.cpu || 1);
const OUT = args.out || join(ROOT, "bench-results", `profile-${SCENARIO}-${CPU}x.json`);
const TOP = Number(args.top || 45);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = args.url ? null : await serve(resolve(ROOT, args.dist || "dist"));
const URL_BASE = args.url || server.url;
const { chromium } = await loadPlaywright();

async function selectMode(page, name) {
  const dock = await page.evaluate(() => {
    const r = document.querySelector(".experience-dock").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
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

const browser = await chromium.launch({
  executablePath: chromeExecutable(),
  headless: true,
  args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
});
const context = await browser.newContext(
  args.mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
);
await context.addInitScript(INSTRUMENT);
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
if (CPU !== 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });

const ready = () => page.waitForFunction(() => window.__perf?.marks?.ready, null, { timeout: 120000, polling: 50 });
const waitTurn = async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 600 && (await page.evaluate(() => document.querySelector(".bstage")?.getAttribute("aria-busy"))) !== "true") await sleep(10);
  await page.waitForFunction(() => document.querySelector(".bstage")?.getAttribute("aria-busy") === "false", null, { timeout: 20000, polling: 16 });
};

const categories = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "v8.execute",
  "disabled-by-default-v8.cpu_profiler",
  "blink.user_timing",
  "latencyInfo",
  "gpu",
  "toplevel",
];

async function prepare() {
  if (SCENARIO === "load") return;
  await page.goto(URL_BASE + "/", { waitUntil: "load" });
  await ready();
  await page.mouse.move(720, 450, { steps: 4 });
  await sleep(2500);
  if (SCENARIO === "ignite" || SCENARIO === "drift") {
    await page.keyboard.press("ArrowRight");
    await waitTurn();
    await sleep(800);
    await selectMode(page, SCENARIO === "ignite" ? "Ignite" : "Drift");
    await page.waitForSelector(SCENARIO === "ignite" ? ".bstage--ignite-ready" : ".bstage--drift-ready", { timeout: 20000 });
    await sleep(1500);
  }
}

async function act() {
  if (SCENARIO === "load" && args.mobile) {
    await page.goto(URL_BASE + "/", { waitUntil: "load" });
    await sleep(3000);
  } else if (SCENARIO === "load") {
    await page.goto(URL_BASE + "/", { waitUntil: "load" });
    await ready();
    await sleep(1500);
  } else if (SCENARIO === "idle") {
    await sleep(3000);
  } else if (SCENARIO === "posed") {
    await page.mouse.move(1420, 30, { steps: 4 });
    await sleep(3000);
  } else if (SCENARIO === "turns") {
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press("ArrowRight");
      await waitTurn();
    }
  } else if (SCENARIO === "riffle") {
    await page.keyboard.press("End");
    await waitTurn();
    await page.keyboard.press("Home");
    await waitTurn();
  } else if (SCENARIO === "ignite" || SCENARIO === "drift") {
    await page.mouse.move(820, 450, { steps: 3 });
    if (SCENARIO === "ignite") await page.mouse.down();
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < 5000) {
      const a = i * 0.15;
      await page.mouse.move(720 + Math.cos(a) * 380, 450 + Math.sin(a * 1.3) * 250, { steps: 1 });
      await sleep(30);
      i += 1;
    }
    if (SCENARIO === "ignite") await page.mouse.up();
  }
}

await prepare();
await browser.startTracing(page, { categories, screenshots: false });
await act();
const buffer = await browser.stopTracing();
await browser.close();
await server?.close();

const trace = JSON.parse(buffer.toString("utf8"));
const events = trace.traceEvents || trace;

/* ---- find renderer main thread(s) ---- */
const threadNames = new Map();
for (const e of events) if (e.ph === "M" && e.name === "thread_name") threadNames.set(`${e.pid}:${e.tid}`, e.args.name);
const mainThreads = new Set([...threadNames].filter(([, n]) => n === "CrRendererMain").map(([k]) => k));

/* ---- top-level task mix on the main thread (exclusive-ish by event name) ---- */
const mix = {};
let taskTotal = 0;
for (const e of events) {
  if (e.ph !== "X" || !mainThreads.has(`${e.pid}:${e.tid}`) || !e.dur) continue;
  const name = e.name;
  if (name === "RunTask" || name === "ThreadControllerImpl::RunTask") taskTotal += e.dur / 1000;
  const interesting = [
    "UpdateLayoutTree", "Layout", "Paint", "PrePaint", "Layerize", "UpdateLayer", "CompositeLayers", "Commit",
    "FunctionCall", "EvaluateScript", "v8.compile", "v8.compileModule", "V8.CompileCode", "TimerFire", "FireAnimationFrame",
    "EventDispatch", "MinorGC", "MajorGC", "V8.GC_SCAVENGER", "V8.GC_MARK_COMPACTOR", "BlinkGC.AtomicPhase",
    "Decode Image", "Decode LazyPixelRef", "ImageDecodeTask", "ParseHTML", "ParseAuthorStyleSheet",
    "HitTest", "ScheduleStyleRecalculation", "InvalidateLayout", "v8.run", "XHRReadyStateChange", "ResourceReceivedData",
  ];
  if (interesting.includes(name)) mix[name] = (mix[name] || 0) + e.dur / 1000;
}

/* ---- rebuild sampled CPU profile(s) from ProfileChunk events ---- */
const nodes = new Map(); // key pid:tid:profileId:nodeId -> {callFrame, parent}
const self = new Map(); // key callframe string -> ms
const selfByUrl = new Map();
let sampledTotal = 0;
const profiles = new Map();
for (const e of events) {
  if (e.name === "Profile") profiles.set(`${e.pid}:${e.id}`, { tid: e.tid });
}
for (const e of events) {
  if (e.name !== "ProfileChunk") continue;
  const key = `${e.pid}:${e.id}`;
  const prof = profiles.get(key);
  if (prof && !mainThreads.has(`${e.pid}:${prof.tid}`)) continue;
  const data = e.args?.data || {};
  const cp = data.cpuProfile || {};
  for (const n of cp.nodes || []) nodes.set(`${key}:${n.id}`, n.callFrame);
  const samples = cp.samples || [];
  const deltas = data.timeDeltas || [];
  for (let i = 0; i < samples.length; i += 1) {
    const d = (deltas[i] || 0) / 1000; // us -> ms, attributed to this sample
    const cf = nodes.get(`${key}:${samples[i]}`);
    if (!cf) continue;
    const fn = cf.functionName || "(anonymous)";
    if (fn === "(idle)") continue;
    const url = (cf.url || "").replace(/^https?:\/\/[^/]+/, "");
    const k = `${fn}  ${url}${url ? `:${cf.lineNumber + 1}` : ""}`;
    self.set(k, (self.get(k) || 0) + d);
    const u = url || fn;
    selfByUrl.set(u, (selfByUrl.get(u) || 0) + d);
    sampledTotal += d;
  }
}

const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, TOP);
const byUrl = [...selfByUrl].sort((a, b) => b[1] - a[1]).slice(0, 15);
const result = {
  scenario: SCENARIO,
  cpu: CPU,
  mainThreadTaskMs: Math.round(taskTotal),
  sampledMs: Math.round(sampledTotal),
  mix: Object.fromEntries(Object.entries(mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)])),
  topSelf: top.map(([k, v]) => [Math.round(v * 10) / 10, k]),
  byUrl: byUrl.map(([k, v]) => [Math.round(v), k]),
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`== ${SCENARIO} @${CPU}x  main-thread tasks ${result.mainThreadTaskMs}ms, sampled JS+native ${result.sampledMs}ms`);
console.log("event mix (ms):", JSON.stringify(result.mix));
console.log("by url (ms):");
for (const [v, k] of result.byUrl) console.log(`  ${String(v).padStart(7)}  ${k}`);
console.log("top self time (ms):");
for (const [v, k] of result.topSelf) console.log(`  ${String(v).padStart(8)}  ${k}`);
