/* The masthead data for every URL on the site: what goes in the <title>, the
   description, and the share card. One table serves two readers. The
   prerender step stamps it into each route's static <head> at build time, and
   the client (src/lib/meta.ts) re-applies it on every navigation so the head
   a scraper sees and the head a visitor's tab shows never disagree. */

import { SPREADS, spreadForRoute } from "@/magazine/folio";
import { dispatches } from "@/lib/content";

/* The production origin. The build passes it in from the environment (the
   deploy workflow sets SITE_URL) and the browser bundle has no `process`,
   so the guard makes the same module safe to ship to visitors, where the
   default is the only address the site has ever been published at. */
export const SITE_URL = (
  (typeof process !== "undefined" && process.env.SITE_URL) ||
  "https://alantai.me"
).replace(/\/$/, "");

export const BASE_TITLE = "Alan Tai";
export const BASE_DESCRIPTION =
  "Alan Tai builds software, research, and early-stage products. Issue No. 01.";

/** The share plate, one absolute image for every route. It follows SITE_URL
    like the canonical does, so a build for another origin points scrapers at
    its own copy of the plate rather than the production one. */
export const OG_IMAGE = {
  url: `${SITE_URL}/og.png`,
  type: "image/png",
  width: 1200,
  height: 630,
  alt: "Alan Tai — A Personal Issue, No. 01",
} as const;

export interface RouteMeta {
  title: string;
  description: string;
  /** The canonical pathname, without a trailing slash except on the cover. */
  path: string;
  /** SITE_URL + path: what canonical, og:url and the sitemap all print. */
  url: string;
  /** Dispatches are articles; every spread of the issue is the site itself. */
  type: "website" | "article";
}

/* Editorial copy per route. Aliases (like /colophon) get their own line when
   the shared spread's title would mislead; any alias left out here inherits
   its spread's entry below. */
const ROUTE_META: Record<string, { title: string; description: string }> = {
  "/": { title: BASE_TITLE, description: BASE_DESCRIPTION },
  "/contents": { title: `Contents · ${BASE_TITLE}`, description: "What's in Issue No. 01." },
  "/about": { title: `Letter · ${BASE_TITLE}`, description: "A short letter from Alan." },
  "/profile": { title: `Profile · ${BASE_TITLE}`, description: "Work habits and off-hours notes." },
  "/projects": { title: `Projects · ${BASE_TITLE}`, description: "A growing archive of working prototypes, tools, and product systems." },
  "/resume": { title: `Resume · ${BASE_TITLE}`, description: "The annotated resume." },
  "/library": { title: `Library · ${BASE_TITLE}`, description: "Films, articles, posts." },
  "/writing": { title: `Dispatches · ${BASE_TITLE}`, description: "Occasional writing." },
  "/contact": { title: `Letters · ${BASE_TITLE}`, description: "Send a note." },
  "/colophon": { title: `Colophon · ${BASE_TITLE}`, description: "What Issue No. 01 is set in and built with." },
  "/reader": { title: `Reader · ${BASE_TITLE}`, description: BASE_DESCRIPTION },
};

const normalizePath = (pathname: string) =>
  pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

export const canonicalUrl = (path: string) => `${SITE_URL}${path}`;

const websiteMeta = (
  path: string,
  copy: { title: string; description: string },
): RouteMeta => ({ ...copy, path, url: canonicalUrl(path), type: "website" });

/** Resolve any pathname to its head copy. Unknown paths fall back to the
    cover's, the same way the folio sends an unknown route to spread zero. */
export function metaForPath(pathname: string): RouteMeta {
  const path = normalizePath(pathname);

  const own = ROUTE_META[path];
  if (own) return websiteMeta(path, own);

  /* A dispatch lives at exactly /writing/<slug>, the shape the router's
     /writing/:slug matches. Anything deeper under a real slug is a URL nobody
     printed — the app shows Not Found there — so it takes the unknown-path
     road below instead of borrowing the article's title and canonical. */
  const segments = path.split("/");
  if (segments.length === 3 && segments[1] === "writing") {
    const slug = segments[2];
    const dispatch = dispatches.find((d) => d.id === slug);
    if (dispatch) {
      return {
        title: `${dispatch.title} · ${BASE_TITLE}`,
        description: dispatch.dek,
        path,
        url: canonicalUrl(path),
        type: "article",
      };
    }
  }

  /* An alias without its own line, or a path nobody printed: borrow the
     spread's copy and point the canonical at the spread's real route. */
  const spreadRoute = SPREADS[spreadForRoute(path)]?.route ?? "/";
  const known = SPREADS.some(
    (d) => d.route === path || d.aliases?.includes(path),
  );
  return websiteMeta(known ? path : spreadRoute, ROUTE_META[spreadRoute] ?? ROUTE_META["/"]!);
}
