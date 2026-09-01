import { afterEach, describe, expect, it } from "vitest";
import { applyMeta } from "@/lib/meta";
import { SITE_URL, metaForPath } from "@/lib/route-meta";

const head = () => document.head;

afterEach(() => {
  head().innerHTML = "";
});

/* The dev shell's head, reduced to the tags the applier rewrites. */
function seedHead() {
  head().innerHTML = `
    <title>Alan Tai</title>
    <meta name="description" content="cover" />
    <link rel="canonical" href="${SITE_URL}/" />
    <meta property="og:title" content="Alan Tai" />
    <meta property="og:description" content="cover" />
    <meta property="og:url" content="${SITE_URL}/" />
    <meta property="og:type" content="website" />
    <meta name="twitter:title" content="Alan Tai" />
    <meta name="twitter:description" content="cover" />
  `;
}

const content = (selector: string) =>
  head().querySelector(selector)?.getAttribute("content");

describe("the client head", () => {
  it("rewrites every tag for the route on screen", () => {
    seedHead();
    applyMeta("/writing/why-a-magazine");
    const meta = metaForPath("/writing/why-a-magazine");

    expect(document.title).toBe(meta.title);
    expect(content('meta[name="description"]')).toBe(meta.description);
    expect(content('meta[property="og:title"]')).toBe(meta.title);
    expect(content('meta[property="og:description"]')).toBe(meta.description);
    expect(content('meta[property="og:url"]')).toBe(meta.url);
    expect(content('meta[property="og:type"]')).toBe("article");
    expect(content('meta[name="twitter:title"]')).toBe(meta.title);
    expect(content('meta[name="twitter:description"]')).toBe(meta.description);
    expect(
      head().querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    ).toBe(meta.url);
  });

  it("adds a canonical when the head has none", () => {
    head().innerHTML = "<title>x</title>";
    applyMeta("/colophon");
    expect(
      head().querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    ).toBe(`${SITE_URL}/colophon`);
  });
});
