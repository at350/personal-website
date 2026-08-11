# FIELD NOTES — Issue No. 01

Alan Tai's personal site as a flippable print magazine. A stark white void, one
object in it: a washi-paper issue you can drag, flick, and keyboard through.
Every spread is live, art-directed HTML — the resume keeps its margin notes,
the library restocks itself, the colophon tells the truth.

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

- **Engine** — `src/magazine/`: a pure state machine (`engine.ts`) drives one
  CSS-3D sheet with two live faces; springs via GSAP; drag from the fore-edges,
  arrow keys, `Home`/`End`, horizontal wheel. `g` toggles the printer's proof
  (baseline grid, columns, crop marks). Reduced-motion and small screens get
  the stacked **reader** instead — same components, same folios.
- **Issue map** — `src/magazine/folio.ts` is the flatplan: spreads, routes,
  and real page numbers derive from one table. Cover lines and TOC entries
  flip to the folio they print.
- **Spreads** — `src/spreads/*`, one component per spread, all content from
  `src/lib/content.ts` (verified — no invented facts).
- **Media library** — `src/lib/media/`: a verified seed merged with
  `live.json`, refreshed by `npm run refresh-media` (see below).

## Self-updating library

`.github/workflows/refresh-media.yml` runs daily and commits a new
`src/lib/media/live.json` when feeds change. Configure repo secrets
(all optional — the seed keeps the page alive without them):

| Secret | Purpose |
|---|---|
| `LETTERBOXD_USER` | Letterboxd username → film log via public RSS |
| `SUBSTACK_RSS_URL` | Substack feed URL once the newsletter exists |
| `X_BEARER_TOKEN` + `X_USER_ID` | Recent posts via the X API |

## Type

Set in **Zodiak** (Indian Type Foundry, via Fontshare), **Newsreader**
(Production Type), **Apfel Grotezk** (Collletttivo), **Server Mono**
(Internet Development Studio Co.), and **Shippori Mincho B1** (FONTDASU).
All licenses permit self-hosted web embedding; files live in `public/fonts`.

## Paper

Washi `#F7F3EA` on a white void. Ink: sumi `#1C1A17`. One vermilion: `#D9333F`.
