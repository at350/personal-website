# ALAN TAI — Issue No. 01

Alan Tai's personal site as one printed object: a stark white void, a bound
issue you can drag, flick, and keyboard through. Every spread is live,
art-directed HTML — the resume keeps its margin notes, the library restocks
itself, the colophon tells the truth.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # type-checks, bundles, writes rss.xml + sitemap.xml
npm test           # engine, folio math, content schemas, media normalizers
npm run lint
```

## How it's bound

- **Book** — `src/book3d/`: a WebGL book built on three.js via
  `@react-three/fiber` (+ drei, maath). Pages are meshes with real thickness
  that bend along a curve (`bend.ts`); one warm key light plus ambient fill,
  a contact shadow under the book — all shading comes from the lighting
  model, never from CSS. Page faces are rendered from the real DOM spreads
  with `html-to-image` at 2× and cached (`pageTextures.tsx`). At rest the
  flat spread swaps to a perfectly aligned live DOM overlay, so every page
  stays a fully interactive website.
- **Engine** — `src/magazine/engine.ts`: a pure state machine drives turns;
  drag maps the pointer to leaf angle and releases into a critically damped
  spring. Reduced-motion and small screens get the stacked **reader**
  instead — same components, same folios.
- **Issue map** — `src/magazine/folio.ts` is the flatplan: spreads, routes,
  and real page numbers derive from one table. Cover lines and TOC entries
  flip to the folio they print.
- **Spreads** — `src/spreads/*`, one component per spread, all content from
  `src/lib/content.ts` (verified — no invented facts).
- **Media library** — `src/lib/media/`: a verified seed merged with
  `live.json`, refreshed by `npm run refresh-media` (see below).

## Library refresh

`.github/workflows/refresh-media.yml` runs daily and commits a new
`src/lib/media/live.json` when feeds change. Configure repo secrets
(all optional — the seed keeps the page alive without them):

| Secret | Purpose |
|---|---|
| `LETTERBOXD_USER` | Letterboxd username → film log via public RSS |
| `SUBSTACK_RSS_URL` | Substack feed URL once the newsletter exists |
| `X_BEARER_TOKEN` + `X_USER_ID` | Recent posts via the X API |

## Type

Set in **Zodiak** (Indian Type Foundry, via Fontshare), **Tanker**
(Indian Type Foundry, via Fontshare), **Newsreader** (Production Type),
**Apfel Grotezk** (Collletttivo), and **Server Mono** (Internet Development
Studio Co.). All licenses permit self-hosted web embedding; files live in
`public/fonts`.

## Paper

White `#FFFFFF`. Ink `#0E0E0C`. One red: `#E8351A`. Hairlines at 14% ink.
No gradients — the book's lighting does the shading.
