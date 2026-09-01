/* The <head> block a prerendered route is stamped with. It replaces the
   marker block in index.html, so the tag set here must stay a superset of the
   dev shell's defaults: the client applier (src/lib/meta.ts) looks these tags
   up by selector and rewrites them in place on navigation. */

import { OG_IMAGE, type RouteMeta } from "@/lib/route-meta";

/** Attribute-safe text. Titles and deks are editorial copy and may carry
    ampersands, quotes, or angle brackets. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const meta = (attr: "name" | "property", key: string, content: string) =>
  `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;

export function renderHead(route: RouteMeta): string {
  return [
    `<title>${escapeHtml(route.title)}</title>`,
    meta("name", "description", route.description),
    `<link rel="canonical" href="${escapeHtml(route.url)}" />`,
    meta("property", "og:title", route.title),
    meta("property", "og:description", route.description),
    meta("property", "og:url", route.url),
    meta("property", "og:type", route.type),
    meta("property", "og:image", OG_IMAGE.url),
    meta("property", "og:image:type", OG_IMAGE.type),
    meta("property", "og:image:width", String(OG_IMAGE.width)),
    meta("property", "og:image:height", String(OG_IMAGE.height)),
    meta("property", "og:image:alt", OG_IMAGE.alt),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", route.title),
    meta("name", "twitter:description", route.description),
    meta("name", "twitter:image", OG_IMAGE.url),
    meta("name", "twitter:image:alt", OG_IMAGE.alt),
  ].join("\n    ");
}
