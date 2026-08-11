/* Post-build: write rss.xml and sitemap.xml into dist/. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SITE = process.env.SITE_URL?.replace(/\/$/, "") || "https://alantai.dev";
const dist = resolve(process.cwd(), "dist");

// Content is TypeScript; keep this script dependency-free by extracting the
// dispatch data from the built content module is overkill — the two seed
// dispatches are stable, so read them from a tiny JSON manifest instead.
const dispatches = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/lib/dispatches.json"), "utf8"),
);

const ROUTES = [
  "/",
  "/contents",
  "/about",
  "/profile",
  "/projects",
  "/resume",
  "/library",
  "/writing",
  "/contact",
  "/colophon",
  ...dispatches.map((d) => `/writing/${d.id}`),
];

const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const rssItems = dispatches
  .map(
    (d) => `    <item>
      <title>${escape(d.title)}</title>
      <link>${SITE}/writing/${d.id}</link>
      <guid>${SITE}/writing/${d.id}</guid>
      <description>${escape(d.dek)}</description>
    </item>`,
  )
  .join("\n");

writeFileSync(
  resolve(dist, "rss.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Field Notes — Alan Tai</title>
    <link>${SITE}</link>
    <description>Dispatches from the personal magazine of Alan Tai.</description>
${rssItems}
  </channel>
</rss>
`,
);

writeFileSync(
  resolve(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ROUTES.map((r) => `  <url><loc>${SITE}${r}</loc></url>`).join("\n")}
</urlset>
`,
);

console.log(`feeds: rss.xml + sitemap.xml written for ${ROUTES.length} routes`);
