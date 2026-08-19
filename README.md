# ALAN TAI / Issue No. 01

Alan Tai's personal site as one printed object: a stark white void, a bound
issue you can drag, flick, and keyboard through. Every spread is live,
art-directed HTML: the resume keeps its margin notes, the library restocks
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
  and a 28-by-16 constrained Verlet/PBD sheet (`paperPhysics.ts`). Structural,
  shear, and bending resistance keep it paper-like while the recorded pointer
  height anchors the live grab, so a corner peel and mid-edge curl propagate
  differently through the whole page. One warm key light, ambient fill, contact shadow,
  and a generated paper-fiber bump map give the object its material response.
  Page faces are rendered from the real DOM spreads with `html-to-image` at 2×
  and cached (`pageTextures.tsx`). A minimal entry gate pre-captures all 20
  printable faces before the book becomes interactive. At rest the flat spread
  swaps to a perfectly aligned live DOM overlay, so every page stays a fully
  interactive website. The overlay pre-renders a turn's destination during the
  flight and only appears once its images are decoded (`overlayReadiness.ts`),
  so landing never flashes unloaded content over the finished texture.
- **Engine** — `src/magazine/engine.ts`: a pure state machine drives turns;
  drag maps the pointer to leaf angle and releases into a critically damped
  spring. Reduced-motion and small screens get the stacked **reader**
  instead — same components, same folios.
- **Issue map** — `src/magazine/folio.ts` is the flatplan: spreads, routes,
  and real page numbers derive from one table. Cover lines and TOC entries
  flip to the folio they print.
- **Spreads** — `src/spreads/*`, one component per spread, all content from
  `src/lib/content.ts` (verified — no invented facts).
- **Project files** — add a project once in the `projects` collection in
  `src/lib/content.ts`; the count, expandable archive, and technology marks all
  update from that entry. Include its full
  `detail`, stack, optional image/links, and set `featureOrder` only when it
  should occupy one of the two editorial feature pages. Brand marks resolve in
  `src/lib/technology-icons.ts`; uncatalogued tools and methods receive a
  monochrome typographic mark automatically.
- **Media library** — `src/lib/media/`: a verified seed merged with
  `live.json`, refreshed by `npm run refresh-media` (see below). Film plates
  print the date the film was watched rather than the date the diary entry was
  posted, star the member rating, mark a rewatch, and carry the review copy
  when the entry has any.
- **Editorial art** — generated concept still lifes live in
  `public/images/editorial/` and `public/images/projects/editorial/`. Their
  reproducible prompt set is in `docs/assets/editorial-image-prompts.md`.

## Library refresh

The library restocks itself. `.github/workflows/refresh-media.yml` runs
**every two hours**: it reads each configured feed, mirrors every remote image
into `public/media/thumbs/`, and commits a new `src/lib/media/live.json` when
anything changed. A film logged on [letterboxd.com/alantai](https://letterboxd.com/alantai/)
is on the site within one cycle, and it needs no configuring at all — the
username lives in `scripts/refresh-media.mjs` as `DEFAULT_LETTERBOXD_USER`.
The X and LinkedIn lanes cost money per call, so they ride a slower clock;
see [Social posts](#social-posts) below.

Two details in that workflow are load-bearing:

- **It dispatches the deploy itself.** A push authenticated with
  `GITHUB_TOKEN` deliberately does not start another workflow run, so
  `deploy.yml` — which triggers on push — never sees the snapshot commit.
  `workflow_dispatch` is the documented exception, so the refresh job calls it
  explicitly. Remove that step and the commits keep landing while the
  published site quietly stops changing.
- **A feed that fails keeps its last-known items.** `refresh-media.mjs`
  carries a failed feed's contribution forward from the previous snapshot
  (and treats a `200` that yields zero items as a failure, since that is
  nearly always an error page rather than an emptied diary). Without it, one
  letterboxd hiccup while another feed succeeded would drop every film and
  delete every mirrored poster.

Run it by hand with `npm run refresh-media`, or from the Actions tab. Optional
repo secrets, none required:

| Secret | Purpose |
|---|---|
| `LETTERBOXD_USER` | Point the film log at a different account |
| `SUBSTACK_RSS_URL` | Substack feed URL once the newsletter exists |
| `ANYAPI_KEY` | Recent X **and** LinkedIn posts via [AnyAPI](https://getanyapi.com) — one key, both lanes |
| `X_HANDLE` | Point the X feed at a different handle (defaults to `DEFAULT_X_HANDLE`) |
| `LINKEDIN_PROFILE_URL` | Point the LinkedIn feed at a different profile (defaults to `DEFAULT_LINKEDIN_URL`) |
| `X_BEARER_TOKEN` + `X_USER_ID` | Recent posts via X's own API — fallback, only read when `ANYAPI_KEY` is unset |

### Social posts

One `ANYAPI_KEY` lights up both social lanes without an X developer plan:
`twitter.user_posts` for the X account's Posts tab, and
`linkedin.profile_posts_full` for the LinkedIn profile. Both land in the
library as `post` items, so the **POSTS** chip shows them together.

Neither is free, and unlike letterboxd's RSS they bill per call — X a flat
$0.00075, LinkedIn ~$0.0195 because it charges per post returned. Since
neither account posts more than a few times a week, refetching them on all
twelve of the day's cycles would spend ~$7 a month re-reading identical data.
**They refresh twice a week instead** — Monday and Thursday at 06:17 UTC —
and carry their items forward untouched on every other cycle, which costs
about **18¢ a month** for the pair. Letterboxd keeps its two-hour cadence.
`ANYAPI_ALWAYS=1` forces a fetch, which is what a manual run wants:

```bash
ANYAPI_KEY=... ANYAPI_ALWAYS=1 npm run refresh-media
```

Neither lane republishes anyone else's words. An X repost (`RT @…`) is
dropped outright, and a LinkedIn quote post keeps only the author's own
`text` — never the `repostText` of whoever was quoted. The t.co shortlink X
appends for attached media is stripped, since left in it becomes the
headline; that rule is applied to X alone, because a trailing shortlink in a
LinkedIn post is something the author actually typed. X exposes no media URLs
at all, so those posts land without a thumbnail; LinkedIn images (and a
video's poster frame) are mirrored into `public/media/thumbs/` like any other.

Only ever one feed is registered under the name `x`: AnyAPI when the key is
present, X's own API otherwise. The name doubles as the `source` its items
carry and carry-forward reclaims a failed feed by matching it, so a second
`x` would double-count every post and restore the wrong half after a failure.

## Type

Set in **Zodiak** (Indian Type Foundry, via Fontshare), **Tanker**
(Indian Type Foundry, via Fontshare), **Newsreader** (Production Type),
**Apfel Grotezk** (Collletttivo), and **Server Mono** (Internet Development
Studio Co.). All licenses permit self-hosted web embedding; files live in
`public/fonts`.

## Paper

White `#FFFFFF`. Ink `#0E0E0C`. One red: `#D7261E`. Hairlines at 14% ink.
No gradients. The book's lighting does the shading.
