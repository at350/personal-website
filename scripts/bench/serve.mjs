/* A static server that answers like GitHub Pages, for benchmarking a build:
   the exact file, then `<path>.html`, then `<path>/index.html`, else
   404.html with a 404. Text is gzipped and everything is cacheable for ten
   minutes, as Pages does, so each fresh browser profile sees a cold cache and
   a realistic transfer size.

   node scripts/bench/serve.mjs [dist] [port] */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".ico": "image/x-icon",
};
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg", ".xml", ".txt"]);

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Serves `root` on 127.0.0.1:`port` (0 picks a free port). */
export function serve(root, port = 0) {
  const base = resolve(root);
  const gzipped = new Map();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
      const candidates = [join(base, rel)];
      if (!rel.endsWith("/")) candidates.push(join(base, `${rel}.html`));
      candidates.push(join(base, rel, "index.html"));
      let file = null;
      for (const candidate of candidates) {
        if (await isFile(candidate)) {
          file = candidate;
          break;
        }
      }
      let status = 200;
      if (!file) {
        file = join(base, "404.html");
        status = 404;
      }
      const ext = extname(file);
      const info = await stat(file);
      let body = await readFile(file);
      const headers = {
        "content-type": TYPES[ext] || "application/octet-stream",
        "cache-control": "max-age=600",
      };
      if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
        const key = `${file}:${info.mtimeMs}:${body.length}`;
        let packed = gzipped.get(key);
        if (!packed) {
          packed = gzipSync(body, { level: 6 });
          gzipped.set(key, packed);
        }
        body = packed;
        headers["content-encoding"] = "gzip";
      }
      headers["content-length"] = body.length;
      res.writeHead(status, headers);
      res.end(body);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });
  return new Promise((done) => {
    server.listen(port, "127.0.0.1", () => {
      const { port: bound } = server.address();
      done({
        url: `http://127.0.0.1:${bound}`,
        close: () => new Promise((closed) => server.close(closed)),
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || "dist";
  const { url } = await serve(root, Number(process.argv[3] || 4173));
  console.log(`serving ${resolve(root)} on ${url}`);
}
