/* The bindery. Runs after both Vite builds: takes dist/index.html as the
   shell, asks the SSR bundle in dist-ssr/ to print every static route, and
   writes one finished document per URL into dist/ — plus the feeds and the
   two files GitHub Pages needs to serve a single-page app honestly.

   The splicing helpers are exported and pure so tests/prerender.test.tsx can
   press a page without a build; the run itself only starts when this file is
   the script Node was handed. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HEAD_START = "<!--head:start-->";
const HEAD_END = "<!--head:end-->";
const ROOT = '<div id="root"></div>';

/** The seams the shell must keep for a page to be pressed into it. */
export const MARKERS = [HEAD_START, HEAD_END, ROOT];

/** Where a route's finished document lands under dist/. Every route but the
    cover is a flat file — dist/about.html, dist/writing/why-a-magazine.html —
    never dist/about/index.html. GitHub Pages answers an extensionless URL
    from the matching .html as is, while a directory earns a 301 onto its
    trailing slash, and that redirect would contradict the slash-less
    canonical, og:url, sitemap and feed links every page prints. A file
    writing.html and a directory writing/ sit side by side without fuss. */
export function fileForRoute(dist, route) {
  return route === "/"
    ? resolve(dist, "index.html")
    : resolve(dist, `${route.slice(1)}.html`);
}

/** The shell with one route's head and body pressed into it. Every splice is
    cut by index rather than String.replace: a replacement string there reads
    "$&", "$'", "$`" and "$$" as patterns, and a page's copy is free to say any
    of them — a "$&" in a dek would print the root marker twice. */
export function documentFor(shell, { head, body }) {
  for (const marker of MARKERS) {
    if (!shell.includes(marker)) {
      throw new Error(`the shell lost its "${marker}" marker`);
    }
  }
  const headStart = shell.indexOf(HEAD_START);
  const headEnd = shell.indexOf(HEAD_END) + HEAD_END.length;
  const rootStart = shell.indexOf(ROOT);
  if (headEnd > rootStart) {
    throw new Error("the shell's head markers must come before #root");
  }
  return (
    shell.slice(0, headStart) +
    `${HEAD_START}\n    ${head}\n    ${HEAD_END}` +
    shell.slice(headEnd, rootStart) +
    `<div id="root">${body}</div>` +
    shell.slice(rootStart + ROOT.length)
  );
}

const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

async function main() {
  const root = process.cwd();
  const dist = resolve(root, "dist");
  const bundle = resolve(root, "dist-ssr/entry.js");

  /* A missing or broken bundle must stop the build, not ship a site whose
     every page is an empty shell with the cover's head on it. */
  if (!existsSync(bundle)) {
    console.error(
      `prerender: no SSR bundle at ${bundle}. Run "vite build --ssr src/prerender/entry.tsx --outDir dist-ssr" first.`,
    );
    process.exit(1);
  }
  let press;
  try {
    press = await import(pathToFileURL(bundle).href);
  } catch (error) {
    console.error("prerender: the SSR bundle failed to load.");
    console.error(error);
    process.exit(1);
  }
  const { render, staticRoutes, dispatches, SITE_URL: SITE } = press;

  const shellPath = resolve(dist, "index.html");
  if (!existsSync(shellPath)) {
    console.error(`prerender: no client build at ${shellPath}. Run "vite build" first.`);
    process.exit(1);
  }
  const shell = readFileSync(shellPath, "utf8");
  for (const marker of MARKERS) {
    if (!shell.includes(marker)) {
      console.error(`prerender: index.html lost its "${marker}" marker.`);
      process.exit(1);
    }
  }

  const routes = staticRoutes();
  for (const route of routes) {
    const file = fileForRoute(dist, route);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, documentFor(shell, render(route)));
  }

  /* GitHub Pages has no rewrite layer: an unknown path — a stray trailing
     slash included — is served this file with a 404 status, and the app
     decides what to show. It stays a plain shell, default head and empty
     root, because there is no page to print. */
  writeFileSync(resolve(dist, "404.html"), shell);
  writeFileSync(resolve(dist, ".nojekyll"), "");

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
${routes.map((r) => `  <url><loc>${SITE}${r}</loc></url>`).join("\n")}
</urlset>
`,
  );

  console.log(
    `prerender: ${routes.length} routes printed, plus 404.html, rss.xml and sitemap.xml`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
