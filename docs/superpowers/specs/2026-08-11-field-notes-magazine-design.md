# FIELD NOTES — Issue No. 01
## Design spec for Alan Tai's personal site as a flippable magazine
2026-08-11 · status: approved for implementation (user delegated creative direction)

---

## 1. Concept

A one-person magazine. The visitor lands on a stark white void containing a single
object: the cover of **FIELD NOTES**, the personal magazine of Alan Tai — former
newsmagazine editor-in-chief, now a builder. The magazine opens and turns with
real page physics. Every spread is a real, live, art-directed HTML page: the
resume has margin notes that open on hover, the library is a dense catalog page
that updates itself, the contents page actually navigates by flipping to the folio.

Voice: jibang.me economy — lowercase warmth, numbered entries, mono metadata,
almost no copy. Print credibility: the folio system, drop caps, end marks, and
colophon are done *for real*, because designers check.

Japanese restraint: the magazine is washi paper and sumi ink with exactly one
vermilion accent per view. Space (ma) is a design element. Motion is seijaku —
slow, certain, no bounce.

## 2. Approaches considered

**A. WebGL book (three.js skinned-mesh page bend).** Most physically beautiful
flip. Rejected: page content becomes textures — documented blurry text near the
spine, and links/hover/selection/screen readers all die. The resume marginalia
and live library are the heart of the brief; they must be real DOM.

**B. Custom DOM page-flip engine — CSS 3D sheets + spring drag (CHOSEN).**
Each sheet is a real HTML element rotating about the spine with two live faces,
drag-to-turn with spring physics, bend illusion via animated gradient light/shadow
+ corner peel. 100% live content, accessible, 60fps (transform/opacity only),
works on all 2026 browsers. This is what StPageFlip proves possible; we build our
own (~500 lines) because the library is unmaintained and clones DOM in portrait.

**C. Flat editorial site with page-turn-flavored view transitions.** Safest,
fastest. Rejected as the primary experience: the brief's core wish is the 3D
magazine object. (C survives as our reduced-motion / mobile fallback — which we
must build anyway.)

Libraries: GSAP 3.15 (free incl. SplitText/Flip/ScrollTrigger) for choreography,
`motion` v13 for presence/micro-interactions, transitions.dev free patterns as
micro-interaction vocabulary. **No turn.js** (non-commercial license), no Lenis
(no long scroll pages inside a magazine; avoids the "Awwwards house style").

## 3. Design language

### Type (all licenses verified free for self-hosted web)
| Role | Face | Source / license |
|---|---|---|
| Masthead + display | **Zodiak** (Black/Bold + italics) | Fontshare, ITF FFL |
| Body + deks | **Newsreader** variable (opsz axis) | @fontsource, OFL |
| Captions, UI, FOB heads | **Apfel Grotezk** (+ Fett, Brukt) | Collletttivo, OFL |
| Folios, metadata, barcode | **Server Mono** | GitHub (IDSC), OFL |
| Japanese accents | **Shippori Mincho B1** (subset: ~20 glyphs) | @fontsource, OFL |

Scale: display 8–13vw clamp; body 17px/1.7 on a 28px baseline rhythm; metadata
11–12px mono, letterspaced caps. Oldstyle figures in prose, lining in tables.
Hierarchy does the work — no colors for emphasis.

### Color
- **Void** (page background around the magazine): `#FFFFFF`, stark.
- **Washi** (paper): `#F7F3EA` base, `#FBF9F3` highlight — warm, never clinical.
- **Sumi** (ink): `#1C1A17` text, `#2C2925` secondary. Never `#000`.
- **Shu** (vermilion): `#D9333F`. THE accent. ≤5% of any view, ideally one
  instance per spread: the seal, a folio rule, the ✳ marginalia markers, hover states.
- Supporting warm grays only (`#8A857C`, `#B8B2A6`). No gradients, no glass.

### Grid
12-column Swiss base per page, snapped to the 28px baseline; deliberately broken
once per spread (fukinsei — one offset element, mass counterweighted by void).
Facing pages share the grid rung-for-rung across the gutter. Library page runs a
denser Popeye-catalog mode. Body measure 50–70ch.

### Motion (one signature motif)
**"The settle"**: elements enter like sheets laid on a desk — small
translate/rotate offset settling with `cubic-bezier(0.16, 1, 0.3, 1)` over
600–900ms, staggered, zero bounce. Headlines use masked line-rise (SplitText,
`mask: 'lines'`). Page turn ~800ms with spring on release. Micro-interactions
borrow transitions.dev vocabulary: digit-reel folio counter, blur text swaps,
appear-delay tooltips, icon swaps, error shake on the contact form.
Everything gated behind `prefers-reduced-motion` (→ 200ms crossfades).

### Print details (the delight list — all shipped)
1. Mirrored verso/recto folios (`04 — FIELD NOTES` / `NO. 01 · 2026 — 05`),
   suppressed on cover + full-bleed pages.
2. Toggleable printer's-proof overlay (baseline + column grid + crop marks +
   registration marks + CMYK bar) — keyboard `g`, and a colophon link.
3. 3-line drop caps with small-caps lead-in on feature openers.
4. Custom end-mark: vermilion ✳-in-square dingbat closing every article.
5. Working jump lines and TOC page numbers that flip to the exact folio.
6. Cover barcode (real Code-128 SVG encoding the site URL) + price gag
   (`$0.00 · priceless`).
7. Gutter shadow + stacked page-edge strata on the closed book; page gloss
   sweep on the turning sheet.
8. A vermilion kaku-in seal (AT monogram, 1.5° rotation, impression texture)
   placed as rakkan — one per spread max, position varies with the composition.
9. Tategaki accents: vertical `野帳` (field notebook) on the spine/cover edge,
   vertical section labels in outer margins (`writing-mode: vertical-rl`).
10. Paper grain (tiled SVG feTurbulence at ~3% opacity) + faint ink
    show-through of the next page at the sheet's back face.

## 4. The issue map (flatplan)

Pages are numbered for real; cover unnumbered; verso even / recto odd.

| Spread | Folio | Content |
|---|---|---|
| COVER | — | Nameplate FIELD NOTES; kicker "the personal magazine of Alan Tai";
type-as-image cover art (kinetic masthead, vermilion seal); 3 cover lines with
page refs; issue line `NO. 01 · CUPERTINO, CALIF. · EST. 2026`; barcode. Idle corner peel invites the turn. |
| 02–03 | CONTENTS / MASTHEAD | TOC as designed object: features large (title,
dek, oversized folio), departments in tight secondary column; hover a row → cover-thumb
reveal. Masthead staff list gag: every role (Editor-in-Chief … Mailroom) = Alan Tai. |
| 04–05 | THE EDITOR'S LETTER | About, part 1. Drop cap, single narrow column,
signature; recto: headshot with caption "The official version." Marginalia notes
(geocache design, fire hydrants, Mandarin) as ✳ hover asides in the margin. |
| 06–07 | THE PROFILE | About, part 2 — Gentlewoman-style. Full-bleed China
photo recto (folio drops out), oversized grotesk headline verso, Q&A-as-fun-facts,
remaining photos as a contact-sheet strip with captions. |
| 08–09 | FEATURES: PROJECTS | Curtain-raiser opener (display type only, full
washi) + project index (typographic list, hover → detail reveal). |
| 10–11 | PROJECT SPREADS | Architec + GreenChain as feature layouts (recognition,
stack, links); Prophis, Vox Vera, TerraBlade as FOB-density shorts. GATEFOLD:
spread unfolds to triple width for the flagship pair's full story. |
| 12–13 | THE ANNOTATED RESUME | BOB service-page rigor: education, the ledger
of roles (Eye-style rules, lining figures), recognition. Every entry has a
vermilion ✳ that opens a margin note on hover/tap/focus ("I got this job via…"
texture). Print-résumé link absent by design — the resume lives here. |
| 14–15 | THE LIBRARY | Popeye-density catalog: masonry of X posts, articles,
videos, films, photos; index numbers, mono annotations, source tags. Auto-updates
(see §6). Filter chips by kind. |
| 16–17 | DISPATCHES | Blog index as FOB shorts; two seed editorial notes;
"also on Substack" cross-link line for when the Substack exists. Each dispatch
opens as its own reading page (route), not a modal. |
| 18–19 | LETTERS / COLOPHON | Contact as "Letters to the editor": email, GitHub,
LinkedIn, X, Devpost, journalism archive as a numbered ledger. Colophon done for
real: set-in credits (typefaces + foundries), paper stock (hex values), "printed
by" (host/stack), issue date, grid-overlay link. |
| BACK COVER | — | House ad gag: "FIELD NOTES will return. / Issue No. 02, eventually."
+ motto + tiny barcode. |

## 5. Architecture

**Stack:** Vite 7 + React 19 + TypeScript (strict). Plain hand-rolled CSS with
design tokens (custom properties) — no Tailwind; the craft is in bespoke
editorial CSS. React Router v7 (library mode). GSAP 3.15 + @gsap/react;
`motion` v13 where declarative presence helps. Zod for content schemas.
Vitest for tests. ESLint 9 + jsx-a11y.

**Semantic routes** (SEO + deep links): `/` (cover), `/contents`, `/about`,
`/profile`, `/projects`, `/resume`, `/library`, `/writing`, `/writing/:slug`,
`/contact`, `/colophon` → each opens the magazine flipped to that spread.
`/reader` = linear reading mode (also the reduced-motion and small-screen mode).
404 = "This page fell out of the binding." Meta/OG per route; build-time
`rss.xml` + `sitemap.xml` via a Vite plugin.

**Components** (each independently testable):
- `MagazineEngine` — sheet state machine, drag physics, keyboard, announcements.
  Knows nothing about content.
- `Sheet` / `PageFace` — one physical sheet, two live faces, shading overlays.
- `spreads/*` — one component per spread, pure content + layout.
- `Folio`, `RunningHead`, `SealMark`, `EndMark`, `Barcode`, `GridOverlay`,
  `DropCap`, `Marginalia` (hover/tap/focus asides), `Gatefold`.
- `MediaWall` — masonry catalog fed by the media store.
- `ReaderView` — the same spread components rendered as a vertical document
  (spread components must be layout-agnostic: they receive a `mode` prop).

**Data:** `lib/content.ts` (recovered, verified personal content — about,
projects, resume + marginalia, contact, dispatches) validated by Zod schemas in
`lib/content-types.ts`. Media items in `lib/media/` (types, seed, normalizers).

## 6. Media pipeline (auto-update without a server)

Static-host-friendly dual path:
1. **Build-time snapshot:** `scripts/refresh-media.mjs` fetches configured feeds
   — Letterboxd RSS (`LETTERBOXD_USER`), Substack RSS (`SUBSTACK_RSS_URL`), X via
   API only if `X_BEARER_TOKEN` set — normalizes with Zod, merges with the
   verified seed (seed wins on id collision), writes `lib/media/live.json`.
   A documented GitHub Action (`.github/workflows/refresh-media.yml`, daily cron)
   runs it and commits, so the deployed site updates itself.
2. **Runtime enhancement:** if `/api/media` responds (optional Cloudflare Pages
   Function included but not required), the client revalidates after load.
Failures never break the page: seed is always present, sources are labeled,
excerpts stay verbatim-or-absent (no invented quotes — journalism rules).

## 7. Magazine engine spec

- Sheets: `spreads[]` → sheet k has front = recto of spread k, back = verso of
  spread k+1. Absolute positioning, `transform-origin: left center` (right stack),
  `rotateY(-180deg → 0)`; faces use `backface-visibility: hidden`, explicit
  rotate + 1px translateZ (Safari-safe, no deep preserve-3d nesting).
- Drag: pointer capture on 88px corner/edge hotzones (+ whole-page grab on the
  turning sheet); progress = f(pointerX); release → spring to 0/1, commit
  threshold 0.35 biased by velocity. Wheel-flick and swipe also turn.
- Bend illusion: two gradient overlays (light sweep + self-shadow) keyed to
  progress via CSS custom property; moving cast shadow on static pages;
  subtle scaleX easing mid-flip; idle corner-peel (clip-path) breathing on the cover.
- Keyboard: ←/→ turn, Home cover, End back cover, `g` grid overlay, `r` reader.
  TOC jumps: riffle (fast sequential turns, 120ms each, capped at 5 sheets then
  crossfade). Focus moves to revealed spread; `aria-live="polite"` announces
  "Pages 4–5 of 20 · The Editor's Letter".
- Mount policy: current spread ±1 mounted; others lazy. `will-change` only while
  turning. Target: 60fps at 1440p.
- Small screens (<900px) and reduced-motion: ReaderView — the same spread
  components stacked as fixed-aspect printed pages with folios and running
  heads, magazine-strip header, deep links scroll to their spread. (Decision
  revision 2026-08-11: the intermediate single-page book mode was cut — the
  stacked reader preserves the design 1:1 with zero DOM cloning and no second
  layout system.) Users on wide screens can switch modes both ways; the
  preference persists.

## 8. Assets

- 5 recovered personal photos (headshot, hutong, Great Wall, Hangzhou, Shanghai),
  re-encoded webp, already metadata-free. Two project webp images.
- Everything else is designed, not generated: SVG grain, Code-128 barcode
  generator, seal (SVG with turbulence-roughened alpha), end-mark dingbat,
  crop/registration marks, favicon (vermilion seal), OG image (cover render).
- No AI-generated imagery: the cover is type-as-image (mymind taste: conceptual
  typographic covers), and real photos beat synthetic ones (user's own rule).

## 9. Accessibility & performance

Real `<section>`s in document order; flip is presentational. Full keyboard path;
visible focus (vermilion); marginalia open on hover *and* click *and* focus,
dismiss on Esc. Reduced motion honored everywhere. Contrast: sumi on washi
≈ 13:1. Fonts subset (Shippori to used glyphs; Zodiak/Newsreader latin), `font-display: swap`,
total font budget <320KB. Images lazy + `decoding="async"`. No layout thrash:
transforms only. Lighthouse targets: Perf ≥90 (desktop), A11y 100, SEO ≥95.

## 10. Testing

- Vitest: content schema validation; media normalizers (fixture RSS/JSON →
  normalized items; failure → seed fallback); engine reducer state machine
  (turn/drag-commit/riffle/bounds); folio math (spread ↔ page numbers ↔ routes).
- Rendered smoke test: build output contains every route's HTML shell + meta.
- Manual visual pass (task #10): every spread screenshotted desktop + mobile,
  compared against reference principles; iterate.

## 11. Out of scope / future

Substack ingestion beyond RSS; X API polling infra (token not present); CMS;
dark mode (the object is paper — a "reading lamp" dim of the void may come in
Issue 02); HTML-in-Canvas WebGL enhancement (Chrome-only origin trial).

## Self-review notes

Placeholders: none. Consistency: folio numbers in §4 align with routes in §5 and
the TOC/jump-line requirement in §3; engine sheet model matches spread count.
Scope: one implementation plan is feasible; the gatefold and printer's-proof
overlay are the two highest-risk flourishes — both degrade gracefully (gatefold
falls back to a normal wide spread; overlay is additive). Ambiguity: "Blog vs
Substack" resolved as on-site dispatches + cross-link (user: "not sure how that
would work" → we chose the self-owned option that can syndicate later).
