/* Cloudflare Web Analytics, set at press time.
 *
 * The issue keeps no tracking state: no cookies, no fingerprint, nothing that
 * follows a reader between visits. The one thing it stores is the reader's
 * own view preference (see useViewportMode), which is a setting, not a
 * record of them. Cloudflare's beacon honours that — it counts page views at
 * the edge from one small script and stores nothing on the visitor's machine
 * — so it is the one counter allowed into the masthead. The site token is the only
 * moving part, and it is not a secret (it ships in the page source), so the
 * build reads it from CF_BEACON_TOKEN and prints the tag only when one is
 * set. A build without a token is the same issue with no counter at all.
 *
 * Verified against beacon.min.js itself rather than the dashboard snippet:
 * the script reads the `data-cf-beacon` attribute as JSON, needs `token`,
 * and treats `spa` as on unless it is explicitly `false` — route changes
 * through the History and Navigation APIs are reported as page views. This
 * site is a single-page book, so `spa` is written out as `true` on purpose:
 * the flag documents the intent in the page source and survives a default
 * change on Cloudflare's side.
 */

/** The one script Cloudflare serves for every site; there is no per-site copy. */
export const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

/* A token is an opaque hex-ish id. Anything outside this set would have to be
   escaped into a single-quoted HTML attribute, and a token that needs escaping
   is a mistake worth stopping the press for, not quietly working around. */
const SAFE_TOKEN = /^[A-Za-z0-9_-]+$/;

/**
 * Build the beacon tag for a site token, or "" when there is no token to
 * print. Throws on a token that could break out of the attribute so a
 * mistyped repository variable fails the build instead of shipping a broken
 * or unsafe tag.
 * @param {string | undefined | null} token
 * @returns {string}
 */
export const beaconTag = (token) => {
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (!trimmed) return "";
  if (!SAFE_TOKEN.test(trimmed)) {
    throw new Error(
      `CF_BEACON_TOKEN may only contain letters, digits, "_" and "-"; got ${JSON.stringify(trimmed)}.`,
    );
  }
  // JSON.stringify keeps the attribute honest even though the regex already
  // rules out quotes: the value in the page is exactly what the beacon parses.
  const config = JSON.stringify({ token: trimmed, spa: true });
  return `<script defer src="${BEACON_SRC}" data-cf-beacon='${config}'></script>`;
};

/**
 * Vite plugin: append the beacon to <head> of index.html when a token is
 * given, and do nothing at all otherwise. The tag is spliced in as a string
 * rather than through Vite's tag descriptors so the printed markup is exactly
 * `beaconTag()` — one shape to test, one shape to grep for in dist/. It goes
 * in <head> because the prerenderer uses dist/index.html as the template for
 * every route, so the head is the one place a tag reaches all of them.
 * @param {string | undefined | null} token
 * @returns {import("vite").Plugin}
 */
export const cloudflareBeacon = (token) => {
  const tag = beaconTag(token);
  return {
    name: "cloudflare-beacon",
    transformIndexHtml(html) {
      if (!tag || html.includes(tag)) return html;
      const close = html.search(/<\/head>/i);
      if (close < 0) return html;
      return `${html.slice(0, close)}${tag}\n  ${html.slice(close)}`;
    },
  };
};
