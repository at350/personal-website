# Field Notes Magazine Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Alan Tai's personal site as a flippable 3D magazine (Field Notes, Issue No. 01) per `docs/superpowers/specs/2026-08-11-field-notes-magazine-design.md`.

**Architecture:** Vite + React 19 SPA. A pure-TS magazine state machine drives CSS-3D sheet transforms; spreads are live HTML components registered in a central issue map that also derives routes, folios, and the TOC. Media library merges a verified seed with build-time feed snapshots.

**Tech Stack:** Vite 7, React 19, TypeScript strict, React Router 7 (library mode), GSAP 3.15 + @gsap/react, motion v13, Zod 4, Vitest 3, ESLint 9, hand-rolled CSS with custom-property tokens. Fonts: Zodiak (Fontshare FFL), Newsreader + Shippori Mincho B1 (@fontsource OFL), Apfel Grotezk (Collletttivo OFL), Server Mono (IDSC OFL).

**Working conventions for every task:**
- Working dir is repo root. The old build was deleted from the worktree (recoverable at commit `8eb2efd`); recovered content/photos live in the scratchpad `prior-build` worktree — copy, never re-scrape.
- Run `npm run lint && npm test` before each commit. Commit after each task: `git add -A && git commit -m "<type>: <summary>"`.
- Every visual element uses tokens from `src/styles/tokens.css` — no raw hex outside that file.
- Vermilion discipline: max one `--shu` accent concept per spread.
- All motion respects `prefers-reduced-motion` (via `motionOK()` helper).

---

### Task 0: Scaffold

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.gitignore`, `vitest.config.ts` (merged into vite config), `src/vite-env.d.ts`.

- [ ] `npm create vite@latest . -- --template react-ts` equivalents by hand (dir not empty): write configs directly.
- [ ] Dependencies: `npm i react react-dom react-router gsap @gsap/react motion zod @fontsource-variable/newsreader @fontsource/shippori-mincho-b1` and dev: `npm i -D vite @vitejs/plugin-react typescript vitest jsdom @testing-library/react @types/react @types/react-dom eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-jsx-a11y globals fast-xml-parser`.
- [ ] `tsconfig`: strict, `"paths": {"@/*": ["./src/*"]}`; vite alias to match.
- [ ] `index.html`: lang en, washi background pre-paint inline style on `<body>` (`background:#fff`), title `Alan Tai — Field Notes`, meta description from spec, favicon `/favicon.svg`.
- [ ] Smoke: `npm run build` passes; `npm run dev` serves; commit `chore: scaffold vite react app`.

### Task 1: Fonts

**Files:** Create `src/styles/fonts.css`, `public/fonts/*.woff2`, `scripts/fetch-fonts.mjs`.

- [ ] Zodiak from Fontshare API (FFL allows self-host): `https://api.fontshare.com/v2/fonts/download/zodiak` (zip) — extract `Zodiak-Black.woff2`, `Zodiak-Bold.woff2`, `Zodiak-BoldItalic.woff2`, `Zodiak-Regular.woff2`, `Zodiak-Italic.woff2`.
- [ ] Apfel Grotezk from `https://github.com/collletttivo/apfel-grotezk` (raw woff2: Regular, Fett, Brukt).
- [ ] Server Mono from `https://github.com/internet-development/www-server-mono` (`ServerMono-Regular.woff2`).
- [ ] Newsreader + Shippori Mincho B1 via @fontsource imports in `main.tsx` (variable newsreader incl. italic axis file; shippori weights 500/700 only).
- [ ] `fonts.css`: `@font-face` blocks, `font-display: swap`, correct `font-weight` ranges. CSS var mapping: `--font-display: 'Zodiak'`, `--font-body: 'Newsreader Variable'`, `--font-ui: 'Apfel Grotezk'`, `--font-mono: 'Server Mono'`, `--font-jp: 'Shippori Mincho B1'` + fallback stacks from spec.
- [ ] Verify each file loads (network tab / `document.fonts.ready` log in dev). Commit `feat: self-hosted editorial font stack`.

### Task 2: Design tokens + base styles

**Files:** Create `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/print-details.css` (grain, rules, marks), import order in `main.tsx`: fonts → tokens → base → print-details.

- [ ] `tokens.css` (`:root`): colors `--void:#FFFFFF; --washi:#F7F3EA; --washi-hi:#FBF9F3; --sumi:#1C1A17; --sumi-2:#2C2925; --gray-warm:#8A857C; --gray-faint:#B8B2A6; --shu:#D9333F;` rhythm `--baseline: 28px;` spacing em-scale `--space-1..6: 0.5/1/2/4/8/16em`; easing `--ease-settle: cubic-bezier(0.16,1,0.3,1); --dur-settle: 750ms; --dur-turn: 800ms;` type scale `--text-body: 17px; --text-meta: 11.5px; --text-dek: clamp(20px,2.2vw,28px); --text-display: clamp(56px,9vw,150px);` layout `--page-ratio: 3 / 4; --gutter: 24px;`.
- [ ] `base.css`: reset (box-sizing, margins), `body { background: var(--void); color: var(--sumi); font: var(--text-body)/1.7 var(--font-body); font-feature-settings: "onum" 1, "liga" 1; }` selection color washi-on-shu; focus-visible 2px `--shu` outline offset 2px; `.mono-label` (mono, 11.5px, tracking .14em, uppercase); `.u-vertical { writing-mode: vertical-rl; text-orientation: mixed; }`.
- [ ] `print-details.css`: `.grain` fixed overlay using inline SVG feTurbulence data-URI at 3% opacity, `pointer-events:none`; hairline rule helpers (`.rule`, `.rule--shu`); `.small-caps`.
- [ ] Commit `feat: design tokens and editorial base styles`.

### Task 3: Content model

**Files:** Create `src/lib/content-types.ts`, `src/lib/content.ts`, `tests/content.test.ts`.

- [ ] Port Zod schemas: `SiteMeta`, `AboutContent` (incl. `photos[]`, `notes[]`), `Project`, `ResumeContent` (entries with `marginalia {label, text, ariaLabel}`), `ContactContent`, `Dispatch`. Export inferred types.
- [ ] Copy recovered data verbatim from `prior-build/lib/content.ts` (adjust only imports). Copy photos: `cp prior-build/public/images/about/*.webp public/images/about/` and project images likewise.
- [ ] Test (write first, watch fail, then port data):
```ts
import { describe, expect, it } from "vitest";
import { about, contact, dispatches, projects, resume, siteMeta } from "@/lib/content";
import { AboutSchema, ContactSchema, DispatchSchema, ProjectSchema, ResumeSchema, SiteMetaSchema } from "@/lib/content-types";
it("all content passes schemas", () => {
  SiteMetaSchema.parse(siteMeta);
  AboutSchema.parse(about);
  ProjectSchema.array().min(5).parse(projects);
  ResumeSchema.parse(resume);
  ContactSchema.parse(contact);
  DispatchSchema.array().min(2).parse(dispatches);
});
it("every resume entry has marginalia (the hover-aside brief requirement)", () => {
  for (const e of resume.entries) expect(e.marginalia.text.length).toBeGreaterThan(10);
});
it("photos exist on disk", async () => { /* fs.access each about.photos[].src under public/ */ });
```
- [ ] Commit `feat: verified content model from recovered data`.

### Task 4: Issue map + folio math

**Files:** Create `src/magazine/issue-map.tsx`, `src/magazine/folio.ts`, `tests/folio.test.ts`.

- [ ] `folio.ts` pure functions:
```ts
export interface SpreadDef { id: string; route: string | null; label: string; runningHead: string | null; kind: "cover" | "spread" | "back"; }
export const spreadPages = (index: number, total: number): [number, number] | null => // cover & back → null, spread k (1-based content spread) → [2k, 2k+1]
export const pageLabel = (index: number, defs: SpreadDef[]): string => // "Cover" | "Pages 4–5" | "Back cover"
export const spreadForRoute = (route: string, defs: SpreadDef[]): number
export const routeForSpread = (index: number, defs: SpreadDef[]): string
```
- [ ] `issue-map.tsx`: ordered `SpreadDef[]`: cover(/), contents(/contents), letter(/about), profile(/profile), features-opener(/projects), project-well(null — reachable by flip; route /projects lands on opener), resume(/resume), library(/library), dispatches(/writing), letters-colophon(/contact + /colophon alias), back(null). Each def also carries `verso: ReactNode`-producing component refs added in later tasks (typed `ComponentType<SpreadFaceProps>`; placeholder `PlaceholderFace` initially — replaced task-by-task, final QA asserts none remain).
- [ ] Tests: folio math (cover null; spread 1 → [2,3]; label strings; route round-trips; TOC page refs match `spreadPages` output). Run fail → implement → pass → commit `feat: issue map and folio arithmetic`.

### Task 5: Engine state machine (pure)

**Files:** Create `src/magazine/engine.ts`, `tests/engine.test.ts`.

- [ ] Pure reducer, no DOM:
```ts
export interface EngineState {
  current: number;            // spread index shown
  sheet: number | null;       // sheet in flight (sheet s = between spread s and s+1)
  progress: number;           // 0..1 flip progress of in-flight sheet
  direction: 1 | -1 | 0;
  dragging: boolean;
  queue: number[];            // riffle targets
}
export type EngineEvent =
  | { type: "DRAG_START"; edge: "fore" | "back" }        // fore = right/next
  | { type: "DRAG_MOVE"; progress: number }
  | { type: "DRAG_END"; velocity: number }               // px/ms, sign = direction
  | { type: "TURN"; to: number }                          // TOC/keyboard jump (riffle ≤5 then teleport)
  | { type: "TICK_COMPLETE" };                            // spring settled
export function reduce(s: EngineState, e: EngineEvent, total: number): EngineState
export const COMMIT_THRESHOLD = 0.35; export const VELOCITY_BIAS = 0.4; // |v|>0.4 commits regardless
```
Rules to encode + test: bounds (no fore-turn at last, no back-turn at cover); DRAG_END commits if `progress > COMMIT_THRESHOLD || velocity beats bias` else rolls back; TURN builds queue of ≤5 intermediate sheets (else `teleport: true` flag consumed by the component as crossfade); TICK_COMPLETE advances `current` and pops queue.
- [ ] ~12 unit tests covering each rule incl. edge spam (double DRAG_START ignored while settling). Fail → implement → pass → commit `feat: magazine engine state machine`.

### Task 6: Magazine components

**Files:** Create `src/magazine/Magazine.tsx`, `src/magazine/Sheet.tsx`, `src/magazine/useFlipDrag.ts`, `src/styles/magazine.css`.

- [ ] `Magazine.tsx`: renders the book centered in the void; stacked page-edge strata (4 hairline offsets each side scaled by remaining sheet count); maps issue map → `Sheet`s; mounts current ±1 spread faces; keyboard handler (←/→/Home/End, `g` grid, `r` reader); `aria-live` region announcing `pageLabel + label`; moves focus to revealed spread container.
- [ ] `Sheet.tsx`: two absolutely-positioned faces; front face at `rotateY(0)`, back face pre-rotated `rotateY(180deg)`; sheet transform `rotateY(calc(var(--p) * -180deg))` with `transform-origin: left center` on right-stack sheets (mirrored for left); `--p` set via GSAP quickSetter from spring; shading overlays: `.sheet__light` (white sweep, opacity peaks at p≈0.5) and `.sheet__shade` (sumi gradient on trailing half) driven by `--p`; cast shadow div on the static stack `scaleX`-linked to `--p`; back face gets `.ink-showthrough` (next spread's blurred 4% opacity monochrome silhouette via CSS `filter` on a low-res duplicate — CSS only, no canvas).
- [ ] `useFlipDrag.ts`: pointer capture on `.hotzone` corners/edges (88px), maps clientX to progress relative to spine, dispatches engine events; on release starts `gsap.to` spring (`duration ~0.8, ease: "power3.out"` when committing; `elastic.out(1, 0.9)` never — spec says no bounce → use `power2.inOut` rollback); wheel-flick (deltaX or deltaY beyond 40 debounced) turns one spread.
- [ ] Reduced motion: skip springs, 200ms opacity crossfade between spreads (single class toggle).
- [ ] Manual check at this point with two `PlaceholderFace` spreads containing test type + a link: drag from corner — content stays live (link clickable on front face pre-flip), 60fps in devtools performance. Commit `feat: 3d page flip magazine engine`.

### Task 7: Print furniture

**Files:** Create `src/components/furniture/Folio.tsx`, `RunningHead.tsx`, `SealMark.tsx`, `EndMark.tsx`, `Barcode.tsx`, `GridOverlay.tsx`, `DropCap.tsx` (CSS-only helper class ok), `Marginalia.tsx`, `src/styles/furniture.css`, `tests/barcode.test.ts`.

- [ ] `Folio`: props `{page: number; side: "verso"|"recto"}` → verso `04 — FIELD NOTES`, recto `NO. 01 · 2026 — 05`, mono-label style, absolute bottom outer corner; `Folio` renders nothing when `page == null` (full-bleed suppression).
- [ ] `RunningHead`: mono section label top outer, with hairline rule.
- [ ] `SealMark`: inline SVG 40px square kaku-in, `--shu` fill, white "AT" monogram (drawn as two paths, not text, so it never falls back), `transform: rotate(1.5deg)`, turbulence-mask edge roughness, optional `title` a11y.
- [ ] `Barcode`: REAL Code-128B SVG generator, pure function `encode(text: string): number[]` (module widths) — implement the 107-symbol table + checksum. Test: encode `"FIELDNOTES.01"` → verify checksum symbol and quiet zones; snapshot bar count.
- [ ] `EndMark`: ✳ in 14px square, `--shu`, `aria-hidden`.
- [ ] `GridOverlay`: fixed overlay (toggled by `g` / context) drawing 12 columns + 28px baselines (CSS repeating-linear-gradient), crop+registration marks at page corners (SVG), CMYK bar strip; magenta-ish cyan lines at 6% opacity.
- [ ] `Marginalia`: `{label, children}` → `<button aria-expanded>` rendering ✳; note opens on hover (120ms appear-delay, instant exit — transitions.dev tooltip rule), and on click/focus (sticky until Esc/blur); positioned in the outer margin via CSS anchor within the entry row; note style: washi-hi card, hairline rule, mono label, Newsreader italic text, settle-in animation.
- [ ] Commit `feat: print furniture (folio, seal, barcode, grid overlay, marginalia)`.

### Task 8: Cover spread (quality exemplar)

**Files:** Create `src/spreads/Cover.tsx`, `src/styles/spreads/cover.css`.

- [ ] Composition (recto-only visible when closed): washi ground; nameplate `FIELD NOTES` in Zodiak Black stacked two lines flush-left at ~18% page width from left, occupying upper half; the `O` of NOTES carries the vermilion seal tucked into its counter (type-as-image gesture); kicker line above nameplate: mono `the personal magazine of alan tai`; three cover lines lower-left with real page refs (`The annotated resume, p. 12` etc.) each a link that flips; issue line + price gag bottom-left; `Barcode` bottom-right; vertical `野帳` tategaki run along fore-edge in Shippori 500 at 14px, `--gray-warm`.
- [ ] Idle affordances: corner peel breathing (clip-path keyframes 6s loop, pauses on hover, disabled reduced-motion); on first load, masthead letters settle in with masked line-rise (GSAP SplitText chars 40ms stagger, once).
- [ ] Gloss: `.cover-gloss` diagonal white sheen that tracks pointer via CSS vars (subtle, 6% alpha) — the "page gloss" ask.
- [ ] Back cover (`BackCover.tsx`, same task): "FIELD NOTES will return. Issue No. 02, eventually." centered Zodiak Italic, small barcode, motto line `make things that work.` in mono.
- [ ] Compare against mymind cover principles (conceptual, ≤3 hierarchy levels, one accent) before commit `feat: cover and back cover`.

### Task 9: Contents + Masthead spread

**Files:** Create `src/spreads/Contents.tsx`, `src/styles/spreads/contents.css`.

- [ ] Verso = TOC: `CONTENTS` running head; features listed huge (Zodiak Bold 34–44px titles, Newsreader dek, oversized mono folio numbers right-aligned in `--shu` on hover); departments in a tighter 2-col secondary list below a hairline. Rows are buttons → `TURN` to spread (riffle). Hover: 130×170px cover-thumb of the target spread rises (pre-rendered mini layout images NOT screenshots — simple typographic thumbs defined inline) near the cursor column — the index/hover-reveal trend, restrained.
- [ ] Recto = Masthead + editor's note strip: staff list every role = Alan Tai (Editor-in-Chief, Art Director, Fact Checker, Systems, Mailroom…), mono ledger; a 1-sentence "in this issue" dek; the spread's single vermilion instance is the folio numbers hover — seal NOT used here.
- [ ] Commit `feat: contents and masthead spread`.

### Task 10: Editor's Letter + Profile spreads

**Files:** Create `src/spreads/EditorsLetter.tsx`, `src/spreads/Profile.tsx`, css files.

- [ ] Letter verso: running head `THE EDITOR'S LETTER`; drop cap (3-line Zodiak) opening `about.lede` reworked to letter voice (use existing copy verbatim); narrow 34ch column offset right of a wide empty margin (ma); margin holds 2 `Marginalia` asides from `about.notes`; signature: `— alan` in Zodiak Italic + EndMark.
- [ ] Letter recto: headshot photo (aspect frame, washi-hi mat, caption mono "The official version."), fukinsei-offset upward; one `SealMark` as the spread's rakkan bottom-left of photo.
- [ ] Profile verso: oversized Apfel Fett headline `Systems with people still visible inside them.` cropping at the fold (yugen); Q&A fun-facts from remaining `about.notes` + `about.paragraphs` as short numbered entries (jibang ledger style).
- [ ] Profile recto: full-bleed hutong photo (folio suppressed), caption plate bottom-left; remaining photos as 3-up contact-sheet strip on verso bottom with mono captions.
- [ ] Commit `feat: editors letter and profile spreads`.

### Task 11: Projects spreads + Gatefold

**Files:** Create `src/spreads/ProjectsOpener.tsx`, `src/spreads/ProjectWell.tsx`, `src/components/Gatefold.tsx`, css.

- [ ] Opener verso: curtain-raiser — `FEATURES` mono kicker; `Five working prototypes.` Zodiak Black at ~9vw across the page with masked line rise; nothing else (ma).
- [ ] Opener recto: project index — 5 rows (name, discipline, year, recognition marker); hover/focus reveals right-column detail card (summary, stack chips in mono, links); the transitions.dev "texts reveal" pattern.
- [ ] Well spread: Architec (verso) + GreenChain (recto) feature layouts: project image, dek, recognition line in mono with `--shu` asterisk, stack list, Devpost links. `Gatefold`: a visible folded fore-edge flap; click/keyboard unfolds (rotateY half-panels, 700ms) revealing a triple-wide panorama strip: the three remaining projects as annotated catalog cards. Reduced motion: flap becomes an expandable section. Fallback if unfold unsupported: content also reachable in reader mode.
- [ ] Commit `feat: projects feature well with gatefold`.

### Task 12: Resume spread

**Files:** Create `src/spreads/Resume.tsx`, css.

- [ ] BOB rigor: verso = education block + ledger of `resume.entries` grouped (Now / Research / Leadership / Earlier) — each row: org (Apfel Fett 15px), role + dates (mono), one-line summary (Newsreader); hairline rules between; lining figures. Every row's `Marginalia` ✳ sits in the outer margin — hover/tap/focus opens the personal aside (THE brief's hero feature: verify keyboard + touch).
- [ ] Recto = recognition (3 entries, numbered 01–03, note lines) + a one-line instruction in mono: `hover any ✳ for the margin notes` + EndMark.
- [ ] Commit `feat: annotated resume spread with hover marginalia`.

### Task 13: Media pipeline

**Files:** Create `src/lib/media/types.ts`, `src/lib/media/seed.ts`, `src/lib/media/normalize.ts`, `src/lib/media/store.ts`, `scripts/refresh-media.mjs`, `.github/workflows/refresh-media.yml`, `src/lib/media/live.json` (checked-in snapshot, initially `{"items":[]}`), `tests/media.test.ts`.

- [ ] Port `MediaItemSchema` + seed verbatim from prior build (X fallbacks, curated, local photos).
- [ ] `normalize.ts`: `fromLetterboxdRss(xml) : MediaItem[]` (fast-xml-parser; kind "film", extract title/year/rating/poster from letterboxd RSS structure), `fromSubstackRss(xml)`, `fromXApi(json)`. Each wrapped in try→[] (never throw).
- [ ] `store.ts`: `loadMedia(): MediaItem[]` = dedupe(seed ⊕ live.json), sort publishedAt desc, seed wins collisions; client revalidate: `fetch('/api/media').then(merge).catch(noop)`.
- [ ] `refresh-media.mjs`: reads env (`LETTERBOXD_USER`, `SUBSTACK_RSS_URL`, `X_BEARER_TOKEN`+`X_USER_ID`), fetches present ones, writes `live.json`. Action: daily cron, runs script, commits if changed (document required repo secrets in README).
- [ ] Tests with fixture XML files (letterboxd + substack minimal samples in `tests/fixtures/`): normalizers produce valid items; malformed XML → `[]`; store dedupe/sort; seed-wins rule.
- [ ] Commit `feat: self-updating media pipeline with verified seed`.

### Task 14: Library spread

**Files:** Create `src/spreads/Library.tsx`, `src/components/MediaWall.tsx`, css.

- [ ] Popeye-density catalog: CSS-columns masonry (3 cols/page), items as index-numbered plates: mono index `018-04`, kind tag, title (Apfel 14px), source/author line, excerpt (Newsreader 13px) or poster/thumb image; films get star glyphs; X posts styled as clipped tickets. Filter chips (All / Posts / Articles / Films / Video / Photos) in the running-head row — blur text swap on count change (transitions.dev). Verso+recto continuous flow (columns split across faces).
- [ ] Item hover: settle-lift 2px + hairline turns `--shu`; whole plate is the link.
- [ ] Commit `feat: popeye-density auto-updating library`.

### Task 15: Dispatches + reading pages

**Files:** Create `src/spreads/Dispatches.tsx`, `src/routes/WritingPage.tsx`, css.

- [ ] Spread: FOB shorts grid of `dispatches` (status stamp, title Zodiak 26px, dek, "read → p.16+" jump line); `also coming to substack` mono footnote. Each opens `/writing/:slug`.
- [ ] `WritingPage`: single-page reading layout OVER the void (magazine stays beneath at 6% scale-down, dimmed — expand-from-thumbnail feel via shared element `view-transition-name` when supported, else motion crossfade): 58ch column, drop cap, EndMark, "return to the issue" link flips back to Dispatches.
- [ ] Commit `feat: dispatches and reading pages`.

### Task 16: Letters + Colophon spread

**Files:** Create `src/spreads/Letters.tsx`, css.

- [ ] Verso `LETTERS TO THE EDITOR`: contact ledger numbered 01–06 (email first, display text + mono href line); invitation dek: `Send a note, a link, or a strange problem.`; mailto is plain link (no form — no backend; error-shake pattern not needed).
- [ ] Recto `COLOPHON`: set-in credits exactly per licenses (Zodiak — Indian Type Foundry via Fontshare; Newsreader — Production Type; Apfel Grotezk — Collletttivo; Server Mono — Internet Development Studio; Shippori Mincho B1 — FONTDASU); paper stock hexes; `Printed by Vite + React on <host>`; issue date; grid overlay toggle link; `SealMark` rakkan closing the issue.
- [ ] Commit `feat: letters and colophon`.

### Task 17: Reader mode + responsive

**Files:** Create `src/routes/ReaderView.tsx`, `src/magazine/useViewportMode.ts`, css.

- [ ] `useViewportMode(): "book" | "single" | "reader"` — ≥900px book; 600–900 single-page book; <600 or reduced-motion-preferring users get reader (user-overridable both ways via toggle persisted in localStorage).
- [ ] Spread components already accept `mode: "book" | "reader"`; ReaderView renders all spreads vertically as sections with running-head sticky labels, folio marks in margins, magazine-strip header (mini cover + `open as magazine` toggle where mode allows).
- [ ] Manual: iPhone-width check of every section. Commit `feat: reader mode and responsive strategy`.

### Task 18: Routes, meta, feeds

**Files:** Create `src/routes/router.tsx`, `src/routes/NotFound.tsx`, `src/lib/meta.ts`, `scripts/build-feeds.mjs` (rss+sitemap into `dist/`), modify `package.json` build script.

- [ ] Router maps issue-map routes → `Magazine` initialSpread (via `spreadForRoute`); `/colophon` aliases letters spread; `/reader` route; 404: `This page fell out of the binding.` + return-to-cover.
- [ ] `meta.ts`: per-route title/description/OG (react side-effect on navigation — plain `document.title` + meta swap util, no helmet dep); static `og.png` (export of cover composition, generated during Task 20 visual pass via browser screenshot at 1200×630).
- [ ] `build-feeds.mjs`: writes `rss.xml` (dispatches) + `sitemap.xml` post-build.
- [ ] Commit `feat: routes, meta, rss and sitemap`.

### Task 19: Motion polish

**Files:** Modify spread css/components; create `src/lib/motion.ts` (`motionOK()`, shared settle variants, SplitText helper with mask lines + autoSplit + cleanup).

- [ ] Sweep: every spread's entrance choreography on turn-complete (settle stagger 60ms, max 5 elements participate); folio digit-reel on page change (Number pop-in pattern); TOC hover thumbs; cover gloss tracking; gatefold shadow during unfold; `document.startViewTransition` wrapper for route-level jumps when available.
- [ ] Audit against spec: ONE motif; nothing bounces; reduced-motion path visits every feature. Commit `feat: motion choreography pass`.

### Task 20: QA + visual iteration

**Files:** Modify as needed; create `README.md` (run/build/refresh-media/secrets docs), `public/og.png`, `public/favicon.svg`.

- [ ] `npm run lint` clean; `npm test` green; `npm run build` clean; bundle check (`dist/assets` — JS <380KB gz budget incl. GSAP).
- [ ] Browser pass: screenshot every spread (book + reader + mobile), keyboard-only walkthrough, Voiceover spot-check landmarks/announcements, reduced-motion emulation pass, Safari check via responsive design mode caveats list.
- [ ] Compare each spread against: mymind cover taste, Gentlewoman/Popeye/Eye reference roles per spread, jibang copy economy. Iterate until no spread is the weakest.
- [ ] Final commit `feat: field notes issue no. 01`.

---

## Self-review

**Spec coverage:** cover/TOC/letter/profile/projects+gatefold/resume+marginalia/library+pipeline/dispatches+substack/contact/colophon/back cover — Tasks 8–16 ✓; engine+physics+gloss Task 6+8 ✓; folios/jump-lines/barcode/seal/grid overlay Task 7 ✓; routes/OG/rss Task 18 ✓; reader+responsive+reduced-motion Task 17 ✓; auto-update Task 13 ✓; fonts/licenses Task 1+16 ✓; tests Tasks 3,4,5,7,13 + QA 20 ✓.
**Placeholders:** `PlaceholderFace` is an explicit scaffolding device removed by Task 16; final QA asserts none remain — intentional, not a gap.
**Type consistency:** `SpreadFaceProps { mode }` used by Tasks 4,9–17; engine event names consistent across 5/6; `MediaItem` shared 13/14. Folio suppression prop verified between Tasks 7 and 10 (full-bleed recto).
