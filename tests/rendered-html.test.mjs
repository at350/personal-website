import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function request(pathname = "/", headers = { accept: "text/html" }) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the complete home issue", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const html = await response.text();
  assert.match(html, /<title>Field Notes, Issue 01 \| Alan Tai<\/title>/i);
  assert.match(html, /Interactive edition/);
  assert.match(html, /magazine-book-wrap" style="opacity:1;/);
  assert.match(html, /I make things that/);
  assert.match(html, /Turn to the next spread/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /href="\/about"/);
  assert.match(html, /href="\/resume"/);
  assert.doesNotMatch(html, /codex-preview|Starter Project|react-loading-skeleton/i);
});

test("every editorial department renders directly", async () => {
  const routes = [
    ["/about", "About"],
    ["/projects", "Projects"],
    ["/resume", "Resume"],
    ["/library", "Library"],
    ["/writing", "Writing"],
    ["/writing/why-a-magazine", "Why this site opens like a magazine"],
    ["/contact", "Send a note"],
  ];

  for (const [path, phrase] of routes) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), new RegExp(phrase, "i"), path);
  }
});

test("media API returns validated fallback content and feed state", async () => {
  const response = await request("/api/media", { accept: "application/json" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /stale-while-revalidate/);

  const payload = await response.json();
  assert.ok(payload.items.length >= 16);
  assert.equal(payload.feeds.x.state, "fallback");
  assert.equal(payload.feeds.letterboxd.state, "disabled");
  assert.equal(payload.feeds.substack.state, "disabled");
  assert.ok(payload.items.some((item) => item.source === "local"));
  assert.ok(payload.items.some((item) => item.source === "x"));
  assert.ok(payload.items.every((item) => !Object.hasOwn(item, "phone")));
});

test("RSS route publishes both starter dispatches", async () => {
  const response = await request("/rss.xml", { accept: "application/rss+xml" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/rss\+xml/);

  const xml = await response.text();
  assert.match(xml, /<rss/);
  assert.match(xml, /Why this site opens like a magazine/);
  assert.match(xml, /In defense of the side note/);
});

test("motion and mobile fallbacks stay in the stylesheet", async () => {
  const [globalCss, editorialCss, routesCss] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../styles/editorial.css", import.meta.url), "utf8"),
    readFile(new URL("../styles/routes.css", import.meta.url), "utf8"),
  ]);
  const css = `${globalCss}\n${editorialCss}\n${routesCss}`;

  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /touch-action:\s*pan-y/);
  assert.match(css, /@media \(max-width:\s*52rem\)/);
  assert.match(css, /\.turn-sheet/);
  assert.match(css, /\.resume-margin-note/);
}
);
