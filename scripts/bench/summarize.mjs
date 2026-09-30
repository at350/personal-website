/* Summarize one results file, or compare two:
   node scripts/bench/summarize.mjs bench-results/a.json [bench-results/b.json] */
import { readFileSync } from "node:fs";

const [aPath, bPath] = process.argv.slice(2);
const A = JSON.parse(readFileSync(aPath, "utf8"));
const B = bPath ? JSON.parse(readFileSync(bPath, "utf8")) : null;

const median = (arr) => {
  const v = arr.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return null;
  const s = [...v].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* Which fields to show per scenario (sub-window path, field, label, lower-is-better). */
const FIELDS = {
  load: [
    ["", "fcp", "FCP ms"],
    ["", "lcp", "LCP ms"],
    ["", "stageMounted", "stage mounted ms"],
    ["", "captureSpanMs", "capture span ms"],
    ["", "ready", "book ready ms"],
    ["", "firstDraw", "first WebGL draw ms"],
    ["", "blockingToReadyMs", "blocking time ms"],
    ["", "maxLongTaskMs", "max long task ms"],
    ["", "mainThreadMsToSettle", "main thread ms"],
    ["", "jsKB", "JS KB (gz)"],
    ["", "totalKB", "transfer KB (enc)"],
    ["", "requests", "requests"],
    ["", "heapMB", "JS heap MB"],
    ["", "domNodes", "DOM nodes"],
  ],
  idle: [
    ["flat", "renderedPerSec", "flat: canvas renders/s"],
    ["flat", "rendererCpuPct", "flat: renderer CPU %"],
    ["flat", "gpuProcCpuPct", "flat: GPU-process CPU %"],
    ["flat", "mainThreadMs", "flat: main thread ms/5s"],
    ["settled", "renderedPerSec", "settled: canvas renders/s"],
    ["settled", "rendererCpuPct", "settled: renderer CPU %"],
    ["settled", "gpuProcCpuPct", "settled: GPU-process CPU %"],
    ["settled", "mainThreadMs", "settled: main thread ms/5s"],
    ["posed", "renderedPerSec", "posed: canvas renders/s"],
    ["posed", "rendererCpuPct", "posed: renderer CPU %"],
    ["posed", "gpuProcCpuPct", "posed: GPU-process CPU %"],
    ["posed", "mainThreadMs", "posed: main thread ms/5s"],
    ["posed", "p95", "posed: frame p95 ms"],
  ],
  turns: [
    ["", "turnMs", "per-turn ms"],
    ["", "fps", "fps"],
    ["", "p95", "frame p95 ms"],
    ["", "p99", "frame p99 ms"],
    ["", "jankPct", "janky frames %"],
    ["", "mainThreadPerFrameMs", "main ms/frame"],
    ["", "longTaskMs", "long task ms"],
    ["", "rendererCpuPct", "renderer CPU %"],
    ["", "gpuProcCpuPct", "GPU-process CPU %"],
    ["", "uploads", "texture uploads"],
  ],
  riffle: [
    ["", "legMs", "per-jump ms"],
    ["", "fps", "fps"],
    ["", "p95", "frame p95 ms"],
    ["", "p99", "frame p99 ms"],
    ["", "jankPct", "janky frames %"],
    ["", "mainThreadPerFrameMs", "main ms/frame"],
    ["", "longTaskMs", "long task ms"],
    ["", "gpuProcCpuPct", "GPU-process CPU %"],
  ],
  drag: [
    ["", "fps", "fps"],
    ["", "p95", "frame p95 ms"],
    ["", "p99", "frame p99 ms"],
    ["", "jankPct", "janky frames %"],
    ["", "mainThreadPerFrameMs", "main ms/frame"],
    ["", "longTaskMs", "long task ms"],
    ["", "gpuProcCpuPct", "GPU-process CPU %"],
  ],
  ignite: [
    ["", "fps", "fps"],
    ["", "p95", "frame p95 ms"],
    ["", "p99", "frame p99 ms"],
    ["", "jankPct", "janky frames %"],
    ["", "mainThreadPerFrameMs", "main ms/frame"],
    ["", "longTaskMs", "long task ms"],
    ["", "rendererCpuPct", "renderer CPU %"],
    ["", "gpuProcCpuPct", "GPU-process CPU %"],
    ["", "heapMB", "JS heap MB"],
  ],
  drift: [
    ["adrift", "fps", "adrift: fps"],
    ["adrift", "p95", "adrift: frame p95 ms"],
    ["adrift", "p99", "adrift: frame p99 ms"],
    ["adrift", "jankPct", "adrift: janky %"],
    ["adrift", "mainThreadPerFrameMs", "adrift: main ms/frame"],
    ["adrift", "rendererCpuPct", "adrift: renderer CPU %"],
    ["adrift", "gpuProcCpuPct", "adrift: GPU-process CPU %"],
    ["landing", "landMs", "landing ms"],
    ["landing", "p95", "landing: frame p95 ms"],
  ],
  mobile: [
    ["", "fcp", "FCP ms"],
    ["", "lcp", "LCP ms"],
    ["", "blockingMs", "blocking time ms"],
    ["", "mainThreadMs", "main thread ms"],
    ["", "jsKB", "JS KB (gz)"],
    ["", "totalKB", "transfer KB (enc)"],
    ["", "requests", "requests"],
  ],
};

const fmt = (v) =>
  v === null || v === undefined ? "—" : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

function value(runs, sub, field) {
  return median(
    (runs || [])
      .filter((r) => !r.error)
      .map((r) => (sub ? r[sub]?.[field] : r[field])),
  );
}

const keys = Object.keys(A.runs);
for (const key of keys) {
  const scenario = key.split("@")[0];
  const fields = FIELDS[scenario] || [];
  const aRuns = A.runs[key];
  const bRuns = B?.runs[key];
  const n = aRuns.filter((r) => !r.error).length;
  console.log(`\n### ${key}  (n=${n}${B ? `/${(bRuns || []).filter((r) => !r.error).length}` : ""})`);
  for (const [sub, field, label] of fields) {
    const a = value(aRuns, sub, field);
    if (!B) {
      console.log(`  ${label.padEnd(28)} ${fmt(a).padStart(9)}`);
      continue;
    }
    const b = value(bRuns, sub, field);
    const delta = a && b !== null && a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null;
    console.log(
      `  ${label.padEnd(28)} ${fmt(a).padStart(9)} → ${fmt(b).padStart(9)}  ${delta === null ? "" : `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`}`,
    );
  }
}
