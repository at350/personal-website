/* Post-build: write rss.xml and sitemap.xml into dist/. */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
    <title>Alan Tai — Dispatches</title>
    <link>${SITE}</link>
    <description>Alan Tai — Dispatches. Occasional writing.</description>
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

// GitHub Pages has no rewrite layer. Give every known route a real static
// shell, while retaining a 404 shell for unknown paths handled by the app.
const appShell = resolve(dist, "index.html");
for (const route of ROUTES) {
  if (route === "/") continue;
  const routeShell = resolve(dist, route.slice(1), "index.html");
  mkdirSync(dirname(routeShell), { recursive: true });
  copyFileSync(appShell, routeShell);
}
copyFileSync(appShell, resolve(dist, "404.html"));
writeFileSync(resolve(dist, ".nojekyll"), "");

console.log(
  `feeds: rss.xml + sitemap.xml and ${ROUTES.length} Pages shells written`,
);
