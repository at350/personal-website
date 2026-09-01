// @vitest-environment node
/* Deliberately run without a DOM: the press runs under plain Node, so a
   spread that reached for window or document during render would print in
   jsdom and then break the build. Here it fails the test instead. */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { render, staticRoutes } from "@/prerender/entry";
import { SPREADS } from "@/magazine/folio";
import { about, dispatches } from "@/lib/content";
import { BASE_TITLE, OG_IMAGE, SITE_URL, metaForPath } from "@/lib/route-meta";

interface Bindery {
  MARKERS: readonly string[];
  fileForRoute: (dist: string, route: string) => string;
  documentFor: (shell: string, page: { head: string; body: string }) => string;
}

const loadBindery = async (): Promise<Bindery> =>
  (await import(
    /* @vite-ignore */
    pathToFileURL(join(process.cwd(), "scripts", "prerender.mjs")).href
  )) as Bindery;

/* The dev shell, reduced to the seams the bindery cuts at. */
const SHELL = `<!doctype html>
<html>
  <head>
    <!--head:start-->
    <title>Alan Tai</title>
    <!--head:end-->
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

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
  it("runs with no window or document, as the build does", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("prints a spread route with its own head and the issue as real markup", () => {
    const { head, body } = render("/about");

    expect(head).toContain(`<title>Letter · ${BASE_TITLE}</title>`);
    expect(head).toContain(`<link rel="canonical" href="${SITE_URL}/about" />`);
    expect(head).toContain(`<meta property="og:url" content="${SITE_URL}/about" />`);
    expect(head).toContain('<meta property="og:type" content="website" />');
    expect(head).toContain(`<meta property="og:image" content="${SITE_URL}/og.png" />`);
    expect(OG_IMAGE.url).toBe(`${SITE_URL}/og.png`);

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

  it("does not let a path deeper than /writing/<slug> borrow the article's head", () => {
    const article = metaForPath("/writing/why-a-magazine");
    expect(article.type).toBe("article");
    expect(metaForPath("/writing/why-a-magazine/")).toEqual(article);

    /* The router matches /writing/:slug only, so the app shows Not Found
       here; the head must not claim otherwise with the article's canonical. */
    const deeper = metaForPath("/writing/why-a-magazine/anything");
    expect(deeper).toMatchObject({ path: "/", url: `${SITE_URL}/`, title: BASE_TITLE, type: "website" });
    expect(metaForPath("/writing/missing")).toMatchObject({ path: "/", type: "website" });
  });
});

describe("the bindery", () => {
  it("lays every route out as a flat file so Pages never redirects onto a slash", async () => {
    const { fileForRoute } = await loadBindery();
    const dist = "/site/dist";
    expect(fileForRoute(dist, "/")).toBe("/site/dist/index.html");
    expect(fileForRoute(dist, "/about")).toBe("/site/dist/about.html");
    expect(fileForRoute(dist, "/writing")).toBe("/site/dist/writing.html");
    expect(fileForRoute(dist, "/writing/why-a-magazine")).toBe(
      "/site/dist/writing/why-a-magazine.html",
    );
    /* Nothing but the cover may be an index.html: a directory per route is
       exactly the layout that earns the redirect. */
    for (const route of staticRoutes()) {
      if (route === "/") continue;
      expect(fileForRoute(dist, route)).not.toMatch(/\/index\.html$/u);
    }
  });

  it("presses a page into the shell by index, so replacement patterns in copy print verbatim", async () => {
    const { documentFor } = await loadBindery();
    const head = `<title>Costs $$ &amp; more</title>`;
    const body = `<div class="prerender"><p>Type $& to keep $' and $\` as written; $$ too.</p></div>`;
    const document = documentFor(SHELL, { head, body });

    expect(document).toContain(`<!--head:start-->\n    ${head}\n    <!--head:end-->`);
    expect(document).toContain(`<div id="root">${body}</div>`);
    expect(document).not.toContain("<title>Alan Tai</title>");
    /* One root, exactly once: a "$&" splice would have printed the marker twice. */
    expect(document.match(/id="root"/gu)).toHaveLength(1);
    expect(document).not.toContain('<div id="root"></div>');
    expect(document).toContain('<script type="module" src="/src/main.tsx"></script>');
  });

  it("presses a real route the same way the build does", async () => {
    const { documentFor } = await loadBindery();
    const page = render("/about");
    const document = documentFor(SHELL, page);
    expect(document).toContain(`<link rel="canonical" href="${SITE_URL}/about" />`);
    expect(document).toContain('<div id="root"><div class="prerender">');
    expect(document.startsWith("<!doctype html>")).toBe(true);
  });

  it("refuses a shell that lost a marker", async () => {
    const { documentFor, MARKERS } = await loadBindery();
    expect(MARKERS).toHaveLength(3);
    expect(() =>
      documentFor(SHELL.replace('<div id="root"></div>', "<main></main>"), { head: "", body: "" }),
    ).toThrow(/marker/u);
  });
});
