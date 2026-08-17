# AGENTS.md

## Cursor Cloud specific instructions

This repository is a single-service, client-only Vite + React + TypeScript site
(Alan Tai, Issue No. 01) — an interactive WebGL "book". There is no backend,
database, or Docker; everything runs in the browser off the Vite dev server.

Standard commands are documented in `README.md` and `package.json` `scripts`.
Use those as the source of truth:

- `npm run dev` — dev server at http://localhost:5173 (the one service to run)
- `npm run lint` — ESLint
- `npm test` — Vitest (jsdom); tests live under `tests/`
- `npm run build` — `tsc -b` type-check + Vite bundle + `scripts/build-feeds.mjs`

Non-obvious notes:

- The `postinstall` hook (`scripts/patch-html-to-image.mjs`) patches the pinned
  `html-to-image@1.11.13` to preserve exact font metrics. It runs automatically
  on `npm install` and is idempotent; a plain `npm install` is all that's needed
  to refresh dependencies. If `html-to-image` is ever bumped, that script throws
  on purpose until the patch is reviewed.
- `npm install` prints an `EBADENGINE` warning because `react-router` requests
  Node `>=22.22.0` while the image ships Node `v22.14.0`. This is only a warning;
  install, lint, test, build, and the dev server all work fine.
- On first load the book shows a brief entry gate that pre-captures all page
  textures (via `html-to-image`) before it becomes interactive, so allow ~8-10s
  before the 3D book responds. Turn pages with the Right/Left Arrow keys, the
  space bar, or by dragging horizontally across the book.
- `npm run refresh-media` and the media-refresh GitHub workflow use optional
  feed secrets (see `README.md`); they are not required — the verified seed keeps
  the library populated without them.
