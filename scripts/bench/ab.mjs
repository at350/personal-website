/* Interleaved A/B of two builds. Each round runs every scenario once per
   build, alternating which build goes first, so drift in the machine's state
   (heat, background work) lands on both sides alike. Prints the comparison.

   node scripts/bench/ab.mjs <base-dist> <candidate-dist> \
     [--rounds 3] [--scenarios load,idle,...] [--cpu 1,4] [--label ab] */
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { parseArgs } from "./browser.mjs";
import { serve } from "./serve.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const args = parseArgs();
const [baseDist, candidateDist] = args._;
if (!baseDist || !candidateDist) {
  console.error("usage: node scripts/bench/ab.mjs <base-dist> <candidate-dist> [--rounds 3]");
  process.exit(1);
}
const rounds = Number(args.rounds || 3);
const scenarios = (args.scenarios || "load,mobile,idle,turns,riffle,drag,ignite,drift").split(",");
const cpu = args.cpu || "1,4";
const label = args.label || "ab";
const out = {
  base: join(ROOT, "bench-results", `${label}-base.json`),
  candidate: join(ROOT, "bench-results", `${label}-candidate.json`),
};
rmSync(out.base, { force: true });
rmSync(out.candidate, { force: true });

const servers = {
  base: await serve(resolve(baseDist)),
  candidate: await serve(resolve(candidateDist)),
};

/* Runs asynchronously: both servers live in this process, so blocking it on
   a child (spawnSync) would leave the page's requests unanswered. */
function runOnce(side, scenario) {
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [
        join(HERE, "bench.mjs"),
        "--url", servers[side].url,
        "--label", `${label}-${side}`,
        "--out", out[side],
        "--append", "1",
        "--runs", "1",
        "--scenarios", scenario,
        "--cpu", cpu,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    let buffered = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffered += chunk;
      const lines = buffered.split("\n");
      buffered = lines.pop();
      for (const line of lines) if (/ run | FAILED/.test(line)) console.log(line);
    });
    child.on("close", done);
  });
}

for (let round = 1; round <= rounds; round += 1) {
  for (const scenario of scenarios) {
    const order = round % 2 ? ["base", "candidate"] : ["candidate", "base"];
    for (const side of order) await runOnce(side, scenario);
  }
}
await servers.base.close();
await servers.candidate.close();

spawnSync(process.execPath, [join(HERE, "summarize.mjs"), out.base, out.candidate], {
  stdio: "inherit",
});
