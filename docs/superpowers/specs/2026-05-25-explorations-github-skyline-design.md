# Explorations → Live GitHub Contribution Skyline

**Date:** 2026-05-25
**Status:** Approved design, pending implementation plan
**Branch context:** `feat/hero-restyle-and-copy` (or a new feature branch)

## Problem

The current `Explorations` section ([src/components/Explorations.tsx](../../../src/components/Explorations.tsx)) is a 300vh-tall, scroll-scrubbed section that draws a **hardcoded SVG** "megastructure" (foundation diamond → 4 columns → 2 plates → 4 nodes) as you scroll, plus a "GitHub ↗" link. It is pure decoration: the geometry is fixed coordinates, not data; it consumes three full viewports of scroll to deliver a drawing animation and one outbound link; and it is redundant with the Projects/`SelectedStructures` section, which already presents real work. It is the one section that conveys no information about the person.

## Goal

Replace the decorative section with something that is **both useful and technically impressive**: a live, interactive 3D visualization of real GitHub data. Fuse "live data" (content) with "interactive WebGL" (medium). The existing "watch a structure assemble" promise becomes literal — the structure is the real commit history.

## Concept

Render the **365-day GitHub contribution graph as a 3D skyline** on the site's dark canvas:

- Each tower = one day. Height ∝ commits that day, **log-scaled and capped** so a huge day doesn't dwarf the field.
- Color ramps along the existing teal `--accent` token, matching the site palette.
- On scroll-into-view, towers **rise from the ground in a sweep across the weeks** — delivering the "structure assembling" beat from real data.
- After assembly it becomes an interactive toy: **drag to orbit**, hover a tower to read its date + count.

## Decisions (locked during brainstorming)

1. **Purpose:** fusion of live GitHub data + interactive WebGL (not a static repo grid, not a generic playground).
2. **Visual concept:** contribution skyline (chosen over hybrid repo-landmarks and force-directed repo constellation).
3. **Engine:** Three.js via `@react-three/fiber` + `@react-three/drei` (chosen over hand-rolled WebGL and CSS/SVG 2.5D), **lazy-loaded** so it never touches first paint.
4. **Data freshness:** build-time bake refreshed daily via CI cron (not real-time client fetch). ★ Approved.
5. **Layout:** drop the 300vh pinned scroll; section becomes normal viewport height with free orbit interaction. ★ Approved.
6. **Secret:** user creates a read-only fine-grained PAT and adds it as a repo secret. ★ Approved.

## Data + freshness

- **Source:** GitHub GraphQL `user(login: "at350").contributionsCollection.contributionCalendar` for the last year → `{ date, contributionCount }` per day, plus `totalContributions`.
- **Mechanism — build-time bake:** `scripts/fetch-github.mjs` runs in the Pages deploy workflow, authenticates GraphQL with a **read-only PAT** from a repo secret (e.g. `GH_READ_TOKEN`), and writes `src/data/contributions.json` (committed to the repo). The site reads static JSON at runtime.
  - Rationale: no token in the browser; no 60-req/hr unauthenticated rate limit; the contribution calendar is unavailable via the unauthenticated REST API but accessible via authenticated GraphQL.
- **"Live" = rebuilt daily:** add a `schedule:` cron to the deploy workflow so it re-fetches and redeploys once per day. Daily granularity is appropriate for a contribution graph.
- **Failure safety:** if the fetch fails or the secret is absent, the build keeps the last committed `contributions.json`. The build never breaks and the section never ships empty. A committed sample JSON exists from day one so local dev and the first build work without the secret.
- **User action item:** create a fine-grained PAT (read-only, public data scope sufficient for the contribution calendar) and add it as the repo secret. Exact steps to be documented in the implementation.

## Rendering (react-three-fiber + drei)

- **Geometry:** a single `InstancedMesh` for all ~371 day-towers (53 weeks × 7 days) = one draw call. Per-instance transform sets x/z by week/weekday grid position and y-scale by commit height; per-instance color by intensity.
- **Lazy loading:** the entire Three.js scene (`Skyline.tsx`) is behind a dynamic `import()` gated by an `IntersectionObserver`. The 3D bundle downloads only when the section nears the viewport. First paint and the rest of the site are unaffected.
- **Camera / controls:** constrained `OrbitControls` (drei) — polar angle clamped so the camera can't flip under the floor. Gentle idle auto-rotate that stops on user interaction. **Drag = orbit; scroll-zoom disabled** so page scrolling is never hijacked; pinch-zoom enabled on touch.
- **Hover:** raycast/instance-id pick → the hovered tower lifts slightly and a label (drei `Html` or DOM tooltip) shows the date and "N contributions."
- **Render loop:** `frameloop="demand"` or visibility-gated so the loop pauses when the section is off-screen; capped device pixel ratio for mobile perf.

## Real utility, on-screen

A DOM overlay (outside the 3D scene) shows stats computed from the same JSON:

- **Total contributions (last year)**
- **Current streak**
- **Busiest day**

This is the concrete information payload — a visitor learns something true at a glance. The "GitHub ↗" CTA to the profile remains.

## Layout change

- Remove the 300vh `min-h` and the GSAP `ScrollTrigger` pin/scrub from `Explorations.tsx`.
- Section becomes ~one viewport tall: section header + copy + interactive skyline + stats overlay.
- Keep the `EXPLORATIONS` eyebrow pattern (`h-px w-8` rule + mono uppercase label).
- Heading stays **"The build"** (now literal). Paragraph copy updates to reference the live numbers, e.g. "Every tower is a day I shipped — {total} contributions this year. Drag to orbit."

## Accessibility & fallbacks (section is never empty)

- **No WebGL / 3D load failure** → render a clean **2D SVG contribution heatmap** (`ContributionHeatmap.tsx`) from the same JSON. Still real and useful, just flat.
- **`prefers-reduced-motion`** (existing [src/lib/useReducedMotion.ts](../../../src/lib/useReducedMotion.ts)) → no auto-rotate, no rise animation; render the final assembled state, still orbitable.
- The `<canvas>` is `aria-hidden`. The stats overlay plus a visually-hidden text summary convey the data to screen readers.
- **Mobile:** touch-orbit, capped DPR and possibly reduced tower detail; stats overlay remains.

## Performance

- Single `InstancedMesh` (one draw call) for all towers.
- 3D bundle lazy-loaded behind IntersectionObserver; never in the initial bundle.
- Capped pixel ratio; render loop paused when off-screen.

## Component / file structure

| File | Role |
|------|------|
| `src/components/Explorations.tsx` | Rewritten: section shell, header/copy, stats overlay, lazy + Suspense boundary, IntersectionObserver gate, SVG fallback wiring. |
| `src/components/skyline/Skyline.tsx` (lazy) | r3f `Canvas` + scene, camera, controls, lighting. |
| `src/components/skyline/TowerField.tsx` | `InstancedMesh` of day-towers; assemble animation; hover/pick state. |
| `src/components/skyline/ContributionHeatmap.tsx` | 2D SVG fallback heatmap. |
| `src/lib/contributions.ts` | Types + helpers: load JSON, grid layout, color ramp, computed stats (total, streak, busiest day). |
| `src/data/contributions.json` | Baked contribution data. Committed; refreshed by CI. Sample seeded initially. |
| `scripts/fetch-github.mjs` | Build-time GraphQL fetch → writes `contributions.json`; no-op-safe on failure. |
| `.github/workflows/*` | Add fetch step before build + daily `schedule:` cron. |
| `package.json` | New deps: `three`, `@react-three/fiber`, `@react-three/drei`. |

## Out of scope (YAGNI)

- Repo constellation / clickable repo landmarks (considered, not chosen).
- Real-time client-side data fetching.
- Per-day click-through actions beyond hover inspection.
- Writing/log feed integration (separate, already stubbed in `content.ts`).

## Open implementation details (resolve in plan)

- Exact PAT scope and whether the default Actions `GITHUB_TOKEN` suffices for reading public `contributionsCollection` (likely needs a separate read-only PAT secret — verify).
- Color-ramp stops and height scale constants (tune visually in preview).
- Streak definition (consecutive days with ≥1 contribution ending today/yesterday).
