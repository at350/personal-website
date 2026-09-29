/* Shared plumbing for the benchmark scripts: argument parsing and a real
   (GPU-accelerated) Chrome.

   The book is WebGL, so the numbers only mean something on a real GPU. Full
   Chrome for Testing in new-headless mode renders through ANGLE on the
   machine's GPU; `chrome-headless-shell` falls back to software WebGL and
   must not be used. Install it once with
     npx @puppeteer/browsers install chrome@stable --path ~/.cache/puppeteer
   or point CHROME_PATH at any Chrome/Chromium executable. */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[arg.slice(2)] = "1";
    else {
      out[arg.slice(2)] = next;
      i += 1;
    }
  }
  return out;
}

const EXECUTABLES = {
  darwin: [
    "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  ],
  linux: ["chrome-linux64/chrome"],
  win32: ["chrome-win64/chrome.exe"],
};

/** CHROME_PATH, else the newest Chrome for Testing in the puppeteer cache. */
export function chromeExecutable() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), ".cache", "puppeteer", "chrome");
  if (existsSync(cache)) {
    const builds = readdirSync(cache).sort().reverse();
    for (const build of builds) {
      for (const relative of EXECUTABLES[process.platform] || []) {
        const candidate = join(cache, build, relative);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  throw new Error(
    "No Chrome for Testing found. Run `npx @puppeteer/browsers install chrome@stable --path ~/.cache/puppeteer` or set CHROME_PATH.",
  );
}

export async function loadPlaywright() {
  try {
    return await import("playwright-core");
  } catch {
    throw new Error("playwright-core is missing: run `npm install`.");
  }
}
