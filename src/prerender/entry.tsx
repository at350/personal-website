/* The press run. `vite build --ssr` bundles this file for Node, and
   scripts/prerender.mjs calls it once per static route to print the issue as
   real HTML: crawlers, social scrapers and readers without JavaScript get
   the whole magazine, while a visitor with JavaScript never sees it — the
   shell hides `.prerender` the moment the `js` class lands and the app takes
   the root over on its first commit.

   Nothing here may touch window or document during render. Effects do not
   run in renderToString, but render-phase code does, so every spread that
   ends up on the reader stack has to be pure to be printable. */

import { renderToString } from "react-dom/server";
import { Route, Routes, StaticRouter } from "react-router";
import { ReaderView } from "@/routes/ReaderView";
import { WritingPage } from "@/routes/WritingPage";
import { SPREADS } from "@/magazine/folio";
import { dispatches, siteMeta } from "@/lib/content";
import { routerBasename, withBasePath } from "@/lib/basePath";
import { SITE_URL, metaForPath } from "@/lib/route-meta";
import { renderHead } from "./head";

/* The feed writer lives outside the bundle and needs the same dispatch list
   and site copy the pages were printed from, so they ship out with it. */
export { dispatches, siteMeta, SITE_URL };

/** Every URL that gets its own static document: each spread's route and its
    aliases, the linear reader, and one page per dispatch. Derived, never
    listed by hand, so a new spread or dispatch is printed on the next build. */
export function staticRoutes(): string[] {
  const spreadRoutes = SPREADS.flatMap((def) =>
    def.route ? [def.route, ...(def.aliases ?? [])] : [],
  );
  return [
    ...spreadRoutes,
    "/reader",
    ...dispatches.map((d) => `/writing/${d.id}`),
  ];
}

export interface PrerenderedRoute {
  /** The tags that replace the shell's head marker block. */
  head: string;
  /** The markup that fills #root, wrapped in .prerender. */
  body: string;
}

const isDispatchRoute = (pathname: string) => pathname.startsWith("/writing/");

/** How the wrapper opens in the rendered string; the seam the hoisted
    resource links are cut at. */
const PRERENDER_OPEN = '<div class="prerender">';

export function render(pathname: string): PrerenderedRoute {
  if (!staticRoutes().includes(pathname)) {
    throw new Error(`"${pathname}" is not a static route and is never prerendered`);
  }

  /* A dispatch stands alone as its reading page — matched through a Route so
     useParams hands it the slug, exactly as the app does. Every other route
     prints the whole issue as the stacked reader: the static document has no
     mode to switch to, so the mast shows no buttons at all. */
  const page = isDispatchRoute(pathname) ? (
    <Routes>
      <Route path="/writing/:slug" element={<WritingPage />} />
    </Routes>
  ) : (
    <ReaderView canOpenBook={false} onOpenBook={() => undefined} />
  );

  const html = renderToString(
    <StaticRouter basename={routerBasename()} location={withBasePath(pathname)}>
      <div className="prerender">{page}</div>
    </StaticRouter>,
  );

  /* React hoists resource hints — the preload links it writes for every
     eager <img> — ahead of the tree, and with no <head> in the render they
     arrive stuck to the front of the string. They belong in the document's
     head, so they are split off and sent there with the route's own tags. */
  const start = html.indexOf(PRERENDER_OPEN);
  const hoisted = start > 0 ? html.slice(0, start) : "";
  const body = start > 0 ? html.slice(start) : html;

  return {
    head: [renderHead(metaForPath(pathname)), hoisted].filter(Boolean).join("\n    "),
    body,
  };
}
