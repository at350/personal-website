/* The client half of the head. The prerendered document already carries the
   right tags for the URL it was written for; this keeps them right after the
   router moves without a page load, so a tab title, a bookmark, or a share
   sheet opened mid-read still describes the page on screen. */

import { metaForPath } from "@/lib/route-meta";

function setContent(selector: string, content: string) {
  document.head.querySelector(selector)?.setAttribute("content", content);
}

export function applyMeta(pathname: string) {
  const meta = metaForPath(pathname);

  document.title = meta.title;
  setContent('meta[name="description"]', meta.description);
  setContent('meta[property="og:title"]', meta.title);
  setContent('meta[property="og:description"]', meta.description);
  setContent('meta[property="og:url"]', meta.url);
  setContent('meta[property="og:type"]', meta.type);
  setContent('meta[name="twitter:title"]', meta.title);
  setContent('meta[name="twitter:description"]', meta.description);

  /* The dev shell ships a canonical too, but a head that lost it (an old
     cached document, say) still deserves one rather than a silent skip. */
  let canonical = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = meta.url;
}
