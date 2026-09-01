import { describe, expect, it } from "vitest";
import { render, staticRoutes } from "@/prerender/entry";
import { SPREADS } from "@/magazine/folio";
import { about, dispatches } from "@/lib/content";
import { BASE_TITLE, SITE_URL, metaForPath } from "@/lib/route-meta";

/* The set the press run must cover, derived independently of the entry so a
   hand list sneaking into either side would show up as a mismatch. */
const expectedRoutes = new Set([
  ...SPREADS.flatMap((def) =>
    def.route ? [def.route, ...(def.aliases ?? [])] : [],
  ),
  "/reader",
  ...dispatches.map((d) => `/writing/${d.id}`),
]);

describe("the press run", () => {
  it("prints a spread route with its own head and the issue as real markup", () => {
    const { head, body } = render("/about");

    expect(head).toContain(`<title>Letter · ${BASE_TITLE}</title>`);
    expect(head).toContain(`<link rel="canonical" href="${SITE_URL}/about" />`);
    expect(head).toContain(`<meta property="og:url" content="${SITE_URL}/about" />`);
    expect(head).toContain('<meta property="og:type" content="website" />');
    expect(head).toContain('content="https://alantai.me/og.png"');

    expect(body.startsWith('<div class="prerender">')).toBe(true);
    expect(body).toContain('id="spread-letter"');
    expect(body).toContain(about.heading);
    /* React's hoisted image preloads ride in the head, not the body. */
    expect(head).toContain('rel="preload" as="image"');
    expect(body).not.toContain('rel="preload"');
    /* The static document has no other mode to open, so no mast buttons. */
    expect(body).not.toContain("open as book");
    expect(body).not.toContain("read as pages");
  });

  it("prints a dispatch as an article with its own title", () => {
    const dispatch = dispatches.find((d) => d.id === "why-a-magazine")!;
    const { head, body } = render("/writing/why-a-magazine");

    expect(head).toContain(`<title>${dispatch.title} · ${BASE_TITLE}</title>`);
    expect(head).toContain('<meta property="og:type" content="article" />');
    expect(head).toContain(
      `<meta name="description" content="${dispatch.dek}" />`,
    );
    expect(body).toContain(dispatch.title);
    expect(body).toContain('class="prerender"');
    expect(body).not.toContain("P. 404");
  });

  it("prints an alias route under its own name", () => {
    const { head, body } = render("/colophon");
    expect(head).toContain(`<title>Colophon · ${BASE_TITLE}</title>`);
    expect(head).toContain(`href="${SITE_URL}/colophon"`);
    expect(body).toContain('class="prerender"');
  });

  it("prints the linear reader without any mode switch", () => {
    const { head, body } = render("/reader");
    expect(head).toContain(`<title>Reader · ${BASE_TITLE}</title>`);
    expect(body).toContain('class="reader"');
  });

  it("never prints a path the folio does not know", () => {
    expect(() => render("/nowhere")).toThrow(/never prerendered/);
    expect(() => render("/writing/missing")).toThrow(/never prerendered/);
  });

  it("derives every static route from the folio and the dispatches", () => {
    const routes = staticRoutes();
    expect(new Set(routes)).toEqual(expectedRoutes);
    expect(routes.length).toBe(expectedRoutes.size);
  });

  it("has head copy for every static route", () => {
    for (const route of expectedRoutes) {
      const meta = metaForPath(route);
      expect(meta.path).toBe(route);
      expect(meta.url).toBe(`${SITE_URL}${route}`);
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.type).toBe(route.startsWith("/writing/") ? "article" : "website");
    }
  });

  it("sends an unknown path back to the cover's copy", () => {
    expect(metaForPath("/nowhere")).toMatchObject({ path: "/", title: BASE_TITLE });
    expect(metaForPath("/about/")).toMatchObject({ path: "/about" });
  });
});
